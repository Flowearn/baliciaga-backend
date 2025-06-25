const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const testAIImageExtract = async () => {
  const API_URL = 'https://7u294to2qh.execute-api.ap-southeast-1.amazonaws.com/dev/listings/analyze-source';
  
  // Create a simple test image
  const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  
  const form = new FormData();
  form.append('sourceImage', imageBuffer, {
    filename: 'test.png',
    contentType: 'image/png'
  });

  try {
    console.log('🚀 Testing AI image extraction in cloud...');
    
    const response = await axios.post(API_URL, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer test-token-cloud'
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

testAIImageExtract();