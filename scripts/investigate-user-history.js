/**
 * 调查 troyzhy@gmail.com 的账户历史和数据丢失问题
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = 'ap-southeast-1_N72jBBIzH';
const CLIENT_ID = '3n9so3j4rlh21mebhjo39nperk';
const email = 'troyzhy@gmail.com';
const USERS_TABLE = 'Baliciaga-Users-dev';

async function investigateUserHistory() {
  console.log('🔍 调查 troyzhy@gmail.com 账户历史');
  console.log('====================================');
  
  try {
    // 1. 检查 Cognito 中的用户状态
    console.log('📋 第1步：检查 Cognito 用户状态...');
    
    const cognitoUsers = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    console.log(`找到 ${cognitoUsers.Users.length} 个Cognito用户:`);
    
    cognitoUsers.Users.forEach((user, index) => {
      console.log(`\n用户 ${index + 1}:`);
      console.log('  CognitoSub:', user.Username);
      console.log('  状态:', user.UserStatus);
      console.log('  启用:', user.Enabled);
      console.log('  创建时间:', user.UserCreateDate);
      console.log('  最后修改:', user.UserLastModifiedDate);
      
      const emailAttr = user.Attributes.find(attr => attr.Name === 'email');
      const emailVerified = user.Attributes.find(attr => attr.Name === 'email_verified');
      console.log('  邮箱:', emailAttr?.Value);
      console.log('  邮箱验证:', emailVerified?.Value);
    });
    
    // 2. 检查 DynamoDB 用户表中的数据
    console.log('\n📋 第2步：检查 DynamoDB 用户数据...');
    
    const scanResult = await dynamodb.scan({
      TableName: USERS_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }).promise();
    
    console.log(`找到 ${scanResult.Items.length} 个DynamoDB用户记录:`);
    
    scanResult.Items.forEach((user, index) => {
      console.log(`\n用户记录 ${index + 1}:`);
      console.log('  ID:', user.id);
      console.log('  CognitoSub:', user.cognitoSub);
      console.log('  邮箱:', user.email);
      console.log('  姓名:', user.name || '未设置');
      console.log('  WhatsApp:', user.whatsApp || '未设置');
      console.log('  创建时间:', user.createdAt);
      console.log('  更新时间:', user.updatedAt);
      console.log('  Profile:', user.profile ? JSON.stringify(user.profile) : '无');
    });
    
    // 3. 交叉对比 Cognito 和 DynamoDB 数据
    console.log('\n📋 第3步：数据一致性检查...');
    
    const cognitoSubs = cognitoUsers.Users.map(u => u.Username);
    const dbCognitoSubs = scanResult.Items.map(u => u.cognitoSub);
    
    console.log('Cognito中的CognitoSub:', cognitoSubs);
    console.log('DynamoDB中的CognitoSub:', dbCognitoSubs);
    
    // 找出数据不一致的情况
    const orphanedCognito = cognitoSubs.filter(sub => !dbCognitoSubs.includes(sub));
    const orphanedDb = dbCognitoSubs.filter(sub => !cognitoSubs.includes(sub));
    
    if (orphanedCognito.length > 0) {
      console.log('⚠️  存在孤立的Cognito用户（有Cognito记录但无DynamoDB记录）:', orphanedCognito);
    }
    
    if (orphanedDb.length > 0) {
      console.log('⚠️  存在孤立的DynamoDB记录（有DynamoDB记录但无Cognito用户）:', orphanedDb);
    }
    
    if (orphanedCognito.length === 0 && orphanedDb.length === 0) {
      console.log('✅ Cognito和DynamoDB数据一致');
    }
    
    // 4. 检查用户资料数据是否完整
    console.log('\n📋 第4步：检查用户资料完整性...');
    
    scanResult.Items.forEach((user, index) => {
      console.log(`\n用户 ${index + 1} 资料检查:`);
      console.log('  有姓名:', !!user.name);
      console.log('  有WhatsApp:', !!user.whatsApp);
      console.log('  有Profile对象:', !!user.profile);
      
      if (user.profile) {
        console.log('  Profile.name:', user.profile.name || '缺失');
        console.log('  Profile.whatsApp:', user.profile.whatsApp || '缺失');
      }
      
      // 检查是否有数据丢失迹象
      const hasBasicInfo = user.name || (user.profile && user.profile.name);
      const hasContact = user.whatsApp || (user.profile && user.profile.whatsApp);
      
      if (!hasBasicInfo && !hasContact) {
        console.log('⚠️  此用户缺少基本资料，可能是新建或数据丢失');
      } else {
        console.log('✅ 此用户有基本资料数据');
      }
    });
    
  } catch (error) {
    console.error('❌ 调查过程中出错:', error.message);
  }
}

async function checkRegistrationFlow() {
  console.log('\n🔍 检查注册流程配置');
  console.log('===================');
  
  try {
    // 检查客户端支持的认证流程
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const client = clientResult.UserPoolClient;
    console.log('客户端支持的认证流程:', client.ExplicitAuthFlows);
    
    const hasPasswordAuth = client.ExplicitAuthFlows.includes('ALLOW_USER_SRP_AUTH') || 
                          client.ExplicitAuthFlows.includes('ALLOW_ADMIN_USER_PASSWORD_AUTH');
    const hasCustomAuth = client.ExplicitAuthFlows.includes('ALLOW_CUSTOM_AUTH');
    
    console.log('支持密码认证:', hasPasswordAuth ? '✅' : '❌');
    console.log('支持passwordless认证:', hasCustomAuth ? '✅' : '❌');
    
    // 检查用户池配置
    const poolResult = await cognito.describeUserPool({
      UserPoolId: USER_POOL_ID
    }).promise();
    
    const pool = poolResult.UserPool;
    console.log('\n用户池配置:');
    console.log('  用户名属性:', pool.UsernameAttributes);
    console.log('  自动验证属性:', pool.AutoVerifiedAttributes);
    console.log('  MFA配置:', pool.MfaConfiguration);
    
    // 分析问题
    console.log('\n💡 问题分析:');
    if (hasPasswordAuth && hasCustomAuth) {
      console.log('1. ✅ 客户端同时支持密码和passwordless认证');
      console.log('2. 🤔 问题可能在于:');
      console.log('   - 前端注册流程选择了错误的认证方式');
      console.log('   - PostConfirmation trigger创建了passwordless用户');
      console.log('   - 前端没有正确设置密码');
    }
    
  } catch (error) {
    console.error('❌ 检查注册流程时出错:', error.message);
  }
}

async function run() {
  await investigateUserHistory();
  await checkRegistrationFlow();
  
  console.log('\n📊 总结');
  console.log('======');
  console.log('1. 检查了Cognito和DynamoDB中的用户数据');
  console.log('2. 分析了数据一致性和完整性');
  console.log('3. 检查了认证流程配置');
  console.log('4. 识别了可能的数据丢失和注册流程问题');
}

run()
  .then(() => {
    console.log('\n✨ 调查完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 调查失败:', error);
    process.exit(1);
  });