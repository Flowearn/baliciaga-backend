/**
 * 完整清理用户数据
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
const email = 'troyzhy@gmail.com';

async function cleanupAllUserData() {
  console.log('🧹 完整清理用户数据');
  console.log('==================');
  
  try {
    // 1. 再次检查Cognito
    console.log('\n📋 检查Cognito用户状态...');
    const listResult = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    console.log(`找到 ${listResult.Users.length} 个Cognito用户`);
    
    // 2. 清理DynamoDB用户表
    console.log('\n📋 清理DynamoDB用户数据...');
    const usersResult = await dynamodb.scan({
      TableName: 'Baliciaga-Users-dev',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }).promise();
    
    if (usersResult.Items.length > 0) {
      for (const user of usersResult.Items) {
        await dynamodb.delete({
          TableName: 'Baliciaga-Users-dev',
          Key: { cognitoSub: user.cognitoSub }
        }).promise();
        console.log(`✅ 删除DynamoDB用户记录: ${user.cognitoSub}`);
      }
    } else {
      console.log('✅ DynamoDB中没有该用户记录');
    }
    
    // 3. 清理验证码表
    console.log('\n📋 清理验证码数据...');
    try {
      await dynamodb.delete({
        TableName: 'baliciaga-verification-codes-dev',
        Key: { email: email }
      }).promise();
      console.log('✅ 清理了邮箱相关的验证码');
    } catch (error) {
      console.log('⚠️  验证码表中没有相关数据');
    }
    
    // 4. 最终验证
    console.log('\n📋 最终验证...');
    
    // 验证Cognito
    const finalCheck = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`
    }).promise();
    
    // 验证DynamoDB
    const finalDbCheck = await dynamodb.scan({
      TableName: 'Baliciaga-Users-dev',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }).promise();
    
    console.log('Cognito用户清理完成:', finalCheck.Users.length === 0 ? '✅' : '❌');
    console.log('DynamoDB用户清理完成:', finalDbCheck.Items.length === 0 ? '✅' : '❌');
    
    // 验证密码认证配置
    const clientConfig = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: '3n9so3j4rlh21mebhjo39nperk'
    }).promise();
    
    const authFlows = clientConfig.UserPoolClient.ExplicitAuthFlows;
    console.log('\n认证配置状态:');
    console.log('ALLOW_USER_PASSWORD_AUTH:', authFlows.includes('ALLOW_USER_PASSWORD_AUTH') ? '✅' : '❌');
    console.log('ALLOW_REFRESH_TOKEN_AUTH:', authFlows.includes('ALLOW_REFRESH_TOKEN_AUTH') ? '✅' : '❌');
    
    if (finalCheck.Users.length === 0 && 
        finalDbCheck.Items.length === 0 && 
        authFlows.includes('ALLOW_USER_PASSWORD_AUTH') && 
        authFlows.includes('ALLOW_REFRESH_TOKEN_AUTH')) {
      console.log('\n🎉 所有准备工作已完成！');
      console.log('可以开始实现注册功能了。');
      return true;
    } else {
      console.log('\n⚠️  还有一些清理工作未完成');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 清理过程中出错:', error.message);
    return false;
  }
}

cleanupAllUserData()
  .then((success) => {
    if (success) {
      console.log('\n✨ 准备工作全部完成');
    } else {
      console.log('\n⚠️  请检查并手动处理剩余问题');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  });