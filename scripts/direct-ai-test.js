// backend/scripts/direct-ai-test.js
// 直接测试AI分析功能

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 设置环境变量以模拟serverless offline环境
process.env.IS_OFFLINE = 'true';
process.env.STAGE = 'dev';

const { handler } = require('../src/features/rentals/analyzeListingSource');

async function testAI() {
    console.log('=== 直接AI分析测试 ===\\n');
    
    const testEvent = {
        headers: {
            'Authorization': 'Bearer test-token-for-local-development',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sourceText: `Beautiful 3 bedroom, 2 bathroom villa available in the heart of Canggu. 
Fully furnished with a modern kitchen, fast WiFi, and a private swimming pool. 
Just a 5 minute scooter ride to Echo Beach and 2 minutes from La Brisa. 
Rent is 35,000,000 IDR per month, or 400,000,000 IDR for a yearly contract. 
Utilities are not included. Pets are welcome! Available from September 1st, 2025.`
        }),
        requestContext: {
            authorizer: {
                claims: null // 测试时使用空的claims
            }
        }
    };

    try {
        console.log('正在调用AI分析函数...');
        const result = await handler(testEvent);
        
        console.log('✅ 测试成功!');
        console.log('状态码:', result.statusCode);
        console.log('响应体:', JSON.stringify(JSON.parse(result.body), null, 2));
        
        // 验证关键字段
        const responseData = JSON.parse(result.body);
        if (responseData.success && responseData.data) {
            const extracted = responseData.data.extractedListing;
            console.log('\\n🔍 提取的数据验证:');
            console.log('- 卧室数量:', extracted.bedrooms);
            console.log('- 浴室数量:', extracted.bathrooms);
            console.log('- 月租金:', extracted.monthlyRent);
            console.log('- 宠物友好:', extracted.petFriendly);
            console.log('- 可入住日期:', extracted.availableFrom);
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.error('错误堆栈:', error.stack);
    }
}

// 运行测试
testAI().catch(console.error); 