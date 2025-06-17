/**
 * Retrieves authenticated user claims, supporting both live and offline environments.
 * In offline mode, it dynamically reads user info from custom headers sent by the frontend.
 * @param {object} event - The Lambda event object.
 * @returns {object|null} The user claims object (e.g., { sub, email }) or null if not authenticated.
 */
const getAuthenticatedUser = (event) => {
  // --- 关键诊断日志 (后端部分) ---
  console.log(
    `%c[BACKEND-AUTH-DIAGNOSIS] Received headers:`,
    'color: red; font-weight: bold;',
    JSON.stringify(event.headers, null, 2)
  );
  // -----------------------------------

  // For live environment, trust the claims from the Cognito authorizer
  if (event.requestContext?.authorizer?.claims) {
    return event.requestContext.authorizer.claims;
  }

  // For offline development, simulate authentication using headers
  // Check for both IS_OFFLINE environment and serverless-offline context
  const isOfflineMode = process.env.IS_OFFLINE === 'true' || 
                       event.requestContext?.stage === 'dev' ||
                       event.headers?.host?.includes('localhost');
  
  if (isOfflineMode) {
    const userId = event.headers?.['x-test-user-sub'];
    const userEmail = event.headers?.['x-test-user-email'];

    if (userId) {
      console.log(`🔧 [AuthUtils] OFFLINE MODE: Simulating user ${userId}`);
      return {
        sub: userId,
        email: userEmail || '',
      };
    }
  }

  // If no authentication information is found
  console.warn('[AuthUtils] Could not determine authenticated user.');
  return null;
};

module.exports = { getAuthenticatedUser }; 