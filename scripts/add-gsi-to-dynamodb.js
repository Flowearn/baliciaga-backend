#!/usr/bin/env node

const { DynamoDBClient, UpdateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

// 配置
const TABLE_NAME = 'baliciaga-places-dev';
const INDEX_NAME = 'TypeIndex';
const REGION = 'ap-southeast-1';

const dynamoClient = new DynamoDBClient({ region: REGION });

async function addGSIToTable() {
  try {
    console.log(`Adding GSI '${INDEX_NAME}' to table '${TABLE_NAME}'...`);

    // 首先检查表是否已经有这个索引
    try {
      const describeResponse = await dynamoClient.send(new DescribeTableCommand({
        TableName: TABLE_NAME
      }));

      const existingGSIs = describeResponse.Table.GlobalSecondaryIndexes || [];
      const gsiExists = existingGSIs.some(gsi => gsi.IndexName === INDEX_NAME);

      if (gsiExists) {
        console.log(`✅ GSI '${INDEX_NAME}' already exists on table '${TABLE_NAME}'`);
        return;
      }
    } catch (error) {
      console.error('Error checking existing GSIs:', error);
      throw error;
    }

    // 添加全局二级索引
    const updateParams = {
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        {
          AttributeName: 'type',
          AttributeType: 'S'
        }
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: INDEX_NAME,
            KeySchema: [
              {
                AttributeName: 'type',
                KeyType: 'HASH'
              }
            ],
            Projection: {
              ProjectionType: 'ALL'
            },
            BillingMode: 'PAY_PER_REQUEST'
          }
        }
      ]
    };

    const response = await dynamoClient.send(new UpdateTableCommand(updateParams));
    console.log(`✅ Successfully initiated GSI creation for '${INDEX_NAME}'`);
    console.log('Table update status:', response.TableDescription.TableStatus);

    // 等待索引创建完成
    console.log('Waiting for GSI to become active...');
    
    let isActive = false;
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max wait time

    while (!isActive && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      attempts++;

      try {
        const describeResponse = await dynamoClient.send(new DescribeTableCommand({
          TableName: TABLE_NAME
        }));

        const gsi = describeResponse.Table.GlobalSecondaryIndexes?.find(
          gsi => gsi.IndexName === INDEX_NAME
        );

        if (gsi && gsi.IndexStatus === 'ACTIVE') {
          isActive = true;
          console.log(`✅ GSI '${INDEX_NAME}' is now ACTIVE!`);
        } else {
          console.log(`⏳ GSI status: ${gsi?.IndexStatus || 'UNKNOWN'} (attempt ${attempts}/${maxAttempts})`);
        }
      } catch (error) {
        console.error('Error checking GSI status:', error);
      }
    }

    if (!isActive) {
      console.warn('⚠️ GSI creation is taking longer than expected. Please check AWS console.');
    }

  } catch (error) {
    console.error('❌ Error adding GSI:', error);
    throw error;
  }
}

// 运行脚本
addGSIToTable();