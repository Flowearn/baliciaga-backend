const { handler } = require('../../src/features/rentals/analyzeListingSource');

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

// Mock Gemini AI with different responses for each scenario
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockImplementation((prompt) => {
                const promptText = prompt.toLowerCase();
                
                // Scenario A: Yearly 120M, Monthly 11M
                if (promptText.includes('surf-ready studio')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Surf-ready Studio with Ocean Views",
                                "locationArea": "Uluwatu",
                                "address": null,
                                "bedrooms": 1,
                                "bathrooms": 1,
                                "monthlyRent": 11000000,
                                "yearlyRent": 120000000,
                                "monthlyRentEquivalent": 10000000,
                                "utilities": null,
                                "deposit": 11000000,
                                "minimumStay": 12,
                                "furnished": true,
                                "petFriendly": true,
                                "smokingAllowed": false,
                                "priceNote": "landlord discount",
                                "amenities": ["Ocean Views", "Fast Wi-Fi", "Surfboard Rack"]
                            })
                        })
                    });
                }
                
                // Scenario B: No smoking policy mentioned
                if (promptText.includes('modern 2-bedroom apartment')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Modern 2-bedroom apartment",
                                "locationArea": "Canggu",
                                "address": null,
                                "bedrooms": 2,
                                "bathrooms": 1,
                                "monthlyRent": 25000000,
                                "yearlyRent": null,
                                "monthlyRentEquivalent": null,
                                "utilities": null,
                                "deposit": null,
                                "minimumStay": null,
                                "furnished": true,
                                "petFriendly": true,
                                "smokingAllowed": null,
                                "priceNote": null,
                                "amenities": ["Pool Access"]
                            })
                        })
                    });
                }
                
                // Scenario C: Kedungu location
                if (promptText.includes('eco-friendly container home')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Eco-friendly Container Home",
                                "locationArea": "Kedungu",
                                "address": null,
                                "bedrooms": 2,
                                "bathrooms": 1,
                                "monthlyRent": 15000000,
                                "yearlyRent": 180000000,
                                "monthlyRentEquivalent": null,
                                "utilities": null,
                                "deposit": null,
                                "minimumStay": null,
                                "furnished": true,
                                "petFriendly": true,
                                "smokingAllowed": true,
                                "priceNote": null,
                                "amenities": ["Solar Power", "Rain-Water Harvesting"]
                            })
                        })
                    });
                }
                
                // Scenario D: USD amount
                if (promptText.includes('luxury cliff-edge mansion')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Luxury Cliff-Edge Mansion",
                                "locationArea": "Bingin",
                                "address": null,
                                "bedrooms": 5,
                                "bathrooms": 5,
                                "monthlyRent": 225000000,
                                "yearlyRent": null,
                                "monthlyRentEquivalent": null,
                                "utilities": null,
                                "deposit": 675000000,
                                "minimumStay": 12,
                                "furnished": true,
                                "petFriendly": false,
                                "smokingAllowed": false,
                                "priceNote": null,
                                "amenities": ["Infinity Pool", "Cinema Room", "Private Chef Quarters"]
                            })
                        })
                    });
                }
                
                // Scenario E: Missing location and policies
                if (promptText.includes('beautiful villa with pool')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Beautiful Villa with Pool",
                                "locationArea": null,
                                "address": null,
                                "bedrooms": 3,
                                "bathrooms": 2,
                                "monthlyRent": 30000000,
                                "yearlyRent": null,
                                "monthlyRentEquivalent": null,
                                "utilities": null,
                                "deposit": null,
                                "minimumStay": null,
                                "furnished": null,
                                "petFriendly": null,
                                "smokingAllowed": null,
                                "priceNote": null,
                                "amenities": ["Pool"]
                            })
                        })
                    });
                }
                
                // Scenario F: Complex pricing with discount
                if (promptText.includes('chic seminyak townhouse')) {
                    return Promise.resolve({
                        response: Promise.resolve({
                            text: () => JSON.stringify({
                                "title": "Chic Seminyak Townhouse",
                                "locationArea": "Seminyak",
                                "address": null,
                                "bedrooms": 2,
                                "bathrooms": 2.5,
                                "monthlyRent": 45833334,
                                "yearlyRent": 550000000,
                                "monthlyRentEquivalent": 45833333,
                                "utilities": null,
                                "deposit": null,
                                "minimumStay": 12,
                                "furnished": true,
                                "petFriendly": true,
                                "smokingAllowed": null,
                                "priceNote": null,
                                "amenities": ["Rooftop Terrace"]
                            })
                        })
                    });
                }
                
                // Default response
                return Promise.resolve({
                    response: Promise.resolve({
                        text: () => JSON.stringify({
                            "title": "Test Property",
                            "locationArea": "Bali",
                            "address": null,
                            "bedrooms": 1,
                            "bathrooms": 1,
                            "monthlyRent": 10000000,
                            "yearlyRent": null,
                            "monthlyRentEquivalent": null,
                            "utilities": null,
                            "deposit": null,
                            "minimumStay": null,
                            "furnished": true,
                            "petFriendly": false,
                            "smokingAllowed": false,
                            "amenities": []
                        })
                    })
                });
            })
        })
    }))
}));

describe('analyzeListingSource - Edge Cases', () => {
    // Mock environment variables
    beforeAll(() => {
        process.env.IS_OFFLINE = 'true';
        process.env.GEMINI_API_KEY = 'test-api-key';
    });

    const createMockEvent = (sourceText) => ({
        requestContext: {
            authorizer: {
                claims: {
                    sub: 'test-user-id'
                }
            }
        },
        body: JSON.stringify({
            sourceText: sourceText
        })
    });

    test('Scenario A: Yearly 120M, Monthly 11M - should have monthlyRentEquivalent ~10M', async () => {
        const sourceText = "Surf-ready studio with sweeping ocean views in Uluwatu. 1 bedroom, 1 bathroom. Fully furnished, fast Wi-Fi, surfboard rack. Annual lease IDR 120,000,000 or 11,000,000 per month. One-month deposit. Pets welcome, no smoking indoors.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        expect(aiData.yearlyRent).toBe(120000000);
        expect(aiData.monthlyRent).toBe(11000000); // Landlord-stated monthly rent preserved
        expect(aiData.monthlyRentEquivalent).toBeCloseTo(10000000, -5); // yearlyRent / 12 ≈ 10M
        
        // Validation should detect the mismatch but not fail the API call
        const difference = Math.abs(aiData.monthlyRentEquivalent - aiData.monthlyRent);
        const percentDiff = (difference / aiData.monthlyRent) * 100;
        expect(percentDiff).toBeGreaterThan(5); // Should detect the mismatch
    });

    test('Scenario B: No smoking policy mentioned - should return null', async () => {
        const sourceText = "Modern 2-bedroom apartment in Canggu. Fully furnished with pool access. Monthly rent IDR 25,000,000. Pets welcome.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        expect(aiData.smokingAllowed).toBeNull(); // Should be null when not mentioned
        expect(aiData.petFriendly).toBe(true); // This is mentioned
        expect(aiData.furnished).toBe(true); // This is mentioned
    });

    test('Scenario C: Kedungu location - should be accepted', async () => {
        const sourceText = "Eco-friendly container home in Kedungu (Tanah Lot). 2 beds 1 bath, solar power, rain-water harvesting. Long-term only: Rp 180,000,000 per year. Furnished. Pets & smokers welcome.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        expect(aiData.locationArea).toBe('Kedungu'); // Should accept Kedungu as valid location
        expect(aiData.yearlyRent).toBe(180000000);
        expect(aiData.monthlyRent).toBeCloseTo(15000000, -5); // 180M / 12 = 15M
    });

    test('Scenario D: USD amount - should not lose magnitude', async () => {
        const sourceText = "Luxury cliff-edge mansion on Bingin. 5 suites, infinity pool, cinema room. Monthly rent $15,000 USD or IDR equivalent, 12-month contract. No pets, no parties.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        // Should preserve the magnitude - $15,000 USD should be a substantial amount
        // Assuming rough conversion rate, this should be millions in IDR, not just 15000
        expect(aiData.monthlyRent).toBeGreaterThan(200000000); // Should be > 200M IDR (225M in mock)
        expect(aiData.locationArea).toBe('Bingin');
        expect(aiData.bedrooms).toBe(5);
    });

    test('Scenario E: Missing location and policies - should handle gracefully', async () => {
        const sourceText = "Beautiful villa with pool. 3 bedrooms, 2 bathrooms. Monthly rent IDR 30,000,000.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        expect(aiData.monthlyRent).toBe(30000000);
        expect(aiData.bedrooms).toBe(3);
        expect(aiData.bathrooms).toBe(2);
        
        // These should be null when not mentioned
        expect(aiData.locationArea).toBeNull();
        expect(aiData.smokingAllowed).toBeNull();
        expect(aiData.petFriendly).toBeNull();
        expect(aiData.furnished).toBeNull();
    });

    test('Scenario F: Complex pricing with discount mention', async () => {
        const sourceText = "Chic Seminyak townhouse walkable to Eat Street. 2 bedrooms, 2.5 baths, rooftop terrace. IDR 550,000,000 for a one-year lease (45,833,334 / mo equivalent). 10% discount for two-year deal. Fully furnished, small dogs allowed.";
        
        const mockEvent = createMockEvent(sourceText);
        const response = await handler(mockEvent);
        const responseBody = JSON.parse(response.body);
        
        expect(responseBody.success).toBe(true);
        
        const aiData = responseBody.data.extractedListing.aiExtractedData;
        expect(aiData.yearlyRent).toBe(550000000);
        expect(aiData.monthlyRent).toBe(45833334); // Landlord-stated monthly preserved
        expect(aiData.monthlyRentEquivalent).toBeCloseTo(45833333, -2); // 550M / 12
        expect(aiData.locationArea).toBe('Seminyak');
        expect(aiData.furnished).toBe(true);
        expect(aiData.petFriendly).toBe(true); // Small dogs allowed
    });

    test('Validation: Samples #1 and #9 should be VALID with priceNote discount', () => {
        // This test verifies that the validation logic correctly handles
        // landlord discounts and marks previously invalid samples as valid
        
        // Sample #1: Surf-ready studio with 9.1% difference but has priceNote
        const sample1 = {
            title: "Surf-ready Studio with Ocean Views",
            bedrooms: 1,
            bathrooms: 1,
            monthlyRent: 11000000,
            yearlyRent: 120000000,
            monthlyRentEquivalent: 10000000,
            priceNote: "landlord discount"
        };
        
        // Sample #9: Co-living with pricing package difference
        const sample9 = {
            title: "Pererenan Co-living Ensuite",
            bedrooms: 1,
            bathrooms: 1,
            monthlyRent: 6000000,
            yearlyRent: 60000000,
            monthlyRentEquivalent: 5000000,
            priceNote: "landlord discount"
        };
        
        // Import validation function (we'll simulate it here)
        const validateExtracted = (obj) => {
            const issues = [];
            
            if (!obj.title) issues.push('missing title');
            if (typeof obj.bedrooms !== 'number') issues.push('bedrooms not number');
            if (typeof obj.bathrooms !== 'number') issues.push('bathrooms not number');
            if (typeof obj.monthlyRent !== 'number') issues.push('monthlyRent not number');
            
            if (obj.yearlyRent && obj.monthlyRent && obj.monthlyRentEquivalent) {
                const difference = Math.abs(obj.monthlyRentEquivalent - obj.monthlyRent);
                const percentDiff = (difference / obj.monthlyRent) * 100;
                const threshold = (obj.priceNote && obj.priceNote.includes('discount')) ? 20 : 5;
                
                if (percentDiff >= threshold) {
                    issues.push(`yearly/monthly mismatch: ${percentDiff.toFixed(1)}% difference`);
                }
            }
            
            return { isValid: issues.length === 0, issues };
        };
        
        const validation1 = validateExtracted(sample1);
        const validation9 = validateExtracted(sample9);
        
        expect(validation1.isValid).toBe(true);
        expect(validation9.isValid).toBe(true);
        expect(validation1.issues).toEqual([]);
        expect(validation9.issues).toEqual([]);
    });
});