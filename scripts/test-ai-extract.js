const axios = require('axios');

const testAIExtract = async () => {
  const API_URL = 'http://127.0.0.1:3006/dev/listings/analyze-source';
  
  const testData = {
    sourceText: "Beautiful 3BR villa for rent 275 mill / Year min Take 3 Year - 3 Bathroom - Landsize 3 Are"
  };

  try {
    console.log('🚀 Testing AI extraction locally...');
    console.log('📝 Input:', testData.sourceText);
    
    const response = await axios.post(API_URL, testData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-local'
      }
    });

    console.log('✅ Success! Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

testAIExtract();