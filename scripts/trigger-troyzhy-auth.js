/**
 * 触发troyzhy@gmail.com的认证流程以生成新的CloudWatch日志
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
  const email = 'troyzhy@gmail.com';
  const timestamp = new Date().toISOString();
  
  console.log(`🔍 [${timestamp}] 触发认证流程`);
  console.log('测试邮箱:', email);
  console.log('记住这个时间戳，用于在日志中定位:', timestamp);
  
  try {
    const authResult = await cognito.initiateAuth({
      ClientId: CLIENT_ID,
      AuthFlow: 'CUSTOM_AUTH',
      AuthParameters: {
        USERNAME: email
      }
    }).promise();
    
    console.log('✅ 认证挑战已创建');
    console.log('挑战名称:', authResult.ChallengeName);
    console.log('会话ID:', authResult.Session ? '已获取' : '未获取');
    console.log('\n现在立即检查CloudWatch日志...');
    
  } catch (error) {
    console.error('❌ 发起认证失败:', error.code, '-', error.message);
    console.error('详细错误:', error);
  }
}

triggerAuth();