#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'ap-southeast-1'
});

const cognito = new AWS.CognitoIdentityServiceProvider();

async function registerUser(email, password) {
  const params = {
    ClientId: '3n9so3j4rlh21mebhjo39nperk', // Correct client ID for passwordless user pool
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
    console.log(`📧 Attempting to register user: ${email}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    const result = await cognito.signUp(params).promise();
    console.log('✅ Registration initiated successfully');
    console.log('Response:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    throw error;
  }
}

// Execute registration
(async () => {
  try {
    await registerUser('troyaxjl@gmail.com', 'TempPass123!');
  } catch (error) {
    // Error already logged
  }
})();