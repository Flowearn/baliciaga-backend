const { sendResponse } = require('../../utils/sendResponse');
const { getUserId } = require('../../utils/getUserId');
const dynamodb = require('../../utils/dynamoDbClient');

exports.handler = async (event) => {
  console.log('🚀 cancelApplication Lambda triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { applicationId } = event.pathParameters;
    const userId = await getUserId(event); // 从 event 中获取当前登录用户的ID

    if (!userId) {
      console.log('❌ Unauthorized: No userId found');
      return sendResponse(401, { 
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    console.log(`🔄 Attempting to cancel application ${applicationId} for user ${userId}`);

    const params = {
      TableName: process.env.APPLICATIONS_TABLE, // 使用正确的环境变量名
      Key: {
        applicationId: applicationId, // 使用正确的主键名
      },
      UpdateExpression: "SET #status = :status, #updatedAt = :updatedAt",
      // 添加条件：确保只有申请的拥有者才能取消它
      ConditionExpression: "applicantId = :userId",
      ExpressionAttributeNames: {
        "#status": "status",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":status": "canceled",
        ":userId": userId,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW", // 返回更新后的项目
    };

    const result = await dynamodb.update(params).promise();
    
    console.log("✅ Successfully canceled application:", result.Attributes);
    return sendResponse(200, {
      success: true,
      message: "Application successfully canceled.",
      data: {
        application: result.Attributes,
      }
    });

  } catch (error) {
    console.error('❌ Error in cancelApplication:', error);

    // 特别处理权限验证失败的情况
    if (error.code === "ConditionalCheckFailedException") {
      console.error("Forbidden: User is not the owner of the application.");
      return sendResponse(403, {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Forbidden. You can only cancel your own applications.'
        }
      });
    }

    // 处理应用不存在的情况
    if (error.code === "ResourceNotFoundException") {
      return sendResponse(404, {
        success: false,
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found.'
        }
      });
    }

    // 通用错误处理
    return sendResponse(500, {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Could not cancel the application.',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
      }
    });
  }
}; 