/**
 * Fix user data structure - merge profile fields to top level
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE || 'Baliciaga-Users-dev';

async function fixUserDataStructure() {
  console.log('🔧 Fixing user data structure...');
  
  try {
    // Get Troy's user data
    const params = {
      TableName: USERS_TABLE,
      Key: {
        userId: '965d7594-9f69-4455-8119-282e0413f7ad'
      }
    };
    
    const result = await dynamodb.get(params).promise();
    const user = result.Item;
    
    if (!user) {
      console.error('User not found!');
      return;
    }
    
    console.log('Current user structure:', JSON.stringify(user, null, 2));
    
    // If user has a profile object, merge it to top level
    if (user.profile && typeof user.profile === 'object') {
      console.log('\n📋 Merging profile fields to top level...');
      
      // Prepare the update
      const updateParams = {
        TableName: USERS_TABLE,
        Key: {
          userId: user.userId
        },
        UpdateExpression: 'SET #name = :name, whatsApp = :whatsApp, gender = :gender, age = :age, languages = :languages, socialMedia = :socialMedia, occupation = :occupation, profilePictureUrl = :profilePictureUrl, updatedAt = :updatedAt REMOVE profile',
        ExpressionAttributeNames: {
          '#name': 'name'
        },
        ExpressionAttributeValues: {
          ':name': user.profile.name || user.name,
          ':whatsApp': user.profile.whatsApp || user.whatsApp,
          ':gender': user.profile.gender || null,
          ':age': user.profile.age || null,
          ':languages': user.profile.languages || user.languages || [],
          ':socialMedia': user.profile.socialMedia || null,
          ':occupation': user.profile.occupation || null,
          ':profilePictureUrl': user.profile.profilePictureUrl || user.profilePictureUrl,
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      };
      
      const updateResult = await dynamodb.update(updateParams).promise();
      console.log('\n✅ User data structure fixed!');
      console.log('Updated user:', JSON.stringify(updateResult.Attributes, null, 2));
    } else {
      console.log('✅ User data structure is already correct (no nested profile object)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Also check if front-end expects specific format
async function testGetUserProfile() {
  console.log('\n🔍 Testing getUserProfile endpoint...');
  
  const axios = require('axios');
  
  try {
    const response = await axios.get(
      'http://localhost:3006/dev/users/me',
      {
        headers: {
          'x-test-user-sub': 'f227b488-2c81-466f-862f-38f91c951891',
          'x-test-user-email': 'troyzhy@gmail.com'
        }
      }
    );
    
    console.log('getUserProfile response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

async function run() {
  await fixUserDataStructure();
  await testGetUserProfile();
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