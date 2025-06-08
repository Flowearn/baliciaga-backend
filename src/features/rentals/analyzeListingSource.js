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
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Parse and validate request
        const { sourceText } = await parseAndValidateRequest(event);
        
        // 2. Get Gemini API key from SSM
        const geminiApiKey = await getGeminiApiKey();
        
        // 3. Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    if (!claims || !claims.sub) {
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
 * Get Gemini API key from SSM Parameter Store
 */
async function getGeminiApiKey() {
    try {
        const parameterName = `/baliciaga/${process.env.STAGE || 'dev'}/geminiApiKey`;
        
        const params = {
            Name: parameterName,
            WithDecryption: true
        };

        const result = await ssm.getParameter(params).promise();
        
        if (!result.Parameter || !result.Parameter.Value) {
            throw createError(500, 'MISSING_API_KEY', 'Gemini API key not found in parameter store');
        }

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
You are a real estate assistant that extracts structured information from rental property descriptions. 

Please analyze the following text and extract rental property information. Return ONLY a valid JSON object with the following structure:

{
  "title": "string (concise property title)",
  "monthlyRent": number (monthly rent amount),
  "currency": "string (3-letter currency code like USD, SGD, etc.)",
  "deposit": number (security deposit amount),
  "utilities": number (utilities cost per month, 0 if included),
  "bedrooms": number (number of bedrooms),
  "bathrooms": number (number of bathrooms),
  "squareFootage": number (size in square feet, null if not mentioned),
  "furnished": boolean (true if furnished/furnished mentioned),
  "petFriendly": boolean (true if pets allowed),
  "smokingAllowed": boolean (true if smoking allowed),
  "address": "string (full address or location)",
  "availableFrom": "string (ISO date format YYYY-MM-DD, use reasonable estimate if not exact)",
  "minimumStay": number (minimum lease term in months, default 12 if not mentioned),
  "description": "string (clean, formatted description based on the source)",
  "amenities": ["array", "of", "amenity", "strings"]
}

Rules:
1. Extract information as accurately as possible from the text
2. Use reasonable defaults for missing information
3. For currency, infer from context (USD for US, SGD for Singapore, etc.)
4. For dates, use YYYY-MM-DD format (estimate if needed)
5. For boolean fields, be conservative - only true if clearly stated
6. Return ONLY the JSON object, no additional text

Source text to analyze:
${sourceText}
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
        
        // Validate required fields
        const requiredFields = ['title', 'monthlyRent', 'currency', 'bedrooms', 'bathrooms', 'address'];
        const missingFields = requiredFields.filter(field => !parsedData.hasOwnProperty(field));
        
        if (missingFields.length > 0) {
            throw createError(500, 'AI_PARSING_ERROR', `AI response missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate data types and set defaults
        const validatedData = {
            title: String(parsedData.title || 'Rental Property'),
            monthlyRent: Number(parsedData.monthlyRent) || 0,
            currency: String(parsedData.currency || 'USD'),
            deposit: Number(parsedData.deposit) || 0,
            utilities: Number(parsedData.utilities) || 0,
            bedrooms: Number(parsedData.bedrooms) || 1,
            bathrooms: Number(parsedData.bathrooms) || 1,
            squareFootage: parsedData.squareFootage ? Number(parsedData.squareFootage) : null,
            furnished: Boolean(parsedData.furnished),
            petFriendly: Boolean(parsedData.petFriendly),
            smokingAllowed: Boolean(parsedData.smokingAllowed),
            address: String(parsedData.address || 'Address not specified'),
            availableFrom: parsedData.availableFrom || new Date().toISOString().split('T')[0],
            minimumStay: Number(parsedData.minimumStay) || 12,
            description: String(parsedData.description || ''),
            amenities: Array.isArray(parsedData.amenities) ? parsedData.amenities : []
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