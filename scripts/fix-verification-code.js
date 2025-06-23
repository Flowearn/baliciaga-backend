/**
 * 手动修复验证码问题，让你能够立即登录
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = 'ap-southeast-1_N72jBBIzH';
const CLIENT_ID = '3n9so3j4rlh21mebhjo39nperk';
const email = 'troyzhy@gmail.com';
const cognitoSub = '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9';
const RECEIVED_CODE = '467539'; // 你收到的验证码

async function fixVerificationCode() {
  console.log('🔧 修复验证码问题');
  console.log('================');
  
  try {
    // Step 1: 删除错误的验证码记录
    console.log('📋 Step 1: 清理错误的验证码记录...');
    
    try {
      await dynamodb.delete({
        TableName: 'baliciaga-verification-codes-dev',
        Key: { email: cognitoSub }
      }).promise();
      console.log('✅ 已删除cognitoSub为key的记录');
    } catch (error) {
      console.log('⚠️  删除cognitoSub记录时出错:', error.message);
    }
    
    // Step 2: 创建正确的验证码记录
    console.log('\n📋 Step 2: 创建正确的验证码记录...');
    
    const ttl = Math.floor(Date.now() / 1000) + 300; // 5分钟后过期
    
    await dynamodb.put({
      TableName: 'baliciaga-verification-codes-dev',
      Item: {
        email: email, // 使用真实邮箱作为key
        code: RECEIVED_CODE, // 使用你收到的验证码
        ttl: ttl
      }
    }).promise();
    
    console.log('✅ 已创建正确的验证码记录');
    console.log('  Email:', email);
    console.log('  Code:', RECEIVED_CODE);
    console.log('  TTL:', new Date(ttl * 1000).toISOString());
    
    // Step 3: 测试修复后的登录
    console.log('\n📋 Step 3: 测试修复后的登录...');
    
    // 开始认证
    const authResult = await cognito.initiateAuth({
      AuthFlow: 'CUSTOM_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email
      }
    }).promise();
    
    console.log('✅ 认证开始成功');
    
    // 提交验证码
    const verifyResult = await cognito.respondToAuthChallenge({
      ClientId: CLIENT_ID,
      ChallengeName: 'CUSTOM_CHALLENGE',
      Session: authResult.Session,
      ChallengeResponses: {
        USERNAME: authResult.ChallengeParameters.USERNAME,
        ANSWER: RECEIVED_CODE
      }
    }).promise();
    
    if (verifyResult.AuthenticationResult) {
      console.log('🎉 修复成功！你现在可以登录了！');
      console.log('Access Token:', verifyResult.AuthenticationResult.AccessToken ? '已获取' : '缺失');
      console.log('ID Token:', verifyResult.AuthenticationResult.IdToken ? '已获取' : '缺失');
      
      if (verifyResult.AuthenticationResult.IdToken) {
        const payload = JSON.parse(Buffer.from(verifyResult.AuthenticationResult.IdToken.split('.')[1], 'base64').toString());
        console.log('\n🎉 登录成功的用户信息:');
        console.log('  邮箱:', payload.email);
        console.log('  用户ID:', payload.sub);
        console.log('  登录时间:', new Date(payload.auth_time * 1000).toISOString());
      }
      
      console.log('\n✅ 问题已解决！');
      console.log('你可以在前端使用passwordless登录了');
      
    } else {
      console.log('❌ 修复后仍然登录失败');
      console.log('继续的Challenge:', verifyResult.ChallengeName);
    }
    
  } catch (error) {
    console.error('❌ 修复过程中出错:', error.message);
    console.error('错误代码:', error.code);
  }
}

async function identifyRootCause() {
  console.log('\n🔍 分析根本原因');
  console.log('==============');
  
  console.log('问题分析：');
  console.log('1. ✅ SES邮件发送正常（你收到了467539）');
  console.log('2. ❌ DynamoDB存储使用了错误的key（cognitoSub而不是email）');
  console.log('3. ❌ 导致验证时查找不到对应的验证码');
  
  console.log('\n可能的原因：');
  console.log('1. 部署的Lambda函数版本与本地代码不同');
  console.log('2. CreateAuthChallenge中的email变量被意外覆盖');
  console.log('3. DynamoDB表结构与预期不符');
  
  console.log('\n需要进一步检查：');
  console.log('1. 确认AWS Lambda部署状态');
  console.log('2. 检查CreateAuthChallenge的实际运行逻辑');
  console.log('3. 统一验证码存储和查询的key策略');
}

async function run() {
  await fixVerificationCode();
  await identifyRootCause();
  
  console.log('\n💡 下一步');
  console.log('========');
  console.log('1. 立即测试：你现在可以使用验证码467539登录');
  console.log('2. 长期修复：需要修复Lambda函数确保key一致性');
  console.log('3. 前端适配：确保前端支持passwordless登录流程');
}

run()
  .then(() => {
    console.log('\n✨ 修复完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 修复失败:', error);
    process.exit(1);
  });