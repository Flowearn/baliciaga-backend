/**
 * Listing Source Analysis Lambda Function
 * Handles POST /listings/analyze-source - Extract structured information from raw text
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Gemini AI integration for text analysis
 * - Input validation and sanitization
 * - Structured JSON response
 * - CORS support
 */

const AWS = require('aws-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize SSM for retrieving API keys
const ssm = new AWS.SSM({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🤖 analyzeListingSource Lambda triggered');
    
    // 1. 本地开发模式下的MOCK逻辑
    if (process.env.IS_OFFLINE) {
        console.log('[MOCK] AI Analysis running in local offline mode. Returning mock data.');
        const mockExtractedData = {
            title: "Mocked: 3BR Villa with Pool in Canggu",
            summary: "This is a mocked response for local development - a beautiful 3-bedroom villa with private pool in the heart of Canggu.",
            locationName: "Canggu",
            rent: { 
                monthly: 35000000, 
                yearly: 400000000 
            },
            bedrooms: 3,
            bathrooms: 2,
            petFriendly: true,
            availableFrom: "2025-09-01",
            amenities: ["Fully furnished", "Modern kitchen", "Fast WiFi", "Private swimming pool"],
            proximity: [
                { time: 5, unit: "minute", poi: "Echo Beach" },
                { time: 2, unit: "minute", poi: "La Brisa" }
            ]
        };
        
        return createResponse(200, {
            success: true,
            data: {
                extractedListing: mockExtractedData,
                sourceText: "Beautiful 3 bedroom, 2 bathroom villa available...", // Mock snippet
                aiProcessedAt: new Date().toISOString()
            }
        });
    }

    // 2. 云端真实逻辑（现有代码）
    console.log('[CLOUD] AI Analysis running in cloud mode. Calling real services.');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Parse and validate request
        const { sourceText } = await parseAndValidateRequest(event);
        
        // 2. Get Gemini API key from SSM
        const geminiApiKey = await getGeminiApiKey();
        
        // 3. Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        // 4. Construct analysis prompt
        const prompt = constructAnalysisPrompt(sourceText);
        
        // 5. Call Gemini API
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponseText = response.text();
        
        // 6. Parse AI response
        const extractedData = await parseAIResponse(aiResponseText);
        
        // 7. Return structured response
        return createResponse(200, {
            success: true,
            data: {
                extractedListing: extractedData,
                sourceText: sourceText.substring(0, 200) + (sourceText.length > 200 ? '...' : ''), // Return snippet for reference
                aiProcessedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error in analyzeListingSource:', error);
        
        // Handle different error types
        if (error.statusCode) {
            return createResponse(error.statusCode, {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.details && { details: error.details })
                }
            });
        }

        // Unknown error
        return createResponse(500, {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred during AI analysis'
            }
        });
    }
};

/**
 * Parse and validate the incoming request
 */
async function parseAndValidateRequest(event) {
    // Extract Cognito claims for authentication
    const claims = event.requestContext?.authorizer?.claims;
    
    // For local development, allow test tokens to bypass strict validation
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const isLocalDev = process.env.IS_OFFLINE === 'true';
    const isTestToken = authHeader && authHeader.includes('test-token');
    
    if (!isLocalDev && (!claims || !claims.sub)) {
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }
    
    // For local development with test token, create mock claims
    if (isLocalDev && isTestToken) {
        console.log('🧪 Using test token for local development');
        // Continue with test execution
    } else if (!claims || !claims.sub) {
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    // Validate sourceText exists
    if (!body.sourceText || typeof body.sourceText !== 'string') {
        throw createError(400, 'MISSING_SOURCE_TEXT', 'sourceText is required and must be a string');
    }

    // Validate sourceText length
    const sourceText = body.sourceText.trim();
    if (sourceText.length === 0) {
        throw createError(400, 'EMPTY_SOURCE_TEXT', 'sourceText cannot be empty');
    }

    if (sourceText.length > 10000) {
        throw createError(400, 'SOURCE_TEXT_TOO_LONG', 'sourceText cannot exceed 10,000 characters');
    }

    return { sourceText };
}

/**
 * Get Gemini API key from SSM Parameter Store or environment variable
 */
async function getGeminiApiKey() {
    // For local development, first try environment variable
    const isLocalDev = process.env.IS_OFFLINE === 'true';
    if (isLocalDev && process.env.GEMINI_API_KEY) {
        console.log('🔑 Using GEMINI_API_KEY from environment variable for local development');
        return process.env.GEMINI_API_KEY;
    }

    try {
        const parameterName = `/baliciaga/${process.env.STAGE || 'dev'}/geminiApiKey`;
        
        const params = {
            Name: parameterName,
            WithDecryption: true
        };

        console.log(`🔍 Fetching API key from SSM: ${parameterName} in region: ${process.env.AWS_REGION}`);
        const result = await ssm.getParameter(params).promise();
        
        if (!result.Parameter || !result.Parameter.Value) {
            throw createError(500, 'MISSING_API_KEY', 'Gemini API key not found in parameter store');
        }

        console.log('✅ Successfully retrieved API key from SSM');
        return result.Parameter.Value;
    } catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw custom errors
        }
        console.error('Error fetching Gemini API key:', error);
        throw createError(500, 'API_KEY_RETRIEVAL_ERROR', 'Failed to retrieve API key');
    }
}

/**
 * Construct detailed analysis prompt for Gemini
 */
function constructAnalysisPrompt(sourceText) {
    return `
You are an expert real estate data analyst for Bali, Indonesia. Your task is to meticulously extract structured information from a given text describing a property for rent.

**Instructions:**
1.  Analyze the following property description text.
2.  Extract the specified fields and their values into the JSON schema provided.
3.  Generate a concise, appealing 'title' based on the property's key features (e.g., "3BR Villa with Pool in Canggu").
4.  Generate a short, one-sentence 'summary' of the property.
5.  For boolean values like 'petFriendly', interpret phrases like "pets are welcome" as true.
6.  For dates like 'availableFrom', parse them into YYYY-MM-DD format.
7.  If a value for a specific field is not mentioned, use a value of null. Do not make up information.
8.  The final output MUST be a single, valid JSON object, without any surrounding text, explanations, or markdown formatting like \`\`\`json.

**JSON Output Schema:**
{
  "title": "string | null",
  "summary": "string | null",
  "locationName": "string | null",
  "rent": {
    "monthly": "number | null",
    "yearly": "number | null"
  },
  "bedrooms": "number | null",
  "bathrooms": "number | null",
  "petFriendly": "boolean | null",
  "availableFrom": "string (YYYY-MM-DD format) | null",
  "amenities": ["string", "string", ...],
  "proximity": [
    {
      "time": "number | null",
      "unit": "string | null",
      "poi": "string | null"
    }
  ]
}

**Property Description Text:**
---
${sourceText}
---

Please return ONLY a valid JSON object.
`;
}

/**
 * Parse and validate AI response
 */
async function parseAIResponse(aiResponseText) {
    try {
        // Clean up the response - remove any markdown or extra text
        let cleanedResponse = aiResponseText.trim();
        
        // Remove markdown code blocks if present
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Parse JSON
        const parsedData = JSON.parse(cleanedResponse);
        
        // Validate required fields for new schema
        const requiredFields = ['title', 'summary', 'locationName', 'rent', 'bedrooms', 'bathrooms', 'petFriendly', 'availableFrom', 'amenities', 'proximity'];
        const missingFields = requiredFields.filter(field => !parsedData.hasOwnProperty(field));
        
        if (missingFields.length > 0) {
            throw createError(500, 'AI_PARSING_ERROR', `AI response missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate and transform data to match the expected format
        const validatedData = {
            // Use AI-generated title and summary
            title: String(parsedData.title || parsedData.locationName || 'Rental Property'),
            monthlyRent: Number(parsedData.rent?.monthly) || 0,
            currency: 'IDR', // Default for Bali properties
            deposit: parsedData.rent?.monthly ? Number(parsedData.rent.monthly) * 2 : 0, // Estimate 2 months rent
            utilities: 0, // Default to included
            bedrooms: Number(parsedData.bedrooms) || 1,
            bathrooms: Number(parsedData.bathrooms) || 1,
            squareFootage: null, // Not provided in current schema
            furnished: true, // Default assumption for Bali rentals
            petFriendly: parsedData.petFriendly === true, // Use AI-extracted value
            smokingAllowed: false, // Conservative default
            address: String(parsedData.locationName || 'Address not specified'),
            availableFrom: parsedData.availableFrom || new Date().toISOString().split('T')[0], // Use AI-extracted date or default to today
            minimumStay: 12, // Default 12 months
            description: String(parsedData.summary || `Property in ${parsedData.locationName || 'Bali'}`), // Use AI-generated summary
            amenities: Array.isArray(parsedData.amenities) ? parsedData.amenities : [],
            
            // New fields from updated schema
            proximity: Array.isArray(parsedData.proximity) ? parsedData.proximity.map(item => ({
                time: item.time ? Number(item.time) : null,
                unit: item.unit ? String(item.unit) : null,
                poi: item.poi ? String(item.poi) : null
            })) : [],
            
            // Store original AI data for reference
            aiExtractedData: {
                title: parsedData.title,
                summary: parsedData.summary,
                locationName: parsedData.locationName,
                rent: parsedData.rent,
                bedrooms: parsedData.bedrooms,
                bathrooms: parsedData.bathrooms,
                petFriendly: parsedData.petFriendly,
                availableFrom: parsedData.availableFrom,
                amenities: parsedData.amenities,
                proximity: parsedData.proximity
            }
        };

        return validatedData;
        
    } catch (error) {
        console.error('Error parsing AI response:', error);
        console.error('AI Response Text:', aiResponseText);
        
        if (error.statusCode) {
            throw error; // Re-throw custom errors
        }
        
        throw createError(500, 'AI_RESPONSE_PARSE_ERROR', 'Failed to parse AI response as valid JSON');
    }
}

/**
 * Create standardized error object
 */
function createError(statusCode, code, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    if (details) error.details = details;
    return error;
}

/**
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 