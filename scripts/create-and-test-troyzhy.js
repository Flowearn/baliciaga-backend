/**
 * 创建troyzhy@gmail.com用户并测试认证流程
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = 'ap-southeast-1_N72jBBIzH';
const CLIENT_ID = '3n9so3j4rlh21mebhjo39nperk';

async function createUserAndTest() {
  const email = 'troyzhy@gmail.com';
  const timestamp = new Date().toISOString();
  
  console.log(`🔍 [${timestamp}] 开始测试流程`);
  console.log('测试邮箱:', email);
  
  // Step 1: Create user if not exists
  console.log('\n📋 步骤1: 创建用户...');
  try {
    const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
    await cognito.adminCreateUser({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' }
      ],
      MessageAction: 'SUPPRESS',
      TemporaryPassword: tempPassword
    }).promise();
    
    // Set permanent password
    await cognito.adminSetUserPassword({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: tempPassword,
      Permanent: true
    }).promise();
    
    console.log('✅ 用户创建成功');
  } catch (createError) {
    if (createError.code === 'UsernameExistsException') {
      console.log('ℹ️ 用户已存在，继续测试');
    } else {
      console.error('❌ 创建用户失败:', createError.message);
      return;
    }
  }
  
  // Step 2: Trigger authentication
  console.log('\n📋 步骤2: 触发认证流程...');
  const authTimestamp = new Date().toISOString();
  console.log('认证时间戳:', authTimestamp);
  
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
    console.log('\n🔍 现在立即检查CloudWatch日志...');
    console.log('在日志中搜索时间戳:', authTimestamp);
    
  } catch (error) {
    console.error('❌ 发起认证失败:', error.code, '-', error.message);
  }
}

createUserAndTest();