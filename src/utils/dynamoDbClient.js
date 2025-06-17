require('dotenv').config();

const AWS = require('aws-sdk');

// 配置AWS SDK v2 DynamoDB客户端
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports = dynamodb; 