/**
 * 检查用户是如何注册的，以及为什么变成了passwordless
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
const email = 'troyzhy@gmail.com';
const cognitoSub = '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9';

async function analyzeRegistrationMethod() {
  console.log('🔍 分析用户注册方式');
  console.log('==================');
  
  try {
    // 1. 获取用户详细信息
    console.log('📋 检查用户详细信息...');
    
    const userResult = await cognito.adminGetUser({
      UserPoolId: USER_POOL_ID,
      Username: cognitoSub
    }).promise();
    
    console.log('用户状态:', userResult.UserStatus);
    console.log('启用状态:', userResult.Enabled);
    console.log('创建时间:', userResult.UserCreateDate);
    console.log('最后修改时间:', userResult.UserLastModifiedDate);
    
    // 2. 分析用户属性
    console.log('\n📋 用户属性分析...');
    userResult.UserAttributes.forEach(attr => {
      console.log(`  ${attr.Name}: ${attr.Value}`);
    });
    
    // 3. 测试不同的注册方式
    console.log('\n📋 测试前端可能使用的注册方式...');
    
    // 测试1: 尝试AdminCreateUser (管理员创建)
    console.log('\n🧪 测试1: AdminCreateUser方式...');
    try {
      await cognito.adminCreateUser({
        UserPoolId: USER_POOL_ID,
        Username: 'test-admin-create@test.com',
        UserAttributes: [
          { Name: 'email', Value: 'test-admin-create@test.com' }
        ],
        TemporaryPassword: 'TempPass123!',
        MessageAction: 'SUPPRESS' // 不发送邮件
      }).promise();
      
      console.log('✅ AdminCreateUser 可以使用 - 这会创建带密码的用户');
      
      // 清理测试用户
      await cognito.adminDeleteUser({
        UserPoolId: USER_POOL_ID,
        Username: 'test-admin-create@test.com'
      }).promise();
      
    } catch (error) {
      console.log('❌ AdminCreateUser 失败:', error.message);
    }
    
    // 测试2: 尝试SignUp (标准注册)
    console.log('\n🧪 测试2: SignUp方式...');
    try {
      await cognito.signUp({
        ClientId: CLIENT_ID,
        Username: 'test-signup@test.com',
        Password: 'TempPass123!',
        UserAttributes: [
          { Name: 'email', Value: 'test-signup@test.com' }
        ]
      }).promise();
      
      console.log('✅ SignUp 可以使用 - 这会创建带密码的用户');
      
      // 清理测试用户
      const users = await cognito.listUsers({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "test-signup@test.com"`
      }).promise();
      
      if (users.Users.length > 0) {
        await cognito.adminDeleteUser({
          UserPoolId: USER_POOL_ID,
          Username: users.Users[0].Username
        }).promise();
      }
      
    } catch (error) {
      console.log('❌ SignUp 失败:', error.message);
    }
    
    // 测试3: 尝试AdminCreateUser without password (passwordless)
    console.log('\n🧪 测试3: AdminCreateUser without password...');
    try {
      const result = await cognito.adminCreateUser({
        UserPoolId: USER_POOL_ID,
        Username: 'test-passwordless@test.com',
        UserAttributes: [
          { Name: 'email', Value: 'test-passwordless@test.com' }
        ],
        MessageAction: 'SUPPRESS' // 不发送邮件
        // 注意：没有设置 TemporaryPassword
      }).promise();
      
      console.log('✅ AdminCreateUser without password 可以使用');
      console.log('用户状态:', result.User.UserStatus);
      console.log('这可能就是前端使用的方式！');
      
      // 清理测试用户
      await cognito.adminDeleteUser({
        UserPoolId: USER_POOL_ID,
        Username: 'test-passwordless@test.com'
      }).promise();
      
    } catch (error) {
      console.log('❌ AdminCreateUser without password 失败:', error.message);
    }
    
    // 4. 分析当前用户的MFA状态
    console.log('\n📋 检查用户MFA和认证方式...');
    
    try {
      const mfaResult = await cognito.adminGetUserAuthEvents({
        UserPoolId: USER_POOL_ID,
        Username: cognitoSub,
        MaxResults: 10
      }).promise();
      
      console.log('最近的认证事件:');
      mfaResult.AuthEvents.forEach((event, index) => {
        console.log(`  事件 ${index + 1}:`);
        console.log(`    类型: ${event.EventType}`);
        console.log(`    风险: ${event.EventRisk}`);
        console.log(`    时间: ${event.CreationDate}`);
        console.log(`    响应: ${event.EventResponse}`);
        
        if (event.EventContextData) {
          console.log(`    设备: ${event.EventContextData.DeviceName || '未知'}`);
          console.log(`    IP: ${event.EventContextData.IpAddress || '未知'}`);
        }
      });
      
    } catch (error) {
      console.log('无法获取认证事件:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 分析注册方式时出错:', error.message);
  }
}

async function checkPasswordStatus() {
  console.log('\n🔍 检查用户密码状态');
  console.log('==================');
  
  try {
    // 尝试检查用户是否有密码
    console.log('📋 测试用户是否有密码...');
    
    try {
      await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: cognitoSub,
          PASSWORD: 'anypassword123'
        }
      }).promise();
      
      console.log('❌ 意外成功 - 用户可能有默认密码');
      
    } catch (error) {
      if (error.code === 'NotAuthorizedException') {
        if (error.message.includes('Incorrect username or password')) {
          console.log('✅ 用户有密码设置，但我们不知道是什么');
        } else if (error.message.includes('User does not exist')) {
          console.log('❌ 用户不支持密码登录（passwordless only）');
        }
      } else if (error.code === 'InvalidParameterException') {
        console.log('❌ 用户没有密码设置，只能使用passwordless');
      } else {
        console.log('🤔 其他错误:', error.code, '-', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ 检查密码状态时出错:', error.message);
  }
}

async function run() {
  await analyzeRegistrationMethod();
  await checkPasswordStatus();
  
  console.log('\n💡 分析结论');
  console.log('==========');
  console.log('1. 用户是在 2025-06-20 创建的，不是历史账户');
  console.log('2. 可能的原因：');
  console.log('   - 前端使用了 AdminCreateUser without password');
  console.log('   - 或者使用了其他passwordless注册方式');
  console.log('   - 原有账户可能已被删除或在不同的环境');
  console.log('3. 建议：');
  console.log('   - 检查前端注册代码');
  console.log('   - 检查是否有多个环境（dev/prod）');
  console.log('   - 考虑为用户设置密码以支持密码登录');
}

run()
  .then(() => {
    console.log('\n✨ 分析完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 分析失败:', error);
    process.exit(1);
  });