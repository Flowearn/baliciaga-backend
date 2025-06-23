/**
 * 检查用户是否可以使用密码登录
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

async function checkUserPasswordCapability() {
  console.log('🔍 检查用户密码登录能力');
  console.log('============================');
  
  try {
    // 首先通过邮箱找到实际的username (cognitoSub)
    const listResult = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    if (listResult.Users.length === 0) {
      console.log('❌ 用户不存在');
      return;
    }
    
    const user = listResult.Users[0];
    const actualUsername = user.Username; // 这是cognitoSub
    
    console.log('✅ 找到用户');
    console.log('邮箱:', email);
    console.log('实际用户名(cognitoSub):', actualUsername);
    console.log('用户状态:', user.UserStatus);
    console.log('创建时间:', user.UserCreateDate);
    console.log('');
    
    // 检查用户属性
    const emailVerified = user.Attributes.find(attr => attr.Name === 'email_verified');
    console.log('邮箱验证状态:', emailVerified?.Value);
    
    // 测试1: 尝试用邮箱做用户名密码登录
    console.log('📋 测试1: 用邮箱作为用户名的密码登录...');
    try {
      await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: email, // 用邮箱
          PASSWORD: 'anypassword123'
        }
      }).promise();
      
      console.log('❌ 意外成功');
      
    } catch (error1) {
      console.log('结果:', error1.code, '-', error1.message);
      
      if (error1.code === 'NotAuthorizedException') {
        if (error1.message.includes('Incorrect username or password')) {
          console.log('✅ 用户存在，支持密码登录，但密码错误');
        } else if (error1.message.includes('Password attempts exceeded')) {
          console.log('⚠️  密码尝试次数过多');
        } else {
          console.log('🤔 其他认证错误');
        }
      } else if (error1.code === 'UserNotFoundException') {
        console.log('❌ 用邮箱作为用户名时用户未找到');
      }
    }
    
    // 测试2: 尝试用cognitoSub做用户名密码登录
    console.log('\\n📋 测试2: 用cognitoSub作为用户名的密码登录...');
    try {
      await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: actualUsername, // 用cognitoSub
          PASSWORD: 'anypassword123'
        }
      }).promise();
      
      console.log('❌ 意外成功');
      
    } catch (error2) {
      console.log('结果:', error2.code, '-', error2.message);
      
      if (error2.code === 'NotAuthorizedException') {
        if (error2.message.includes('Incorrect username or password')) {
          console.log('✅ 用户存在，支持密码登录，但密码错误');
        } else if (error2.message.includes('User does not exist')) {
          console.log('❌ 用户不支持密码登录（可能只支持无密码）');
        }
      } else if (error2.code === 'UserNotFoundException') {
        console.log('❌ 用cognitoSub作为用户名时用户未找到');
      } else if (error2.code === 'InvalidParameterException') {
        console.log('❌ 用户没有密码，只能用无密码登录');
      }
    }
    
    // 测试3: 检查用户是否设置了临时密码
    console.log('\\n📋 测试3: 检查用户密码状态...');
    try {
      const userDetails = await cognito.adminGetUser({
        UserPoolId: USER_POOL_ID,
        Username: actualUsername
      }).promise();
      
      console.log('用户详细状态:', userDetails.UserStatus);
      
      if (userDetails.UserStatus === 'FORCE_CHANGE_PASSWORD') {
        console.log('⚠️  用户需要更改初始密码');
      } else if (userDetails.UserStatus === 'CONFIRMED') {
        console.log('✅ 用户已确认，应该可以正常登录');
      }
      
    } catch (error3) {
      console.log('获取用户详情失败:', error3.message);
    }
    
  } catch (error) {
    console.error('❌ 主要错误:', error.message);
  }
}

async function checkClientConfiguration() {
  console.log('\\n🔧 检查客户端配置');
  console.log('==================');
  
  try {
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const client = clientResult.UserPoolClient;
    console.log('客户端认证流程:', client.ExplicitAuthFlows);
    
    const hasPasswordAuth = client.ExplicitAuthFlows.includes('ALLOW_USER_SRP_AUTH') || 
                          client.ExplicitAuthFlows.includes('ALLOW_ADMIN_USER_PASSWORD_AUTH');
    const hasCustomAuth = client.ExplicitAuthFlows.includes('ALLOW_CUSTOM_AUTH');
    
    console.log('支持密码认证:', hasPasswordAuth ? '✅' : '❌');
    console.log('支持无密码认证:', hasCustomAuth ? '✅' : '❌');
    
    if (hasPasswordAuth && hasCustomAuth) {
      console.log('✅ 客户端同时支持密码和无密码登录');
    } else if (hasCustomAuth && !hasPasswordAuth) {
      console.log('⚠️  客户端只支持无密码登录');
    } else if (hasPasswordAuth && !hasCustomAuth) {
      console.log('⚠️  客户端只支持密码登录');
    }
    
  } catch (error) {
    console.error('检查客户端配置失败:', error.message);
  }
}

async function run() {
  await checkUserPasswordCapability();
  await checkClientConfiguration();
  
  console.log('\\n💡 诊断总结');
  console.log('============');
  console.log('1. 如果用户支持密码登录但提示密码错误，可能是：');
  console.log('   - 用户从未设置过密码');
  console.log('   - 用户忘记了密码');
  console.log('   - 前端用错了用户名格式（邮箱 vs cognitoSub）');
  console.log('2. 如果用户只支持无密码登录，需要：');
  console.log('   - 修复SES配置启用无密码登录');
  console.log('   - 或者为用户设置密码');
}

run()
  .then(() => {
    console.log('\\n✨ 检查完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\\n❌ 检查失败:', error);
    process.exit(1);
  });