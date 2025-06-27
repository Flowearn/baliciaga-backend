const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const testExtractInfo = async () => {
  const API_URL = 'http://127.0.0.1:3006/dev/listings/analyze-source';
  
  console.log('🧪 Testing Extract Info feature to trigger failure...\n');

  // Test 1: Text-based extraction
  console.log('📝 Test 1: Text-based extraction');
  const textData = {
    sourceText: "Beautiful 3BR villa for rent in Canggu. 275 million IDR per year. Minimum stay 3 years. 3 bathrooms, land size 3 are. Fully furnished with pool."
  };

  try {
    const textResponse = await axios.post(API_URL, textData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-for-failure'
      }
    });
    console.log('✅ Text extraction succeeded (unexpected)');
    console.log(JSON.stringify(textResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Text extraction failed:');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    console.log('Full error response:', JSON.stringify(error.response?.data, null, 2));
  }

  console.log('\n-------------------\n');

  // Test 2: Image-based extraction (with a dummy image)
  console.log('🖼️ Test 2: Image-based extraction');
  
  const form = new FormData();
  
  // Create a dummy image buffer
  const dummyImageBuffer = Buffer.from('fake-image-data');
  form.append('sourceImage', dummyImageBuffer, {
    filename: 'test-listing.jpg',
    contentType: 'image/jpeg'
  });

  try {
    const imageResponse = await axios.post(API_URL, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer test-token-for-failure'
      }
    });
    console.log('✅ Image extraction succeeded (unexpected)');
    console.log(JSON.stringify(imageResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Image extraction failed:');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    console.log('Full error response:', JSON.stringify(error.response?.data, null, 2));
  }

  console.log('\n-------------------\n');

  // Test 3: Missing authentication
  console.log('🔐 Test 3: Missing authentication');
  try {
    const noAuthResponse = await axios.post(API_URL, textData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ No auth succeeded (unexpected)');
    console.log(JSON.stringify(noAuthResponse.data, null, 2));
  } catch (error) {
    console.log('❌ No auth failed (expected):');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }

  console.log('\n-------------------\n');

  // Test 4: Malformed data
  console.log('💥 Test 4: Malformed data');
  try {
    const malformedResponse = await axios.post(API_URL, {
      // Missing sourceText field
      randomField: "This should fail"
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-for-failure'
      }
    });
    console.log('✅ Malformed data succeeded (unexpected)');
    console.log(JSON.stringify(malformedResponse.data, null, 2));
  } catch (error) {
    console.log('❌ Malformed data failed (expected):');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
};

testExtractInfo();