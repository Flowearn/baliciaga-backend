/**
 * Create a test user profile for Troy Zhang
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE || 'Baliciaga-Users-dev';

// Test user data
const testUser = {
  userId: '965d7594-9f69-4455-8119-282e0413f7ad',
  cognitoSub: 'f227b488-2c81-466f-862f-38f91c951891',  // The Cognito Sub we've been using
  email: 'troyzhy@gmail.com',
  name: 'Troy Zhang',
  whatsApp: '+6281234567890',
  languages: ['English', 'Chinese'],
  bio: 'Test user for development',
  profilePictureUrl: 'https://baliciaga-profile-pictures-dev.s3.amazonaws.com/avatars/default-avatar.jpg',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

async function createTestUser() {
  console.log('🚀 Creating test user profile...');
  console.log('👤 User:', testUser.name);
  console.log('📧 Email:', testUser.email);
  console.log('🔑 UserId:', testUser.userId);
  console.log('🔐 CognitoSub:', testUser.cognitoSub);
  console.log('');

  try {
    // Create the user
    const params = {
      TableName: USERS_TABLE,
      Item: testUser
    };

    await dynamodb.put(params).promise();
    console.log('✅ User profile created successfully!');

    // Verify by reading back
    const getParams = {
      TableName: USERS_TABLE,
      Key: {
        userId: testUser.userId
      }
    };

    const result = await dynamodb.get(getParams).promise();
    if (result.Item) {
      console.log('\n📋 Created user profile:');
      console.log(JSON.stringify(result.Item, null, 2));
    }

  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    throw error;
  }
}

// Also create a function to list all users
async function listAllUsers() {
  console.log('\n📋 Listing all users in the database:');
  
  try {
    const params = {
      TableName: USERS_TABLE
    };
    
    const result = await dynamodb.scan(params).promise();
    console.log(`Found ${result.Items.length} users:`);
    
    result.Items.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name || 'Anonymous'}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   UserId: ${user.userId}`);
      console.log(`   CognitoSub: ${user.cognitoSub}`);
    });
    
  } catch (error) {
    console.error('❌ Error listing users:', error.message);
  }
}

// Run
async function run() {
  await createTestUser();
  await listAllUsers();
}

run()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });