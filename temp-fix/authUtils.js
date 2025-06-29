/**
 * Retrieves authenticated user claims, supporting both live and offline environments.
 * In offline mode, it dynamically reads user info from custom headers sent by the frontend.
 * @param {object} event - The Lambda event object.
 * @returns {object|null} The user claims object (e.g., { sub, email }) or null if not authenticated.
 */
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { promisify } = require('util');

// Cache for JWKS client
let jwksClientInstance = null;

const getJwksClient = () => {
  if (!jwksClientInstance) {
    const region = process.env.AWS_REGION || 'ap-southeast-1';
    const userPoolId = process.env.USER_POOL_ID || 'ap-southeast-1_N72jBBIzH';
    
    jwksClientInstance = jwksClient({
      jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5
    });
  }
  return jwksClientInstance;
};

const verifyToken = async (token) => {
  try {
    // Decode the token to get the header
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Get the signing key
    const client = getJwksClient();
    const getSigningKey = promisify(client.getSigningKey);
    const key = await getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    // Verify the token
    const verified = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${process.env.USER_POOL_ID || 'ap-southeast-1_N72jBBIzH'}`
    });

    return verified;
  } catch (error) {
    console.error('Token verification error:', error.message);
    return null;
  }
};

const getAuthenticatedUser = async (event) => {
  console.log('[AuthUtils] Processing authentication...');

  // For live environment, trust the claims from the Cognito authorizer
  if (event.requestContext?.authorizer?.claims) {
    console.log('[AuthUtils] Using Cognito authorizer claims');
    return event.requestContext.authorizer.claims;
  }

  // For offline development, check for both test headers and real JWT tokens
  const isOfflineMode = process.env.IS_OFFLINE === 'true' || 
                       event.headers?.host?.includes('localhost');
  
  if (isOfflineMode) {
    // First check for test headers (for automated tests)
    const userId = event.headers?.['x-test-user-sub'];
    const userEmail = event.headers?.['x-test-user-email'];

    if (userId) {
      console.log(`🔧 [AuthUtils] OFFLINE MODE: Using test headers for user ${userId}`);
      return {
        sub: userId,
        email: userEmail || '',
        'cognito:groups': event.headers?.['x-test-user-groups'] ? event.headers['x-test-user-groups'].split(',') : []
      };
    }

    // If no test headers, try to verify the real JWT token
    const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('🔐 [AuthUtils] OFFLINE MODE: Verifying JWT token...');
      
      const claims = await verifyToken(token);
      if (claims) {
        console.log(`✅ [AuthUtils] OFFLINE MODE: JWT verified for user ${claims.sub}`);
        return {
          sub: claims.sub,
          email: claims.email || claims['cognito:username'],
          'cognito:groups': claims['cognito:groups'] || []
        };
      }
    }
  }

  // If no authentication information is found
  console.warn('[AuthUtils] Could not determine authenticated user.');
  return null;
};

module.exports = { getAuthenticatedUser }; 