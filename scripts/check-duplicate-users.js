/**
 * Check for duplicate users with same email
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

async function checkDuplicateUsers() {
  console.log('🔍 Checking for duplicate users...');
  
  try {
    // Scan all users
    const params = {
      TableName: USERS_TABLE
    };
    
    const result = await dynamodb.scan(params).promise();
    const users = result.Items;
    
    console.log(`\n📊 Total users in database: ${users.length}`);
    
    // Group by email
    const usersByEmail = {};
    users.forEach(user => {
      const email = user.email;
      if (!usersByEmail[email]) {
        usersByEmail[email] = [];
      }
      usersByEmail[email].push(user);
    });
    
    // Find duplicates
    console.log('\n🔍 Checking for duplicate emails...');
    let duplicatesFound = false;
    
    Object.keys(usersByEmail).forEach(email => {
      if (usersByEmail[email].length > 1) {
        duplicatesFound = true;
        console.log(`\n❌ DUPLICATE FOUND: ${email}`);
        console.log(`   Found ${usersByEmail[email].length} users with this email:`);
        
        usersByEmail[email].forEach((user, index) => {
          console.log(`\n   ${index + 1}. User ID: ${user.userId}`);
          console.log(`      Cognito Sub: ${user.cognitoSub}`);
          console.log(`      Name: ${user.name || 'Anonymous'}`);
          console.log(`      Created: ${user.createdAt}`);
          console.log(`      Updated: ${user.updatedAt}`);
          if (user.profile) {
            console.log(`      Has nested profile: Yes`);
          }
        });
      }
    });
    
    if (!duplicatesFound) {
      console.log('✅ No duplicate emails found');
    }
    
    // Specifically check troyzhy@gmail.com
    console.log('\n📧 Specifically checking troyzhy@gmail.com...');
    const troyUsers = usersByEmail['troyzhy@gmail.com'] || [];
    if (troyUsers.length === 0) {
      console.log('No users found with this email');
    } else {
      console.log(`Found ${troyUsers.length} user(s):`);
      troyUsers.forEach((user, index) => {
        console.log(`\n${index + 1}. Full user data:`);
        console.log(JSON.stringify(user, null, 2));
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Also check Cognito user pool
async function checkCognitoUsers() {
  console.log('\n\n🔍 Checking Cognito User Pool...');
  
  const cognito = new AWS.CognitoIdentityServiceProvider();
  const userPoolId = process.env.USER_POOL_ID || 'ap-southeast-1_N72jBBIzH';
  
  try {
    // List users with email troyzhy@gmail.com
    const params = {
      UserPoolId: userPoolId,
      Filter: 'email = "troyzhy@gmail.com"'
    };
    
    const result = await cognito.listUsers(params).promise();
    console.log(`\nFound ${result.Users.length} user(s) in Cognito with email troyzhy@gmail.com:`);
    
    result.Users.forEach((user, index) => {
      console.log(`\n${index + 1}. Cognito User:`);
      console.log(`   Username (Sub): ${user.Username}`);
      console.log(`   Status: ${user.UserStatus}`);
      console.log(`   Created: ${user.UserCreateDate}`);
      console.log(`   Modified: ${user.UserLastModifiedDate}`);
      
      // Get attributes
      const attributes = {};
      user.Attributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
      });
      console.log(`   Email: ${attributes.email}`);
      console.log(`   Email Verified: ${attributes.email_verified}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking Cognito:', error.message);
    console.log('Note: This might fail if we don\'t have proper Cognito permissions');
  }
}

async function run() {
  await checkDuplicateUsers();
  await checkCognitoUsers();
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