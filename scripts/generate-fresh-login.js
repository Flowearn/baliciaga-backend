/**
 * 生成新的验证码，确保邮件和session一致
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

async function generateFreshLogin() {
  console.log('🔄 生成新的验证码和session');
  console.log('===========================');
  
  try {
    // Step 1: 清理所有旧的验证码记录
    console.log('📋 Step 1: 清理旧验证码...');
    
    await dynamodb.delete({
      TableName: 'baliciaga-verification-codes-dev',
      Key: { email: email }
    }).promise();
    
    await dynamodb.delete({
      TableName: 'baliciaga-verification-codes-dev', 
      Key: { email: '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9' }
    }).promise();
    
    console.log('✅ 已清理所有旧验证码');
    
    // Step 2: 开始新的认证流程，这会触发CreateAuthChallenge
    console.log('\n📋 Step 2: 开始新的认证流程...');
    
    const authResult = await cognito.initiateAuth({
      AuthFlow: 'CUSTOM_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email
      }
    }).promise();
    
    console.log('✅ 新认证流程开始成功');
    console.log('Challenge Name:', authResult.ChallengeName);
    console.log('Challenge Parameters:', authResult.ChallengeParameters);
    console.log('Session存在:', !!authResult.Session);
    
    // Step 3: 等待邮件发送并检查数据库
    console.log('\n📋 Step 3: 等待验证码生成...');
    
    // 等待3秒让Lambda处理完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 检查数据库中的新验证码
    const checkEmail = await dynamodb.get({
      TableName: 'baliciaga-verification-codes-dev',
      Key: { email: email }
    }).promise();
    
    const checkCognitoSub = await dynamodb.get({
      TableName: 'baliciaga-verification-codes-dev',
      Key: { email: '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9' }
    }).promise();
    
    console.log('数据库检查结果:');
    console.log('  用email查询:', checkEmail.Item ? `找到验证码 ${checkEmail.Item.code}` : '未找到');
    console.log('  用cognitoSub查询:', checkCognitoSub.Item ? `找到验证码 ${checkCognitoSub.Item.code}` : '未找到');
    
    const databaseCode = checkEmail.Item?.code || checkCognitoSub.Item?.code;
    
    if (databaseCode) {
      console.log('\n📋 Step 4: 测试新验证码...');
      console.log('数据库中的验证码:', databaseCode);
      console.log('等待你收到新邮件...');
      
      // 给用户30秒时间输入收到的验证码
      console.log('\n⏰ 请在30秒内输入你收到的新验证码:');
      console.log('(如果没收到邮件，请使用数据库中的验证码:', databaseCode + ')');
      
      // 简单的输入等待（实际应用中用更好的方式）
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const userCode = await new Promise((resolve) => {
        rl.question('请输入收到的验证码: ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      
      console.log('\n📋 Step 5: 验证用户输入的验证码...');
      console.log('用户输入:', userCode);
      
      const verifyResult = await cognito.respondToAuthChallenge({
        ClientId: CLIENT_ID,
        ChallengeName: 'CUSTOM_CHALLENGE',
        Session: authResult.Session,
        ChallengeResponses: {
          USERNAME: authResult.ChallengeParameters.USERNAME,
          ANSWER: userCode
        }
      }).promise();
      
      if (verifyResult.AuthenticationResult) {
        console.log('🎉 登录成功！');
        console.log('Access Token:', verifyResult.AuthenticationResult.AccessToken ? '已获取' : '缺失');
        console.log('ID Token:', verifyResult.AuthenticationResult.IdToken ? '已获取' : '缺失');
        
        if (verifyResult.AuthenticationResult.IdToken) {
          const payload = JSON.parse(Buffer.from(verifyResult.AuthenticationResult.IdToken.split('.')[1], 'base64').toString());
          console.log('\n🎉 登录成功的用户信息:');
          console.log('  邮箱:', payload.email);
          console.log('  用户ID:', payload.sub);
          console.log('  登录时间:', new Date(payload.auth_time * 1000).toISOString());
        }
        
        console.log('\n✅ 你的passwordless登录现在完全正常工作了！');
        console.log('问题是session和验证码不同步，现在已解决');
        
      } else {
        console.log('❌ 验证失败');
        console.log('继续的Challenge:', verifyResult.ChallengeName);
        console.log('可能原因：');
        console.log('1. 验证码输入错误');
        console.log('2. 验证码已过期');
        console.log('3. session问题');
        
        // 如果用户输入的不是数据库中的验证码，建议再试一次
        if (userCode !== databaseCode) {
          console.log(`\n💡 提示：你输入的是 ${userCode}，但数据库中是 ${databaseCode}`);
          console.log('建议重新运行此脚本并使用数据库中的验证码');
        }
      }
      
    } else {
      console.log('❌ 没有找到新生成的验证码');
      console.log('CreateAuthChallenge Lambda可能有问题');
    }
    
  } catch (error) {
    console.error('❌ 生成新登录失败:', error.message);
    console.error('错误代码:', error.code);
  }
}

generateFreshLogin()
  .then(() => {
    console.log('\n✨ 流程完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 流程失败:', error);
    process.exit(1);
  });