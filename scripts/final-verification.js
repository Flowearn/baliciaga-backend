/**
 * 最终验证准备工作是否完成
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

async function finalVerification() {
  console.log('✅ 最终验证准备工作状态');
  console.log('=======================');
  
  try {
    // 1. 验证Cognito用户已删除
    console.log('\n📋 1. 验证Cognito用户状态...');
    const listResult = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "troyzhy@gmail.com"`
    }).promise();
    
    console.log('troyzhy@gmail.com 在Cognito中:', listResult.Users.length === 0 ? '✅ 已删除' : `❌ 还有 ${listResult.Users.length} 个用户`);
    
    // 2. 验证认证配置
    console.log('\n📋 2. 验证认证配置...');
    const clientConfig = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const authFlows = clientConfig.UserPoolClient.ExplicitAuthFlows;
    console.log('支持的认证流程:', authFlows);
    console.log('');
    console.log('ALLOW_USER_PASSWORD_AUTH:', authFlows.includes('ALLOW_USER_PASSWORD_AUTH') ? '✅ 已启用' : '❌ 未启用');
    console.log('ALLOW_REFRESH_TOKEN_AUTH:', authFlows.includes('ALLOW_REFRESH_TOKEN_AUTH') ? '✅ 已启用' : '❌ 未启用');
    console.log('ALLOW_USER_SRP_AUTH:', authFlows.includes('ALLOW_USER_SRP_AUTH') ? '✅ 已启用' : '❌ 未启用');
    console.log('ALLOW_CUSTOM_AUTH:', authFlows.includes('ALLOW_CUSTOM_AUTH') ? '✅ 已启用' : '❌ 未启用');
    
    // 3. 总结
    const userDeleted = listResult.Users.length === 0;
    const passwordAuthEnabled = authFlows.includes('ALLOW_USER_PASSWORD_AUTH');
    const refreshAuthEnabled = authFlows.includes('ALLOW_REFRESH_TOKEN_AUTH');
    
    console.log('\n📊 准备工作完成状态总结');
    console.log('======================');
    console.log('1. 旧用户已删除:', userDeleted ? '✅' : '❌');
    console.log('2. 密码认证已启用:', passwordAuthEnabled ? '✅' : '❌');
    console.log('3. 刷新令牌已启用:', refreshAuthEnabled ? '✅' : '❌');
    
    if (userDeleted && passwordAuthEnabled && refreshAuthEnabled) {
      console.log('\n🎉 所有准备工作已完成！');
      console.log('现在可以开始实现邮箱+密码的注册功能了。');
      return true;
    } else {
      console.log('\n⚠️  还有准备工作未完成，请检查上面的状态');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 验证过程中出错:', error.message);
    return false;
  }
}

finalVerification()
  .then((ready) => {
    if (ready) {
      console.log('\n✨ 准备开始实现注册功能...');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 验证失败:', error);
    process.exit(1);
  });