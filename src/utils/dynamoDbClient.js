require('dotenv').config();

const AWS = require('aws-sdk');

// 配置AWS SDK v2 DynamoDB客户端
// 在Lambda环境中，使用执行角色而不是硬编码凭证
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  // Lambda环境：使用执行角色
  AWS.config.update({
    region: process.env.AWS_REGION || 'ap-southeast-1'
  });
} else {
  // 本地开发环境：使用环境变量凭证
  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });
}

const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports = dynamodb; 