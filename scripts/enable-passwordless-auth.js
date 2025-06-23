/**
 * 启用无密码认证流程 - CUSTOM_AUTH_FLOW_ONLY
 * 禁用ADMIN_NO_SRP_AUTH
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

async function enablePasswordlessAuth() {
  console.log('🔧 配置无密码认证流程');
  console.log('================================');
  
  try {
    // 获取当前客户端配置
    const currentConfig = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    console.log('当前认证流程:', currentConfig.UserPoolClient.ExplicitAuthFlows);
    
    // 准备更新的配置 - 仅保留CUSTOM_AUTH流程
    const updateParams = {
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      ExplicitAuthFlows: [
        'ALLOW_CUSTOM_AUTH',              // 自定义认证流程（无密码）
        'ALLOW_REFRESH_TOKEN_AUTH'        // 刷新令牌
        // 移除以下流程：
        // 'ALLOW_USER_PASSWORD_AUTH',    // 用户密码认证
        // 'ALLOW_USER_SRP_AUTH',         // SRP认证
        // 'ALLOW_ADMIN_USER_PASSWORD_AUTH' // 管理员密码认证
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
    console.log('\n已禁用的认证流程:');
    console.log('- ALLOW_USER_PASSWORD_AUTH');
    console.log('- ALLOW_USER_SRP_AUTH');
    console.log('- ALLOW_ADMIN_USER_PASSWORD_AUTH');
    console.log('\n仅保留:');
    console.log('- ALLOW_CUSTOM_AUTH (无密码认证)');
    console.log('- ALLOW_REFRESH_TOKEN_AUTH (刷新令牌)');
    
  } catch (error) {
    console.error('❌ 更新客户端配置失败:', error.message);
    throw error;
  }
}

enablePasswordlessAuth()
  .then(() => {
    console.log('\n✨ 无密码认证配置完成');
    console.log('下一步：更新Lambda函数以支持测试后门');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 配置更新失败:', error);
    process.exit(1);
  });