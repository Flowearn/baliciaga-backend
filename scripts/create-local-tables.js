#!/usr/bin/env node

const AWS = require('aws-sdk');

// 配置本地DynamoDB
const dynamodb = new AWS.DynamoDB({
    region: 'ap-southeast-1',
    endpoint: 'http://localhost:8000',
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey'
});

async function createTables() {
    console.log('🚀 Creating local DynamoDB tables...');

    // 创建Users表
    try {
        await dynamodb.createTable({
            TableName: process.env.USERS_TABLE_NAME,
            AttributeDefinitions: [
                { AttributeName: 'userId', AttributeType: 'S' },
                { AttributeName: 'cognitoSub', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'userId', KeyType: 'HASH' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'CognitoSubIndex',
                    KeySchema: [
                        { AttributeName: 'cognitoSub', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }).promise();
        console.log('✅ Users table created');
    } catch (error) {
        if (error.code === 'ResourceInUseException') {
            console.log('ℹ️  Users table already exists');
        } else {
            console.error('❌ Error creating Users table:', error);
        }
    }

    // 创建Listings表
    try {
        await dynamodb.createTable({
            TableName: process.env.LISTINGS_TABLE_NAME,
            AttributeDefinitions: [
                { AttributeName: 'listingId', AttributeType: 'S' },
                { AttributeName: 'status', AttributeType: 'S' },
                { AttributeName: 'initiatorId', AttributeType: 'S' },
                { AttributeName: 'createdAt', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'listingId', KeyType: 'HASH' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'StatusIndex',
                    KeySchema: [
                        { AttributeName: 'status', KeyType: 'HASH' },
                        { AttributeName: 'createdAt', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                },
                {
                    IndexName: 'InitiatorIndex',
                    KeySchema: [
                        { AttributeName: 'initiatorId', KeyType: 'HASH' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }).promise();
        console.log('✅ Listings table created');
    } catch (error) {
        if (error.code === 'ResourceInUseException') {
            console.log('ℹ️  Listings table already exists');
        } else {
            console.error('❌ Error creating Listings table:', error);
        }
    }

    // 创建Applications表
    try {
        await dynamodb.createTable({
            TableName: process.env.APPLICATIONS_TABLE_NAME,
            AttributeDefinitions: [
                { AttributeName: 'applicationId', AttributeType: 'S' },
                { AttributeName: 'listingId', AttributeType: 'S' },
                { AttributeName: 'applicantId', AttributeType: 'S' },
                { AttributeName: 'status', AttributeType: 'S' },
                { AttributeName: 'createdAt', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'applicationId', KeyType: 'HASH' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'ListingApplicationsIndex',
                    KeySchema: [
                        { AttributeName: 'listingId', KeyType: 'HASH' },
                        { AttributeName: 'createdAt', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                },
                {
                    IndexName: 'UserApplicationsIndex',
                    KeySchema: [
                        { AttributeName: 'applicantId', KeyType: 'HASH' },
                        { AttributeName: 'createdAt', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                },
                {
                    IndexName: 'ListingStatusIndex',
                    KeySchema: [
                        { AttributeName: 'listingId', KeyType: 'HASH' },
                        { AttributeName: 'status', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }
            ],
            BillingMode: 'PAY_PER_REQUEST'
        }).promise();
        console.log('✅ Applications table created');
    } catch (error) {
        if (error.code === 'ResourceInUseException') {
            console.log('ℹ️  Applications table already exists');
        } else {
            console.error('❌ Error creating Applications table:', error);
        }
    }

    console.log('🎉 All tables created successfully!');
}

createTables().catch(console.error); 