#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'ap-southeast-1'
});

const cognito = new AWS.CognitoIdentityServiceProvider();

async function forgotPassword(email) {
  const params = {
    ClientId: '3n9so3j4rlh21mebhjo39nperk',
    Username: email
  };

  try {
    console.log(`📧 Initiating password reset for: ${email}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`🔍 This will trigger an email if SES is configured correctly`);
    
    const result = await cognito.forgotPassword(params).promise();
    console.log('✅ Password reset initiated successfully');
    console.log('Delivery method:', result.CodeDeliveryDetails?.DeliveryMedium);
    console.log('Destination:', result.CodeDeliveryDetails?.Destination);
    
    return result;
  } catch (error) {
    console.error('❌ Password reset failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Request ID:', error.requestId);
    throw error;
  }
}

// Execute password reset
(async () => {
  try {
    await forgotPassword('troyaxjl@gmail.com');
    console.log('\n📌 Now checking CloudWatch logs for SES errors...');
  } catch (error) {
    // Error already logged
  }
})();