/**
 * 启用ADMIN_NO_SRP_AUTH以支持管理员认证测试
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

async function enableAdminAuth() {
  console.log('🔧 启用ADMIN_NO_SRP_AUTH认证流程');
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
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
        'ALLOW_CUSTOM_AUTH',
        'ALLOW_ADMIN_USER_PASSWORD_AUTH' // 添加管理员密码认证
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

enableAdminAuth()
  .then(() => {
    console.log('\n✨ 配置更新完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 配置更新失败:', error);
    process.exit(1);
  });