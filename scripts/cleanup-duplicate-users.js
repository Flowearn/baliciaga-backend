/**
 * Cleanup duplicate users - keep only the real Cognito user
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

// The real Cognito Sub for troyzhy@gmail.com
const REAL_COGNITO_SUB = '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9';

async function cleanupDuplicates() {
  console.log('🧹 Cleaning up duplicate users for troyzhy@gmail.com...');
  console.log('✅ Keeping only the real Cognito user:', REAL_COGNITO_SUB);
  
  try {
    // Get all users with this email
    const scanParams = {
      TableName: USERS_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': 'troyzhy@gmail.com'
      }
    };
    
    const scanResult = await dynamodb.scan(scanParams).promise();
    const users = scanResult.Items;
    
    console.log(`\n📊 Found ${users.length} users with email troyzhy@gmail.com`);
    
    // Find the best user record to keep
    let userToKeep = null;
    const usersToDelete = [];
    
    users.forEach(user => {
      if (user.cognitoSub === REAL_COGNITO_SUB) {
        // This is the real Cognito user
        if (!userToKeep || user.updatedAt > userToKeep.updatedAt) {
          if (userToKeep) usersToDelete.push(userToKeep);
          userToKeep = user;
        } else {
          usersToDelete.push(user);
        }
      } else {
        // Fake user, mark for deletion
        usersToDelete.push(user);
      }
    });
    
    console.log('\n📋 Analysis:');
    console.log('User to keep:', {
      userId: userToKeep.userId,
      cognitoSub: userToKeep.cognitoSub,
      name: userToKeep.name || userToKeep.profile?.name,
      updatedAt: userToKeep.updatedAt
    });
    
    console.log('\nUsers to delete:', usersToDelete.map(u => ({
      userId: u.userId,
      cognitoSub: u.cognitoSub,
      name: u.name || u.profile?.name
    })));
    
    // Merge the best data from all records
    let mergedData = { ...userToKeep };
    
    // If the keeper has nested profile, flatten it
    if (mergedData.profile && typeof mergedData.profile === 'object') {
      const profile = mergedData.profile;
      delete mergedData.profile;
      
      // Merge profile fields to top level
      Object.keys(profile).forEach(key => {
        if (!mergedData[key] || key === 'name' || key === 'whatsApp') {
          mergedData[key] = profile[key];
        }
      });
    }
    
    // Look for any valuable data in records to be deleted
    usersToDelete.forEach(user => {
      // Check for fields that might be missing in the keeper
      if (user.profilePictureUrl && !mergedData.profilePictureUrl) {
        mergedData.profilePictureUrl = user.profilePictureUrl;
      }
      if (user.bio && !mergedData.bio) {
        mergedData.bio = user.bio;
      }
      if (user.languages && (!mergedData.languages || mergedData.languages.length === 0)) {
        mergedData.languages = user.languages;
      }
    });
    
    // Update the keeper with merged data
    console.log('\n📝 Updating the keeper with merged data...');
    const updateParams = {
      TableName: USERS_TABLE,
      Key: { userId: userToKeep.userId },
      UpdateExpression: 'SET #name = :name, whatsApp = :whatsApp, updatedAt = :updatedAt' +
        (mergedData.profilePictureUrl ? ', profilePictureUrl = :profilePictureUrl' : '') +
        (mergedData.bio ? ', bio = :bio' : '') +
        (mergedData.languages ? ', languages = :languages' : '') +
        (mergedData.gender ? ', gender = :gender' : '') +
        (mergedData.age ? ', age = :age' : '') +
        (mergedData.occupation ? ', occupation = :occupation' : '') +
        (mergedData.socialMedia ? ', socialMedia = :socialMedia' : '') +
        ' REMOVE profile',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':name': mergedData.name || 'Troy Zhang',
        ':whatsApp': mergedData.whatsApp || '+6281234567890',
        ':updatedAt': new Date().toISOString(),
        ...(mergedData.profilePictureUrl && { ':profilePictureUrl': mergedData.profilePictureUrl }),
        ...(mergedData.bio && { ':bio': mergedData.bio }),
        ...(mergedData.languages && { ':languages': mergedData.languages }),
        ...(mergedData.gender && { ':gender': mergedData.gender }),
        ...(mergedData.age && { ':age': mergedData.age }),
        ...(mergedData.occupation && { ':occupation': mergedData.occupation }),
        ...(mergedData.socialMedia && { ':socialMedia': mergedData.socialMedia })
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const updateResult = await dynamodb.update(updateParams).promise();
    console.log('✅ Updated user:', JSON.stringify(updateResult.Attributes, null, 2));
    
    // Delete the duplicates
    console.log('\n🗑️  Deleting duplicate records...');
    for (const user of usersToDelete) {
      const deleteParams = {
        TableName: USERS_TABLE,
        Key: { userId: user.userId }
      };
      
      await dynamodb.delete(deleteParams).promise();
      console.log(`✅ Deleted user ${user.userId} (${user.cognitoSub})`);
    }
    
    console.log('\n🎉 Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanupDuplicates()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });