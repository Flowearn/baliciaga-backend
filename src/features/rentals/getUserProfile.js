const dynamodb = require('../../utils/dynamoDbClient');
const { sendResponse } = require('../../utils/sendResponse');
const { getAuthenticatedUser } = require('../../utils/authUtils');

module.exports.handler = async (event) => {
  // --- 新增的、决定性的诊断日志 ---
  console.log("!!! Verifying Table Name !!! The value of process.env.USERS_TABLE is:", process.env.USERS_TABLE);

  try {
    const claims = await getAuthenticatedUser(event);
    
    if (!claims || !claims.sub) {
      return sendResponse(401, { 
        success: false, 
        message: 'Unauthorized: Missing authentication token' 
      });
    }
    
    const cognitoSub = claims.sub;
    const USERS_TABLE = process.env.USERS_TABLE;

    const params = {
      TableName: USERS_TABLE,
      IndexName: 'CognitoSubIndex',
      KeyConditionExpression: 'cognitoSub = :cognitoSub',
      ExpressionAttributeValues: {
        ':cognitoSub': cognitoSub,
      },
    };

    const result = await dynamodb.query(params).promise();

    if (result.Items.length === 0) {
      return sendResponse(404, { success: false, message: 'User profile not found in DB.' });
    }

    return sendResponse(200, { success: true, data: result.Items[0] });

  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return sendResponse(500, { 
      success: false, 
      message: 'Internal server error while fetching user profile.' 
    });
  }
}; 