// backend/scripts/e2e-ai-analysis-test.js

const axios = require('axios');

async function testAIAnalysisE2E() {
    console.log('=== AI房源分析功能端到端测试 ===\n');
    
    const testText = `Beautiful 3 bedroom, 2 bathroom villa available in the heart of Canggu. 
Fully furnished with a modern kitchen, fast WiFi, and a private swimming pool. 
Just a 5 minute scooter ride to Echo Beach and 2 minutes from La Brisa. 
Rent is 35,000,000 IDR per month, or 400,000,000 IDR for a yearly contract. 
Utilities are not included. Pets are welcome! Available from September 1st, 2025.`;

    console.log('输入文本:');
    console.log(testText);
    console.log('\n---\n');

    try {
        console.log('正在调用AI分析API: http://localhost:3006/dev/listings/analyze-source');
        
        const response = await axios.post('http://localhost:3006/dev/listings/analyze-source', {
            sourceText: testText
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token-for-local-development'
            },
            timeout: 30000 // 30秒超时
        });

        console.log(`响应状态: ${response.status}`);
        
        if (response.data.success) {
            const extractedData = response.data.data.extractedListing;
            
            console.log('\n🎉 AI分析成功！\n');
            console.log('=== 提取的房源信息 ===');
            
            // 验证字段
            const testResults = {
                'Bedrooms': { expected: 3, actual: extractedData.bedrooms },
                'Bathrooms': { expected: 2, actual: extractedData.bathrooms },
                'Monthly Rent': { expected: 35000000, actual: extractedData.monthlyRent },
                'Pet Friendly': { expected: true, actual: extractedData.petFriendly },
                'Available From': { expected: '2025-09-01', actual: extractedData.availableFrom }
            };
            
            console.log('字段验证结果:');
            let allTestsPassed = true;
            
            for (const [field, test] of Object.entries(testResults)) {
                const passed = test.expected === test.actual;
                const status = passed ? '✅ PASS' : '❌ FAIL';
                console.log(`${status} ${field}: 期望 ${test.expected}, 实际 ${test.actual}`);
                if (!passed) allTestsPassed = false;
            }
            
            console.log('\n=== 其他提取信息 ===');
            console.log(`标题: "${extractedData.title}"`);
            console.log(`描述: "${extractedData.description}"`);
            console.log(`货币: ${extractedData.currency}`);
            console.log(`押金: ${extractedData.deposit}`);
            console.log(`地址: ${extractedData.address}`);
            
            if (extractedData.amenities && extractedData.amenities.length > 0) {
                console.log(`设施: ${extractedData.amenities.join(', ')}`);
            }
            
            if (extractedData.proximity && extractedData.proximity.length > 0) {
                console.log('附近地点:');
                extractedData.proximity.forEach(prox => {
                    console.log(`  - ${prox.poi}: ${prox.time} ${prox.unit}`);
                });
            }
            
            console.log('\n=== 测试结果 ===');
            if (allTestsPassed) {
                console.log('🎉 所有核心字段验证通过！AI房源分析功能端到端测试成功！');
                return true;
            } else {
                console.log('⚠️  部分核心字段验证失败，请检查AI prompt或分析逻辑。');
                return false;
            }
            
        } else {
            console.log('❌ AI分析失败:', response.data);
            return false;
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('响应状态:', error.response.status);
            console.error('响应数据:', error.response.data);
        }
        return false;
    }
}

// 运行测试
testAIAnalysisE2E()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('意外错误:', error);
        process.exit(1);
    }); 