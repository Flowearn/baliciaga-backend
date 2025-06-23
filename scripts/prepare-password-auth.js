/**
 * 准备工作：启用密码认证并清理旧账号
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

async function updateCognitoClientConfig() {
  console.log('📋 步骤1: 更新Cognito客户端配置');
  console.log('================================');
  
  try {
    // 获取当前客户端配置
    const currentConfig = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    console.log('当前认证流程:', currentConfig.UserPoolClient.ExplicitAuthFlows);
    
    // 准备更新的配置
    const updateParams = {
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      ExplicitAuthFlows: [
        'ALLOW_USER_PASSWORD_AUTH',    // 添加密码认证
        'ALLOW_USER_SRP_AUTH',         // 保留SRP认证
        'ALLOW_REFRESH_TOKEN_AUTH',    // 添加刷新令牌
        'ALLOW_CUSTOM_AUTH'            // 保留自定义认证（以防需要）
      ],
      // 保留其他现有配置
      RefreshTokenValidity: currentConfig.UserPoolClient.RefreshTokenValidity,
      AccessTokenValidity: currentConfig.UserPoolClient.AccessTokenValidity,
      IdTokenValidity: currentConfig.UserPoolClient.IdTokenValidity,
      TokenValidityUnits: currentConfig.UserPoolClient.TokenValidityUnits,
      ReadAttributes: currentConfig.UserPoolClient.ReadAttributes,
      WriteAttributes: currentConfig.UserPoolClient.WriteAttributes,
      SupportedIdentityProviders: currentConfig.UserPoolClient.SupportedIdentityProviders,
      CallbackURLs: currentConfig.UserPoolClient.CallbackURLs,
      LogoutURLs: currentConfig.UserPoolClient.LogoutURLs,
      AllowedOAuthFlows: currentConfig.UserPoolClient.AllowedOAuthFlows,
      AllowedOAuthScopes: currentConfig.UserPoolClient.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient: currentConfig.UserPoolClient.AllowedOAuthFlowsUserPoolClient,
      PreventUserExistenceErrors: currentConfig.UserPoolClient.PreventUserExistenceErrors,
      EnableTokenRevocation: currentConfig.UserPoolClient.EnableTokenRevocation,
      EnablePropagateAdditionalUserContextData: currentConfig.UserPoolClient.EnablePropagateAdditionalUserContextData
    };
    
    // 更新客户端配置
    await cognito.updateUserPoolClient(updateParams).promise();
    
    console.log('✅ 客户端配置更新成功！');
    console.log('新的认证流程:', updateParams.ExplicitAuthFlows);
    
  } catch (error) {
    console.error('❌ 更新客户端配置失败:', error.message);
    throw error;
  }
}

async function deleteOldUser() {
  console.log('\n📋 步骤2: 删除旧的passwordless用户');
  console.log('===================================');
  
  const email = 'troyzhy@gmail.com';
  
  try {
    // 查找用户
    const listResult = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    if (listResult.Users.length === 0) {
      console.log('⚠️  用户不存在，无需删除');
      return;
    }
    
    // 删除找到的所有匹配用户
    for (const user of listResult.Users) {
      console.log(`删除用户: ${user.Username} (${email})`);
      
      await cognito.adminDeleteUser({
        UserPoolId: USER_POOL_ID,
        Username: user.Username
      }).promise();
      
      console.log(`✅ 用户 ${user.Username} 已删除`);
    }
    
    console.log('✅ 所有旧用户已清理完成');
    
  } catch (error) {
    console.error('❌ 删除用户失败:', error.message);
    throw error;
  }
}

async function verifyConfiguration() {
  console.log('\n📋 步骤3: 验证配置');
  console.log('==================');
  
  try {
    // 验证客户端配置
    const clientConfig = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const authFlows = clientConfig.UserPoolClient.ExplicitAuthFlows;
    const hasPasswordAuth = authFlows.includes('ALLOW_USER_PASSWORD_AUTH');
    const hasRefreshAuth = authFlows.includes('ALLOW_REFRESH_TOKEN_AUTH');
    
    console.log('密码认证已启用:', hasPasswordAuth ? '✅' : '❌');
    console.log('刷新令牌已启用:', hasRefreshAuth ? '✅' : '❌');
    
    // 验证用户已删除
    const listResult = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "troyzhy@gmail.com"`
    }).promise();
    
    console.log('troyzhy@gmail.com 用户已删除:', listResult.Users.length === 0 ? '✅' : '❌');
    
    if (hasPasswordAuth && hasRefreshAuth && listResult.Users.length === 0) {
      console.log('\n🎉 所有准备工作已完成！');
      console.log('可以开始实现注册功能了。');
      return true;
    } else {
      console.log('\n⚠️  部分准备工作未完成');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    return false;
  }
}

async function run() {
  console.log('🚀 开始执行准备工作');
  console.log('===================\n');
  
  try {
    await updateCognitoClientConfig();
    await deleteOldUser();
    const success = await verifyConfiguration();
    
    if (success) {
      console.log('\n✅ 准备工作全部完成！');
      console.log('现在可以实现邮箱+密码的注册和登录功能了。');
    } else {
      console.log('\n❌ 准备工作未完全成功，请检查错误信息');
    }
    
  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    process.exit(1);
  }
}

run()
  .then(() => {
    console.log('\n✨ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  });