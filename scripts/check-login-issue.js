/**
 * 检查 troyzhy@gmail.com 登录问题
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

async function checkUserStatus() {
  console.log('🔍 检查用户状态：troyzhy@gmail.com');
  console.log('=====================================');
  
  try {
    const result = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    if (result.Users.length === 0) {
      console.log('❌ 用户不存在 - 需要先注册');
      return false;
    }
    
    const user = result.Users[0];
    console.log('✅ 找到用户');
    console.log('用户名:', user.Username);
    console.log('状态:', user.UserStatus);
    console.log('启用状态:', user.Enabled);
    console.log('创建时间:', user.UserCreateDate);
    console.log('最后修改:', user.UserLastModifiedDate);
    
    const emailAttr = user.Attributes.find(attr => attr.Name === 'email');
    const emailVerified = user.Attributes.find(attr => attr.Name === 'email_verified');
    console.log('邮箱:', emailAttr?.Value);
    console.log('邮箱已验证:', emailVerified?.Value);
    
    // 检查用户状态是否有问题
    if (user.UserStatus !== 'CONFIRMED') {
      console.log('⚠️  用户状态异常:', user.UserStatus);
      console.log('问题：用户状态不是CONFIRMED，这可能导致登录失败');
      return false;
    }
    
    if (!user.Enabled) {
      console.log('❌ 用户已被禁用');
      return false;
    }
    
    if (emailVerified?.Value !== 'true') {
      console.log('⚠️  邮箱未验证，这可能导致登录问题');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    return false;
  }
}

async function testLogin() {
  console.log('\n🧪 测试登录流程');
  console.log('================');
  
  try {
    // 测试1: 尝试用SRP认证（传统密码方式）
    console.log('📋 测试传统密码登录...');
    
    try {
      const srpResult = await cognito.initiateAuth({
        AuthFlow: 'USER_SRP_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: 'anypassword' // 这应该会失败，因为没有密码
        }
      }).promise();
      
      console.log('❌ 意外成功 - 系统可能配置错误');
      
    } catch (srpError) {
      if (srpError.code === 'NotAuthorizedException') {
        console.log('✅ 正确：传统密码认证被拒绝（因为这是无密码系统）');
      } else if (srpError.code === 'UserNotFoundException') {
        console.log('❌ 用户未找到');
        return;
      } else {
        console.log('ℹ️  SRP认证错误:', srpError.code, '-', srpError.message);
      }
    }
    
    // 测试2: 尝试自定义认证（无密码方式）
    console.log('\n📋 测试无密码认证...');
    
    try {
      const customResult = await cognito.initiateAuth({
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: email
        }
      }).promise();
      
      console.log('✅ 无密码认证启动成功');
      console.log('挑战类型:', customResult.ChallengeName);
      console.log('会话:', customResult.Session ? '存在' : '缺失');
      
      if (customResult.ChallengeName === 'CUSTOM_CHALLENGE') {
        console.log('✅ 系统正确启动了自定义挑战（验证码）');
        console.log('用户应该收到邮件验证码');
      }
      
    } catch (customError) {
      console.error('❌ 无密码认证失败:', customError.code, '-', customError.message);
      
      if (customError.code === 'UserNotFoundException') {
        console.log('❌ 关键问题：用户在认证时未找到');
      }
    }
    
  } catch (error) {
    console.error('❌ 测试登录时出错:', error.message);
  }
}

async function checkUserPoolConfig() {
  console.log('\n🔧 检查用户池配置');
  console.log('==================');
  
  try {
    const poolResult = await cognito.describeUserPool({
      UserPoolId: USER_POOL_ID
    }).promise();
    
    const pool = poolResult.UserPool;
    console.log('用户池名称:', pool.Name);
    console.log('用户名属性:', pool.UsernameAttributes);
    console.log('MFA配置:', pool.MfaConfiguration);
    console.log('自动验证属性:', pool.AutoVerifiedAttributes);
    
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const client = clientResult.UserPoolClient;
    console.log('客户端名称:', client.ClientName);
    console.log('支持的认证流程:', client.ExplicitAuthFlows);
    
    // 检查配置是否正确
    if (!client.ExplicitAuthFlows.includes('ALLOW_CUSTOM_AUTH')) {
      console.log('❌ 配置问题：客户端不支持自定义认证');
    }
    
    if (!client.ExplicitAuthFlows.includes('ALLOW_USER_SRP_AUTH')) {
      console.log('ℹ️  客户端不支持SRP认证（这是正常的，如果只用无密码）');
    }
    
  } catch (error) {
    console.error('❌ 检查配置时出错:', error.message);
  }
}

async function run() {
  const userExists = await checkUserStatus();
  
  if (userExists) {
    await testLogin();
  }
  
  await checkUserPoolConfig();
  
  console.log('\n💡 总结：');
  console.log('=======================');
  console.log('1. 如果用户状态是CONFIRMED且启用，但登录显示"密码错误"');
  console.log('2. 这可能是因为前端尝试了传统密码登录而不是无密码认证');
  console.log('3. 检查前端是否正确使用CUSTOM_AUTH流程');
  console.log('4. 如果用户状态有问题，可能需要重新激活账户');
}

run()
  .then(() => {
    console.log('\n✨ 诊断完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 诊断失败:', error);
    process.exit(1);
  });