/**
 * Unit Tests for analyzeListingSource Lambda Function - Yearly Price Conversion
 * 测试年付价格转换为月付价格的功能
 */

const { handler } = require('../../src/features/rentals/analyzeListingSource');

// Mock external dependencies (复用现有的mock方法)
jest.mock('aws-sdk', () => ({
    SSM: jest.fn().mockImplementation(() => ({
        getParameter: jest.fn().mockReturnValue({
            promise: () => Promise.resolve({
                Parameter: {
                    Value: 'fake-gemini-api-key-for-testing'
                }
            })
        })
    }))
}));

// Mock Gemini AI to return yearly price data
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
                response: Promise.resolve({
                    text: () => JSON.stringify({
                        "title": "Beautiful Villa in Canggu",
                        "locationArea": "Canggu",
                        "address": "Jl. Pantai Batu Bolong, Canggu, Bali",
                        "bedrooms": 2,
                        "bathrooms": 2,
                        "monthlyRent": 45833334,
                        "yearlyRent": 550000000,
                        "utilities": null,
                        "deposit": 45833334,
                        "minimumStay": 12,
                        "furnished": true,
                        "petFriendly": false,
                        "smokingAllowed": false,
                        "amenities": ["Pool", "WiFi", "AC"]
                    })
                })
            })
        })
    }))
}));

describe('analyzeListingSource Lambda Function - Yearly Price Conversion', () => {

    describe('✅ 年付转月付价格计算测试', () => {
        test('应该正确将年付价格转换为月付价格', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'test-user-yearly-price'
                        }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'IDR 550,000,000 for a one-year lease. 2 bedrooms.'
                })
            };

            const result = await handler(mockEvent);

            // 验证HTTP状态码
            expect(result.statusCode).toBe(200);

            // 解析返回的body
            const responseBody = JSON.parse(result.body);
            
            // 验证响应结构
            expect(responseBody.success).toBe(true);
            expect(responseBody.data).toBeDefined();
            expect(responseBody.data.extractedListing).toBeDefined();

            // 验证价格转换
            const extractedListing = responseBody.data.extractedListing;
            expect(extractedListing.monthlyRent).toBe(45833334);
            expect(extractedListing.aiExtractedData.yearlyRent).toBe(550000000);
            
            console.log('✅ 年付转月付测试通过');
        });
    });
});
