#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'ap-southeast-1'
});

const cognito = new AWS.CognitoIdentityServiceProvider();

// Generate a unique test email
const timestamp = Date.now();
const testEmail = `test-${timestamp}@example.com`;

async function registerNewUser(email, password) {
  const params = {
    ClientId: '3n9so3j4rlh21mebhjo39nperk',
    Username: email,
    Password: password,
    UserAttributes: [
      {
        Name: 'email',
        Value: email
      }
    ]
  };

  try {
    console.log(`📧 Registering new test user: ${email}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`🔍 This should now trigger an email via SES`);
    
    const result = await cognito.signUp(params).promise();
    console.log('✅ Registration successful!');
    console.log('User Sub:', result.UserSub);
    console.log('Code Delivery:', JSON.stringify(result.CodeDeliveryDetails, null, 2));
    
    return result;
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    console.error('Error code:', error.code);
    throw error;
  }
}

// Execute registration
(async () => {
  try {
    // First try with the original email that was having issues
    console.log('=== Testing with original email ===');
    try {
      // Delete the existing unconfirmed user first
      await cognito.adminDeleteUser({
        UserPoolId: 'ap-southeast-1_N72jBBIzH',
        Username: 'troyaxjl@gmail.com'
      }).promise();
      console.log('🗑️  Deleted existing unconfirmed user');
    } catch (e) {
      // User might not exist, that's ok
    }
    
    await registerNewUser('troyaxjl@gmail.com', 'TempPass123!');
    
    console.log('\n✅ Email configuration is now working! Check the inbox for troyaxjl@gmail.com');
  } catch (error) {
    console.error('\n❌ Still having issues. Let\'s check SES sending statistics...');
  }
})();