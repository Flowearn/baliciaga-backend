/**
 * 触发一次认证流程以生成CloudWatch日志
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cognito = new AWS.CognitoIdentityServiceProvider();

const CLIENT_ID = '3n9so3j4rlh21mebhjo39nperk';

async function triggerAuth() {
  const testEmail = 'test-logs-' + Date.now() + '@example.com';
  console.log('🔍 触发认证流程，测试邮箱:', testEmail);
  
  try {
    const authResult = await cognito.initiateAuth({
      ClientId: CLIENT_ID,
      AuthFlow: 'CUSTOM_AUTH',
      AuthParameters: {
        USERNAME: testEmail
      }
    }).promise();
    
    console.log('✅ 认证挑战已创建');
    console.log('挑战名称:', authResult.ChallengeName);
    console.log('现在检查CloudWatch日志...');
    
  } catch (error) {
    console.error('❌ 发起认证失败:', error.message);
  }
}

triggerAuth();