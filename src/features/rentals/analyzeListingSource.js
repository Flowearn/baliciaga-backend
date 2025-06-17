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
 * Normalize price text by removing currency symbols and thousand separators
 */
function normalizePriceText(raw) {
    return raw
        .replace(/(?:IDR|Rp|USD|\$)\s?/gi, '')  // 去币种
        .replace(/(?<=\d)[,.](?=\d{3}\b)/g, '') // 去千位分隔符
}

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
    // Normalize price text before analysis
    const normalizedText = normalizePriceText(sourceText);
    
    const prompt = `
You are an expert real estate data analyst for Bali. Your task is to extract structured information from a given text or image about a property listing.

**Instructions:**
1.  Analyze the provided text and/or image content carefully.
2.  Extract the information for the fields defined in the JSON schema below.
3.  If a piece of information is not found, use a null value for that field.
4.  The "locationArea" should be a general, well-known area like 'Canggu', 'Ubud', 'Pererenan', 'Seminyak', 'Uluwatu'. Do not use the full street address.
5.  "amenities" should be an array of short, descriptive strings.
6.  All prices must be integers, without any symbols or commas.
7.  **You MUST respond ONLY with a single, valid JSON object that adheres to the following schema. Do not include any explanatory text, markdown formatting, or anything else outside of the JSON object.**
8.  If the text contains a yearly price (e.g. "IDR 550,000,000 per year"), divide that value by 12 **(round to nearest integer)** and assign the result to "monthlyRent". Set "yearlyRent" to the original yearly integer.
9.  Remove currency symbols (IDR, Rp, $, etc.) and any thousand separators (comma or dot) before returning numeric values.
10. If both yearly and monthly prices are present, assume the yearly price already includes a bulk-lease discount. Return it unchanged in \`yearlyRent\`. Do **not** overwrite the landlord-stated \`monthlyRent\`; instead, calculate \`monthlyRentFromYearly = yearlyRent / 12\` and append it to the JSON under a new helper field \`monthlyRentEquivalent\`. If the difference is >5%, add a \`priceNote\` field with "landlord discount".
11. For smoking, pet, furnished policies: if text has no mention, return \`null\` (leave decision to user). Do **not** coerce to \`false\`.
12. \`locationArea\` may be **any** Bali locality explicitly mentioned (e.g. Kedungu, Kerobokan, Bingin). If no area appears, set \`locationArea\` to \`null\` and leave to user.
13. When extracting bathroom count, accept "ensuite", "shared" etc. If text shows "5 ensuite bathrooms", "2.5 baths", or "5 suites" (assume 1 bathroom per suite), extract the number. Always return as a number, not string. If unclear, estimate based on bedrooms (minimum 1).
14. **CRITICAL**: All price fields (monthlyRent, yearlyRent, monthlyRentEquivalent, utilities, deposit) must be integers in JSON without quotes. Never return price values as strings.
15. If text mentions yearly price but no explicit monthly price, calculate monthlyRent = yearlyRent / 12. If text mentions both, preserve the explicit monthly price and calculate monthlyRentEquivalent separately.

**JSON Schema:**
{
  "title": "string",
  "locationArea": "string | null",
  "address": "string | null",
  "bedrooms": "number",
  "bathrooms": "number",
  "monthlyRent": "number",
  "yearlyRent": "number | null",
  "monthlyRentEquivalent": "number | null",
  "utilities": "number | null",
  "deposit": "number | null",
  "minimumStay": "number | null",
  "furnished": "boolean | null",
  "petFriendly": "boolean | null",
  "smokingAllowed": "boolean | null",
  "priceNote": "string | null",
  "amenities": ["string"]
}

---

**Example 1:**

*Input Text:* "For rent: Beautiful 2-bedroom, 2-bathroom villa in Canggu. Fully furnished with a private pool, AC in both rooms, and fast Wi-Fi. Monthly rent is IDR 25,000,000. One month security deposit required. Available August 1st, 2025, minimum stay 6 months. Pets are considered. No smoking indoors. Address: Jl. Pantai Batu Bolong No.5, Canggu, Bali."

*Your JSON Response:*
{
  "title": "Beautiful 2BR Villa with Pool",
  "locationArea": "Canggu",
  "address": "Jl. Pantai Batu Bolong No.5, Canggu, Bali",
  "bedrooms": 2,
  "bathrooms": 2,
  "monthlyRent": 25000000,
  "yearlyRent": null,
  "utilities": null,
  "deposit": 25000000,
  "minimumStay": 6,
  "furnished": true,
  "petFriendly": true,
  "smokingAllowed": false,
  "amenities": ["Private Pool", "AC", "Fast Wi-Fi"]
}

---

Now, analyze the following content:
${normalizedText}
`;
    
    return prompt;
}

/**
 * Validate extracted listing data
 */
function validateExtracted(obj) {
    const issues = [];
    
    // Check required core fields
    if (!obj.title) issues.push('missing title');
    if (typeof obj.bedrooms !== 'number') issues.push('bedrooms not number');
    if (typeof obj.bathrooms !== 'number') issues.push('bathrooms not number');
    if (typeof obj.monthlyRent !== 'number') issues.push('monthlyRent not number');
    
    // Check yearly/monthly price consistency if both exist
    if (obj.yearlyRent && obj.monthlyRent && obj.monthlyRentEquivalent) {
        const difference = Math.abs(obj.monthlyRentEquivalent - obj.monthlyRent);
        const percentDiff = (difference / obj.monthlyRent) * 100;
        
        // Use relaxed threshold if priceNote indicates landlord discount
        const threshold = (obj.priceNote && obj.priceNote.includes('discount')) ? 20 : 5;
        
        if (percentDiff >= threshold) {
            issues.push(`yearly/monthly mismatch: ${percentDiff.toFixed(1)}% difference`);
        }
    }
    
    // Allow null values for boolean fields (don't enforce non-null)
    // Allow any locationArea string (don't restrict to predefined list)
    
    // Only warn if completely missing location AND no monthlyRent
    if (!obj.locationArea && !obj.monthlyRent) {
        issues.push('missing both locationArea and monthlyRent');
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
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
        
        // Post-processing: Fix data types
        // Convert string prices to numbers
        const priceFields = ['monthlyRent', 'yearlyRent', 'monthlyRentEquivalent', 'utilities', 'deposit'];
        priceFields.forEach(field => {
            if (parsedData[field] && typeof parsedData[field] === 'string') {
                // Remove commas and spaces, then convert to number
                const cleanedPrice = parsedData[field].replace(/[,\s]/g, '');
                parsedData[field] = Number(cleanedPrice) || null;
            }
        });
        
        // Convert string bathrooms to number
        if (parsedData.bathrooms && typeof parsedData.bathrooms === 'string') {
            parsedData.bathrooms = Number(parsedData.bathrooms) || 1;
        }
        
        // Fix missing bathrooms - estimate from bedrooms or default to 1
        if (!parsedData.bathrooms || parsedData.bathrooms === null) {
            parsedData.bathrooms = Math.max(1, parsedData.bedrooms || 1);
        }
        
        // Fix missing monthlyRent when yearlyRent exists
        if (!parsedData.monthlyRent && parsedData.yearlyRent) {
            parsedData.monthlyRent = Math.round(parsedData.yearlyRent / 12);
        }
        
        // Validate required fields for new schema (relaxed validation)
        const requiredFields = ['title', 'bedrooms', 'bathrooms', 'monthlyRent', 'amenities'];
        const missingFields = requiredFields.filter(field => !parsedData.hasOwnProperty(field));
        
        if (missingFields.length > 0) {
            throw createError(500, 'AI_PARSING_ERROR', `AI response missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate and transform data to match the expected format
        const validatedData = {
            title: String(parsedData.title || 'Rental Property'),
            monthlyRent: Number(parsedData.monthlyRent) || 0,
            currency: 'IDR', // Default for Bali properties
            deposit: parsedData.deposit ? Number(parsedData.deposit) : (parsedData.monthlyRent ? Number(parsedData.monthlyRent) : 0),
            utilities: parsedData.utilities ? Number(parsedData.utilities) : 0,
            bedrooms: Number(parsedData.bedrooms) || 1,
            bathrooms: Number(parsedData.bathrooms) || 1,
            squareFootage: null, // Not provided in current schema
            furnished: parsedData.furnished === true,
            petFriendly: parsedData.petFriendly === true,
            smokingAllowed: parsedData.smokingAllowed === true,
            address: String(parsedData.address || 'Address not specified'),
            locationArea: String(parsedData.locationArea || 'Bali'),
            availableFrom: new Date().toISOString().split('T')[0], // Default to today
            minimumStay: parsedData.minimumStay ? Number(parsedData.minimumStay) : 12,
            description: String(parsedData.title || `Property in ${parsedData.locationArea || 'Bali'}`),
            amenities: Array.isArray(parsedData.amenities) ? parsedData.amenities : [],
            
            // Store original AI data for reference
            aiExtractedData: {
                title: parsedData.title,
                locationArea: parsedData.locationArea,
                address: parsedData.address,
                bedrooms: parsedData.bedrooms,
                bathrooms: parsedData.bathrooms,
                monthlyRent: parsedData.monthlyRent,
                yearlyRent: parsedData.yearlyRent,
                monthlyRentEquivalent: parsedData.monthlyRentEquivalent,
                utilities: parsedData.utilities,
                deposit: parsedData.deposit,
                minimumStay: parsedData.minimumStay,
                furnished: parsedData.furnished,
                petFriendly: parsedData.petFriendly,
                smokingAllowed: parsedData.smokingAllowed,
                priceNote: parsedData.priceNote,
                amenities: parsedData.amenities
            }
        };

        // Run validation on extracted data
        const validation = validateExtracted(validatedData.aiExtractedData);
        if (!validation.isValid) {
            console.warn('⚠️ Validation issues found:', validation.issues);
            // Don't throw error, just log warnings for now
        }

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