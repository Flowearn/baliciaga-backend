#!/usr/bin/env node

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'ap-southeast-1'
});

const cognito = new AWS.CognitoIdentityServiceProvider();

async function resendConfirmationCode(email) {
  const params = {
    ClientId: '3n9so3j4rlh21mebhjo39nperk',
    Username: email
  };

  try {
    console.log(`📧 Resending confirmation code to: ${email}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`🔍 This should trigger a new email from Cognito via SES`);
    
    const result = await cognito.resendConfirmationCode(params).promise();
    console.log('✅ Confirmation code resend initiated');
    console.log('Delivery details:', JSON.stringify(result.CodeDeliveryDetails, null, 2));
    
    return result;
  } catch (error) {
    console.error('❌ Resend failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Request ID:', error.requestId);
    console.error('\n💡 If this is a SES sandbox issue, the error might not be visible here');
    console.error('   Check CloudWatch logs for the actual SES rejection');
    throw error;
  }
}

// Execute resend
(async () => {
  try {
    await resendConfirmationCode('troyaxjl@gmail.com');
  } catch (error) {
    // Error already logged
  }
})();