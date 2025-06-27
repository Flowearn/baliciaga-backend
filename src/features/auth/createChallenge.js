const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { randomDigits } = require('crypto-secure-random-digit');

const sesClient = new SESClient({ region: 'ap-southeast-1' });
const dynamoDbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const tableName = process.env.VERIFICATION_CODES_TABLE_NAME;

module.exports.handler = async (event) => {
  console.log('CreateAuthChallenge Lambda triggered. Event:', JSON.stringify(event, null, 2));
  
  // Extract email from user attributes instead of userName (which might be cognitoSub)
  let email;
  if (event.request && event.request.userAttributes && event.request.userAttributes.email) {
    email = event.request.userAttributes.email;
  } else {
    // For new users (userNotFound=true), the userName is a UUID, not email
    // This should not happen in our passwordless flow because we create users first
    console.error('[ERROR] No email found in userAttributes. Event:', JSON.stringify(event, null, 2));
    
    // Skip email sending for this case
    event.response.publicChallengeParameters = { email: 'unknown' };
    event.response.privateChallengeParameters = { secretLoginCode: '000000' };
    return event;
  }
  
  console.log(`Extracted email: ${email} (from ${event.request?.userAttributes?.email ? 'userAttributes' : 'userName'})`);
  
  // 测试后门：如果邮箱以 @test.com 结尾，使用固定验证码 123456
  const isTestEmail = email.endsWith('@test.com');
  const secretLoginCode = isTestEmail ? '123456' : randomDigits(6).join('');
  
  if (isTestEmail) {
    console.log(`[TEST MODE] 🔐 Test email detected: ${email}`);
    console.log(`[TEST MODE] 📧 Verification Code: ${secretLoginCode}`);
    console.log(`[TEST MODE] ⚠️  IMPORTANT: Use this code to complete login`);
  }

  // 步骤一：发送真实邮件 (激活) - 测试邮箱跳过发送
  if (!isTestEmail) {
    const sendEmailCommand = new SendEmailCommand({
    Destination: { ToAddresses: [email] },
    Message: {
      Body: {
        Html: { Charset: 'UTF-8', Data: `<html><body><p>Your Baliciaga login code is: <b>${secretLoginCode}</b></p></body></html>` },
        Text: { Charset: 'UTF-8', Data: `Your Baliciaga login code is: ${secretLoginCode}` },
      },
      Subject: { Charset: 'UTF-8', Data: 'Your Baliciaga Login Code' },
    },
    Source: 'yo@baliciaga.com', // 使用已验证的发件人地址
  });

    try {
      await sesClient.send(sendEmailCommand);
      console.log(`[SUCCESS] Verification email sent to ${email}.`);
    } catch (error) {
      console.error(`[ERROR] Failed to send email via SES:`, error);
      // 即使邮件发送失败，也继续流程，以防SES配置问题阻塞登录
    }
  } else {
    console.log(`[TEST MODE] Skipping email send for test email: ${email}`);
  }

  // 步骤二：将验证码写入DynamoDB (激活)
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5分钟后过期
  const dbPutParams = {
    TableName: tableName,
    Item: {
      email: { S: email },
      code: { S: secretLoginCode },
      ttl: { N: ttl.toString() }
    }
  };
  try {
    await dynamoDbClient.send(new PutItemCommand(dbPutParams));
    console.log(`[SUCCESS] Code for ${email} saved to DynamoDB.`);
  } catch (dbError) {
    console.error(`[ERROR] Failed to save code to DynamoDB:`, dbError);
  }
  
  // 步骤三：返回挑战参数给Cognito
  // CRITICAL: Use the actual userName (cognitoSub) that Cognito expects for USERNAME matching
  event.response.privateChallengeParameters = { secretLoginCode, email };
  event.response.publicChallengeParameters = { email };
  
  return event;
}; 