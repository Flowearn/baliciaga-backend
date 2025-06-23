const axios = require('axios');

// Your deployed API endpoint
const API_BASE_URL = 'https://your-api-gateway-url.execute-api.ap-southeast-1.amazonaws.com/dev';
const FRONTEND_URL = 'https://baliciaga-frontend-kxpx3yl8c-ride-da-wave.vercel.app';

async function testCORS() {
  console.log('Testing CORS configuration...\n');

  try {
    // Test 1: Simple GET request
    console.log('Test 1: Simple GET request to /listings');
    const response1 = await axios.get(`${API_BASE_URL}/listings`, {
      headers: {
        'Origin': FRONTEND_URL,
      }
    });
    console.log('✅ Success! Status:', response1.status);
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': response1.headers['access-control-allow-origin'],
      'Access-Control-Allow-Credentials': response1.headers['access-control-allow-credentials'],
    });
    console.log('Response data:', JSON.stringify(response1.data, null, 2));
    
    // Test 2: OPTIONS preflight request
    console.log('\n\nTest 2: OPTIONS preflight request');
    const response2 = await axios.options(`${API_BASE_URL}/listings`, {
      headers: {
        'Origin': FRONTEND_URL,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      }
    });
    console.log('✅ Preflight Success! Status:', response2.status);
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': response2.headers['access-control-allow-origin'],
      'Access-Control-Allow-Methods': response2.headers['access-control-allow-methods'],
      'Access-Control-Allow-Headers': response2.headers['access-control-allow-headers'],
      'Access-Control-Allow-Credentials': response2.headers['access-control-allow-credentials'],
    });

    // Test 3: Authenticated request simulation
    console.log('\n\nTest 3: GET request with Authorization header');
    const response3 = await axios.get(`${API_BASE_URL}/listings`, {
      headers: {
        'Origin': FRONTEND_URL,
        'Authorization': 'Bearer fake-token-for-testing',
        'Content-Type': 'application/json',
      }
    });
    console.log('✅ Success with auth header! Status:', response3.status);
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': response3.headers['access-control-allow-origin'],
      'Access-Control-Allow-Credentials': response3.headers['access-control-allow-credentials'],
    });

  } catch (error) {
    console.error('❌ Error occurred:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Instructions
console.log('Before running this test:');
console.log('1. Replace API_BASE_URL with your actual API Gateway URL');
console.log('2. Run: npm install axios');
console.log('3. Run: node test-cors.js\n');

// Uncomment to run the test
// testCORS();