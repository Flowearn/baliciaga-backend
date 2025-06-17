/**
 * Unit Tests for analyzeListingSource Lambda Function
 * 重点测试输入验证和响应处理逻辑
 */

const { handler } = require('./analyzeListingSource');

// Mock external dependencies
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

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
                response: Promise.resolve({
                    text: () => JSON.stringify({
                        "title": "Test Location",
                        "locationArea": "Ubud",
                        "address": "Test Address, Bali",
                        "bedrooms": 2,
                        "bathrooms": 1,
                        "monthlyRent": 5000000,
                        "yearlyRent": null,
                        "utilities": null,
                        "deposit": 5000000,
                        "minimumStay": 12,
                        "furnished": true,
                        "petFriendly": false,
                        "smokingAllowed": false,
                        "amenities": ["wifi", "pool"]
                    })
                })
            })
        })
    }))
}));

describe('analyzeListingSource Lambda Function', () => {

    describe('✅ 测试场景一：AI成功返回标准JSON', () => {
        test('应该成功解析AI返回的标准JSON并返回200状态码', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'test-user-123'
                        }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'Beautiful 2-bedroom villa in Ubud, Bali. Monthly rent: 15,000,000 IDR. Close to beach (10 minutes drive), market (5 minutes walk). Amenities: pool, wifi, kitchen.'
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
            expect(responseBody.data.sourceText).toBeDefined();
            expect(responseBody.data.aiProcessedAt).toBeDefined();

            // 验证提取的数据
            const extractedListing = responseBody.data.extractedListing;
            expect(extractedListing.title).toBe('Test Location');
            expect(extractedListing.monthlyRent).toBe(5000000);
            expect(extractedListing.currency).toBe('IDR');
            expect(extractedListing.bedrooms).toBe(2);
            expect(extractedListing.amenities).toEqual(['wifi', 'pool']);
            
            console.log('✅ 测试场景一通过：AI成功返回标准JSON并正确解析');
        });
    });

    describe('❌ 测试场景二：输入验证测试', () => {
        test('应该在缺少认证token时返回401', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {} // 缺少claims
                },
                body: JSON.stringify({
                    sourceText: 'Some text'
                })
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(401);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('UNAUTHORIZED');
            
            console.log('✅ 测试场景二通过：正确处理缺少认证token的情况');
        });

        test('应该在缺少sourceText时返回400', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-789' }
                    }
                },
                body: JSON.stringify({}) // 缺少sourceText
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('MISSING_SOURCE_TEXT');
            
            console.log('✅ 测试场景二通过：正确处理缺少sourceText的情况');
        });

        test('应该在sourceText为空时返回400', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-789' }
                    }
                },
                body: JSON.stringify({
                    sourceText: '   ' // 空白字符串
                })
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('EMPTY_SOURCE_TEXT');
            
            console.log('✅ 测试场景二通过：正确处理空sourceText的情况');
        });

        test('应该在sourceText过长时返回400', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-789' }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'a'.repeat(10001) // 超过10000字符限制
                })
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('SOURCE_TEXT_TOO_LONG');
            
            console.log('✅ 测试场景二通过：正确处理过长sourceText的情况');
        });

        test('应该在请求body无效JSON时返回400', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-json' }
                    }
                },
                body: 'invalid json {{{' // 无效JSON
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('INVALID_JSON');
            
            console.log('✅ 测试场景二通过：正确处理无效JSON的情况');
        });
    });

    describe('🔧 响应结构验证测试', () => {
        test('应该返回正确的CORS头', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-cors' }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'Test property description'
                })
            };

            const result = await handler(mockEvent);

            // 验证CORS头存在 (不管是成功还是失败响应，CORS头都应该存在)
            expect(result.headers).toBeDefined();
            expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
            expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
            expect(result.headers['Access-Control-Allow-Methods']).toBe('POST,OPTIONS');
            expect(result.headers['Content-Type']).toBe('application/json');
            
            console.log('✅ 响应结构验证通过：CORS头正确设置');
        });

        test('应该返回结构化的成功响应', async () => {
            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-structure' }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'Modern apartment with great amenities'
                })
            };

            const result = await handler(mockEvent);

            expect(result.statusCode).toBe(200);
            const responseBody = JSON.parse(result.body);
            
            // 验证响应结构
            expect(responseBody.success).toBe(true);
            expect(responseBody.data).toBeDefined();
            expect(responseBody.data.extractedListing).toBeDefined();
            expect(responseBody.data.sourceText).toBeDefined();
            expect(responseBody.data.aiProcessedAt).toBeDefined();
            
            // 验证提取的listing包含所有必需字段
            const listing = responseBody.data.extractedListing;
            expect(listing.title).toBeDefined();
            expect(listing.monthlyRent).toBeDefined();
            expect(listing.currency).toBeDefined();
            expect(listing.bedrooms).toBeDefined();
            expect(listing.bathrooms).toBeDefined();
            expect(listing.amenities).toBeDefined();
            expect(listing.locationArea).toBeDefined();
            expect(listing.aiExtractedData).toBeDefined();
            
            console.log('✅ 响应结构验证通过：返回完整的结构化数据');
        });
    });

    describe('🚫 测试场景三：AI返回非JSON错误文本', () => {
        // 单独测试AI返回错误的情况
        test('应该正确处理AI返回无效文本', async () => {
            // 重新模拟GoogleGenerativeAI以返回无效响应
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            GoogleGenerativeAI.mockImplementation(() => ({
                getGenerativeModel: jest.fn().mockReturnValue({
                    generateContent: jest.fn().mockResolvedValue({
                        response: Promise.resolve({
                            text: () => 'Sorry, I cannot process this request. This is not JSON.'
                        })
                    })
                })
            }));

            const mockEvent = {
                requestContext: {
                    authorizer: {
                        claims: { sub: 'test-user-ai-error' }
                    }
                },
                body: JSON.stringify({
                    sourceText: 'Some property description that confuses AI'
                })
            };

            const result = await handler(mockEvent);

            // 验证返回500错误
            expect(result.statusCode).toBe(500);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error.code).toBe('AI_RESPONSE_PARSE_ERROR');
            
            console.log('✅ 测试场景三通过：正确处理AI返回非JSON错误');
        });
    });
});

console.log(`
🎯 测试总结：
====================
✅ 本测试文件专注于验证 analyzeListingSource Lambda 函数的核心功能：

1. 📥 输入验证：认证、JSON解析、字段验证
2. 📤 响应结构：CORS头、成功响应格式 
3. 🔄 数据转换：AI响应到前端格式的转换
4. ❌ 错误处理：各种错误场景的正确处理

主要测试场景：
- AI成功返回标准JSON → 200响应
- 各种输入验证错误 → 4xx响应
- AI返回无效响应 → 500响应
- 响应结构和CORS配置验证

注意：本测试使用模拟数据，专注于逻辑验证而非外部API调用。
====================
`); 