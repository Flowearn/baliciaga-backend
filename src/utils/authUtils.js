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
    console.log('[Auth-Microsurgery-verifyToken] 5. Starting token verification...');
    
    // Decode the token to get the header
    const decoded = jwt.decode(token, { complete: true });
    console.log('[Auth-Microsurgery-verifyToken] 6. Decoded token header:', decoded?.header);
    
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Get the signing key
    console.log('[Auth-Microsurgery-verifyToken] 7. Getting JWKS client...');
    const client = getJwksClient();
    const getSigningKey = promisify(client.getSigningKey);
    
    console.log('[Auth-Microsurgery-verifyToken] 8. Fetching signing key for kid:', decoded.header.kid);
    const key = await getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();
    console.log('[Auth-Microsurgery-verifyToken] 9. Got signing key successfully');

    // Verify the token
    const issuer = `https://cognito-idp.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${process.env.USER_POOL_ID || 'ap-southeast-1_N72jBBIzH'}`;
    console.log('[Auth-Microsurgery-verifyToken] 10. Verifying with issuer:', issuer);
    
    const verified = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: issuer
    });
    
    console.log('[Auth-Microsurgery-verifyToken] 11. Token verification successful!');
    return verified;
  } catch (error) {
    console.error('[Auth-Microsurgery-verifyToken] 12. Token verification error:', error.message);
    console.error('[Auth-Microsurgery-verifyToken] 13. Error stack:', error.stack);
    return null;
  }
};

const getAuthenticatedUser = async (event) => {
  console.log('[Auth-Debug] Entering getAuthenticatedUser. Received headers:', JSON.stringify(event.headers, null, 2));
  console.log('[AuthUtils] Processing authentication...');

  // For live environment, trust the claims from the Cognito authorizer
  if (event.requestContext?.authorizer?.claims) {
    console.log('[AuthUtils] Using Cognito authorizer claims');
    return event.requestContext.authorizer.claims;
  }

  // Check for Authorization header in both offline and live environments
  // This handles cases where the API endpoint doesn't have a Cognito authorizer
  const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('[Auth-Microsurgery] 1. Authorization header found:', authHeader);
    
    const token = authHeader.substring(7);
    console.log('[Auth-Microsurgery] 2. Extracted Token string:', token);
    console.log('🔐 [AuthUtils] Verifying JWT token from Authorization header...');
    
    try {
      const claims = await verifyToken(token);
      if (claims) {
        console.log('[Auth-Microsurgery] 3. JWT verification successful. Decoded payload:', claims);
        console.log(`✅ [AuthUtils] JWT verified for user ${claims.sub}`);
        return {
          sub: claims.sub,
          email: claims.email || claims['cognito:username'],
          'cognito:groups': claims['cognito:groups'] || []
        };
      } else {
        console.log('[Auth-Microsurgery] 4. JWT verification returned null (no claims)');
      }
    } catch (error) {
      console.log('[Auth-Microsurgery] 4. JWT verification FAILED. Error:', error);
    }
  }

  // For offline development, also check for test headers (for automated tests)
  const isOfflineMode = process.env.IS_OFFLINE === 'true' || 
                       event.headers?.host?.includes('localhost');
  
  if (isOfflineMode) {
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
  }

  // If no authentication information is found
  console.warn('[AuthUtils] Could not determine authenticated user.');
  return null;
};

module.exports = { getAuthenticatedUser }; 