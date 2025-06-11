const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { randomDigits } = require('crypto-secure-random-digit');

const sesClient = new SESClient({ region: 'ap-southeast-1' });
const dynamoDbClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const tableName = `baliciaga-verification-codes-dev`; // 使用我们已部署的正确表名

module.exports.handler = async (event) => {
  console.log('CreateAuthChallenge Lambda triggered. Event:', JSON.stringify(event, null, 2));
  const email = event.userName;
  const secretLoginCode = randomDigits(6).join('');

  // 步骤一：发送真实邮件 (激活)
  const sendEmailCommand = new SendEmailCommand({
    Destination: { ToAddresses: [email] },
    Message: {
      Body: {
        Html: { Charset: 'UTF-8', Data: `<html><body><p>Your Baliciaga login code is: <b>${secretLoginCode}</b></p></body></html>` },
        Text: { Charset: 'UTF-8', Data: `Your Baliciaga login code is: ${secretLoginCode}` },
      },
      Subject: { Charset: 'UTF-8', Data: 'Your Baliciaga Login Code' },
    },
    Source: 'yo@baliciaga.com', // 请确保这个发件人邮箱已在SES中验证
  });

  try {
    await sesClient.send(sendEmailCommand);
    console.log(`[SUCCESS] Verification email sent to ${email}.`);
  } catch (error) {
    console.error(`[ERROR] Failed to send email via SES:`, error);
    // 即使邮件发送失败，也继续流程，以防SES配置问题阻塞登录
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
  
  // 步骤三：返回挑战参数给Cognito (保持不变)
  event.response.privateChallengeParameters = { secretLoginCode, email };
  event.response.publicChallengeParameters = { email };
  
  return event;
}; 