const dynamodb = require('./dynamoDbClient');

/**
 * Extract user ID from Lambda event
 * First tries to get userId from Cognito claims, then falls back to database lookup
 * @param {object} event - Lambda event object
 * @returns {string|null} - User ID or null if not found/unauthorized
 */
const getUserId = async (event) => {
  try {
    // Extract Cognito claims from API Gateway authorizer
    const claims = event.requestContext?.authorizer?.claims;
    
    if (!claims || !claims.sub) {
      console.log('❌ Missing or invalid Cognito claims');
      return null;
    }

    const cognitoSub = claims.sub;
    
    // Try to get userId from claims first (if available)
    const userIdFromClaims = claims['custom:userId'] || claims.userId;
    if (userIdFromClaims) {
      console.log(`✅ Found userId in claims: ${userIdFromClaims}`);
      return userIdFromClaims;
    }

    // Fall back to database lookup using cognitoSub
    console.log(`🔍 Looking up userId for cognitoSub: ${cognitoSub}`);
    
    const params = {
      TableName: process.env.USERS_TABLE,
      IndexName: 'CognitoSubIndex',
      KeyConditionExpression: 'cognitoSub = :cognitoSub',
      ExpressionAttributeValues: {
        ':cognitoSub': cognitoSub
      }
    };

    const result = await dynamodb.query(params).promise();
    
    if (!result.Items || result.Items.length === 0) {
      console.log(`❌ User not found for cognitoSub: ${cognitoSub}`);
      return null;
    }

    const userId = result.Items[0].userId;
    console.log(`✅ Found userId in database: ${userId}`);
    return userId;

  } catch (error) {
    console.error('❌ Error getting userId:', error);
    return null;
  }
};

module.exports = { getUserId }; 