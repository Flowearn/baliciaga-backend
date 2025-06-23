// Browser Console CORS Test Script
// Copy and paste this into your browser's developer console

// Replace with your actual API Gateway URL
const API_BASE_URL = 'https://your-api-gateway-url.execute-api.ap-southeast-1.amazonaws.com/dev';

async function testCORSFromBrowser() {
  console.log('🚀 Starting CORS test from browser...\n');
  
  // Test 1: Simple fetch request
  console.log('📋 Test 1: Simple GET request to /listings');
  try {
    const response = await fetch(`${API_BASE_URL}/listings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response received!');
    console.log('Status:', response.status, response.statusText);
    console.log('CORS Headers:');
    console.log('- Access-Control-Allow-Origin:', response.headers.get('access-control-allow-origin'));
    console.log('- Access-Control-Allow-Credentials:', response.headers.get('access-control-allow-credentials'));
    
    const data = await response.json();
    console.log('Response data:', data);
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
    console.error('This might be a CORS error. Check the Network tab for details.');
  }
  
  // Test 2: With credentials
  console.log('\n📋 Test 2: GET request with credentials');
  try {
    const response = await fetch(`${API_BASE_URL}/listings`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response with credentials received!');
    console.log('Status:', response.status);
    
    const data = await response.json();
    console.log('Response data:', data);
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
  }
  
  // Test 3: With Authorization header
  console.log('\n📋 Test 3: GET request with Authorization header');
  try {
    const response = await fetch(`${API_BASE_URL}/listings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });
    
    console.log('✅ Response with auth header received!');
    console.log('Status:', response.status);
    
    const data = await response.json();
    console.log('Response data:', data);
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
  }
  
  console.log('\n✨ Test complete! Check the Network tab for detailed request/response information.');
}

// Instructions
console.log(`
🔧 CORS Test Instructions:
1. Replace API_BASE_URL with your actual API Gateway URL
2. Open your website: https://baliciaga-frontend-kxpx3yl8c-ride-da-wave.vercel.app/
3. Open Developer Tools (F12)
4. Go to Console tab
5. Copy and paste this entire script
6. Run: testCORSFromBrowser()
7. Check both Console and Network tabs for results
`);

// Function is ready to be called
// testCORSFromBrowser();