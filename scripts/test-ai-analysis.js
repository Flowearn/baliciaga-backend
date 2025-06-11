const sinon = require('sinon');
const AWS = require('aws-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. 在require Lambda函数之前设置 mock AWS SSM v2
// 先创建一个SSM实例，然后stub getParameter方法
const mockSSM = {
    getParameter: sinon.stub().returns({
        promise: () => Promise.resolve({
            Parameter: {
                Value: 'DUMMY_GEMINI_API_KEY_FOR_TESTING'
            }
        })
    })
};

// 替换AWS.SSM构造函数
const ssmConstructorStub = sinon.stub(AWS, 'SSM').returns(mockSSM);

// 现在再require Lambda函数，这样它会使用我们的mock
const { handler } = require('../src/features/rentals/analyzeListingSource.js');

// 2. 使用 sinon 伪造 (mock) Google Generative AI
// 返回一个模拟的AI分析结果（包含新字段）
const mockAIResponse = {
    "title": "3BR Villa with Pool in Canggu",
    "summary": "Beautiful fully furnished 3-bedroom villa with private pool in the heart of Canggu, close to Echo Beach.",
    "locationName": "Canggu",
    "rent": {
        "monthly": 35000000,
        "yearly": 400000000
    },
    "bedrooms": 3,
    "bathrooms": 2,
    "petFriendly": true,
    "availableFrom": "2025-09-01",
    "amenities": ["Fully furnished", "Modern kitchen", "Fast WiFi", "Private swimming pool"],
    "proximity": [
        {
            "time": 5,
            "unit": "minute",
            "poi": "Echo Beach"
        },
        {
            "time": 2,
            "unit": "minute", 
            "poi": "La Brisa"
        }
    ]
};

const generateContentStub = sinon.stub();
generateContentStub.resolves({
    response: {
        text: () => JSON.stringify(mockAIResponse)
    }
});

const getGenerativeModelStub = sinon.stub(GoogleGenerativeAI.prototype, 'getGenerativeModel');
getGenerativeModelStub.returns({
    generateContent: generateContentStub
});

// 2. 准备真实的测试数据
const sampleListingText = `
Beautiful 3 bedroom, 2 bathroom villa available in the heart of Canggu. 
Fully furnished with a modern kitchen, fast WiFi, and a private swimming pool. 
Just a 5 minute scooter ride to Echo Beach and 2 minutes from La Brisa. 
Rent is 35,000,000 IDR per month, or 400,000,000 IDR for a yearly contract. 
Utilities are not included. Pets are welcome! Available from September 1st, 2025.
`;

// 3. 模拟 API Gateway event
const mockEvent = {
  body: JSON.stringify({
    sourceText: sampleListingText
  }),
  headers: {
    Authorization: 'Bearer test-token-for-local-development'
  },
  requestContext: {
    authorizer: {
      claims: null // Will be ignored due to test token
    }
  }
};

// 4. 执行测试
async function runTest() {
  // 设置本地开发环境变量
  process.env.IS_OFFLINE = 'true';
  process.env.STAGE = 'dev';
  
  console.log('--- Running AI Analysis Baseline Test ---');
  console.log('Input Text:\n', sampleListingText);
  
  const result = await handler(mockEvent);
  
  console.log('\n--- Test Result ---');
  console.log('Status Code:', result.statusCode);
  console.log('Response Body:');
  // 以格式化的JSON打印返回的body，方便阅读
  console.log(JSON.stringify(JSON.parse(result.body), null, 2));

  // 恢复原始的功能，避免影响其他测试
  ssmConstructorStub.restore();
  getGenerativeModelStub.restore();
}

runTest(); 