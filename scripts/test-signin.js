#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'ap-southeast-1'
});

const cognito = new AWS.CognitoIdentityServiceProvider();

async function initiateAuth(email) {
  const params = {
    AuthFlow: 'CUSTOM_AUTH',
    ClientId: '3n9so3j4rlh21mebhjo39nperk',
    AuthParameters: {
      USERNAME: email
    }
  };

  try {
    console.log(`📧 Initiating passwordless auth for: ${email}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    const result = await cognito.initiateAuth(params).promise();
    console.log('✅ Auth initiated successfully');
    console.log('Challenge Name:', result.ChallengeName);
    console.log('Session:', result.Session ? 'Session received' : 'No session');
    
    return result;
  } catch (error) {
    console.error('❌ Auth initiation failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    throw error;
  }
}

// Execute auth
(async () => {
  try {
    await initiateAuth('troyaxjl@gmail.com');
    console.log('\n📌 Check CloudWatch logs now for email sending attempts');
  } catch (error) {
    // Error already logged
  }
})();