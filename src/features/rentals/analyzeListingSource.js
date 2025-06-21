/**
 * Listing Source Analysis Lambda Function
 * Handles POST /listings/analyze-source - Extract structured information from raw text or images
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Gemini AI integration for text and image analysis
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
 * Parse multipart/form-data from Lambda event
 */
function parseMultipartData(body, contentType) {
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
        throw new Error('No boundary found in content-type');
    }

    const parts = body.split(`--${boundary}`);
    const parsedData = {};
    
    for (const part of parts) {
        if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            if (nameMatch) {
                const fieldName = nameMatch[1];
                
                // Find where the content starts (after double newline)
                const contentStart = part.indexOf('\r\n\r\n') + 4;
                if (contentStart > 3) {
                    const content = part.substring(contentStart);
                    
                    // Remove trailing boundary markers
                    const cleanContent = content.replace(/\r\n--.*$/, '');
                    
                    if (part.includes('Content-Type: image/')) {
                        // This is a file upload
                        parsedData[fieldName] = {
                            type: 'image',
                            content: cleanContent,
                            mimeType: part.match(/Content-Type: ([^\r\n]+)/)[1]
                        };
                    } else {
                        // This is a text field
                        parsedData[fieldName] = cleanContent;
                    }
                }
            }
        }
    }
    
    return parsedData;
}

/**
 * Normalize price text by removing currency symbols and thousand separators
 */
function normalizePriceText(raw) {
    // NOTE: Do NOT remove currency symbols - they are needed for AI currency detection!
    return raw
        .replace(/(?<=\d)[,.](?=\d{3}\b)/g, '') // 去千位分隔符，但保留货币符号
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🤖 analyzeListingSource Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Parse and validate request
        const requestData = await parseAndValidateRequest(event);
        
        // 2. Get Gemini API key from SSM
        const geminiApiKey = await getGeminiApiKey();
        
        // 3. Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

        let result;
        
        if (requestData.type === 'image') {
            // 4a. Process image with Gemini Vision
            console.log('🖼️ Processing image with Gemini Vision');
            
            const imagePart = {
                inlineData: {
                    data: Buffer.from(requestData.imageContent, 'binary').toString('base64'),
                    mimeType: requestData.mimeType
                }
            };
            
            const prompt = constructImageAnalysisPrompt();
            result = await model.generateContent([prompt, imagePart]);
            
        } else {
            // 4b. Process text with Gemini
            console.log('📝 Processing text with Gemini');
            const prompt = constructAnalysisPrompt(requestData.sourceText);
            result = await model.generateContent(prompt);
        }
        
        // 5. Parse AI response
        const response = await result.response;
        const aiResponseText = response.text();
        const extractedData = await parseAIResponse(aiResponseText);
        
        // 6. Clean up internal AI fields before returning
        if (extractedData.reasoning) {
            delete extractedData.reasoning;
        }
        
        // 7. Return structured response
        return createResponse(200, {
            success: true,
            data: {
                extractedListing: extractedData,
                sourceText: requestData.type === 'text' ? 
                    requestData.sourceText.substring(0, 200) + (requestData.sourceText.length > 200 ? '...' : '') :
                    'Image processed',
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

    // Check content type to determine how to parse the request
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
        // Handle FormData (image upload)
        console.log('📋 Parsing multipart/form-data request');
        
        if (!event.body) {
            throw createError(400, 'EMPTY_BODY', 'Request body is required for multipart data');
        }
        
        let parsedData;
        try {
            // Decode base64 body if it's encoded
            const bodyData = event.isBase64Encoded ? 
                Buffer.from(event.body, 'base64').toString('binary') : 
                event.body;
                
            parsedData = parseMultipartData(bodyData, contentType);
        } catch (error) {
            console.error('Error parsing multipart data:', error);
            throw createError(400, 'INVALID_MULTIPART', 'Failed to parse multipart data');
        }
        
        // Check if we have an image
        if (parsedData.sourceImage && parsedData.sourceImage.type === 'image') {
            return {
                type: 'image',
                imageContent: parsedData.sourceImage.content,
                mimeType: parsedData.sourceImage.mimeType
            };
        } else {
            throw createError(400, 'MISSING_IMAGE', 'sourceImage file is required for multipart requests');
        }
        
    } else {
        // Handle JSON (text input)
        console.log('📋 Parsing JSON request');
        
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

        return { 
            type: 'text',
            sourceText 
        };
    }
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
 * Construct analysis prompt for image processing
 */
function constructImageAnalysisPrompt() {
    return `
You are a hyper-precise data extraction engine for real estate in Bali, Indonesia. Your ONLY task is to populate a JSON object based *only* on the provided source material (text or image).

<instructions>
  <rule id="1" importance="MAXIMUM">
    **CURRENCY DETECTION:** This is your most important task. First, analyze the price to determine the currency. If you see a '$' symbol OR the word 'USD', the 'currency' field in the JSON output MUST be 'USD'. In ALL other cases, assume the currency is 'IDR'.
  </rule>
  <rule id="2">
    **STRICT EXTRACTION:** Extract ONLY what is written. Do not invent, assume, or infer data. If information is missing, its value MUST be null.
  </rule>
  <rule id="3">
    **NO DEFAULTING:** The 'minimumStay' field MUST be null if not mentioned. DO NOT default to '12 months'.
  </rule>
  <rule id="4">
    **REASONING:** You MUST include a 'reasoning' field in your JSON output, containing a brief, one-sentence explanation of your thought process, especially for the currency decision.
  </rule>
</instructions>

<json_structure>
{
  "title": "string",
  "bedrooms": "number | null",
  "bathrooms": "number | null",
  "landSize": "number | null",
  "buildingSize": "number | null",
  "address": "string | null",
  "currency": "'USD' | 'IDR'",
  "pricing": {
    "monthly": "number | null",
    "yearly": "number | null"
  },
  "minimumStay_months": "number | null",
  "price_yearly_idr": "number | null", 
  "price_yearly_usd": "number | null",
  "amenityTags": ["string"],
  "reasoning": "string" // This field is mandatory
}
</json_structure>

<examples>
  <example id="1_idr">
    <source>Villa for rent 250jt/yr in Seminyak.</source>
    <output>
    {
      "title": "Villa for rent in Seminyak", "bedrooms": null, "bathrooms": null, "landSize": null, "buildingSize": null, "address": "Seminyak", "currency": "IDR", "pricing": { "monthly": 20833333, "yearly": 250000000 }, "minimumStay": null, "amenityTags": [], "reasoning": "Currency is IDR because no '$' or 'USD' was found in the price."
    }
    </output>
  </example>
  <example id="2_usd">
    <source>Apartment available for $1.5k/month in Canggu.</source>
    <output>
    {
      "title": "Apartment in Canggu", "bedrooms": null, "bathrooms": null, "landSize": null, "buildingSize": null, "address": "Canggu", "currency": "USD", "pricing": { "monthly": 1500, "yearly": null }, "minimumStay": null, "amenityTags": [], "reasoning": "Currency is USD because the '$' symbol was found in the price."
    }
    </output>
  </example>
</examples>

Please analyze the image and return only the JSON object with the extracted information.
`;
}

/**
 * Construct detailed analysis prompt for Gemini
 */
function constructAnalysisPrompt(sourceText) {
    // Normalize price text before analysis
    const normalizedText = normalizePriceText(sourceText);
    
    const promptV6_optimized = `
You are a hyper-precise data extraction engine for real estate in Bali, Indonesia. Your ONLY task is to populate a JSON object based *only* on the provided source material.

<critical_instructions>
  <rule id="1" importance="ABSOLUTE_HIGHEST">
    **MINIMUM STAY EXTRACTION:** Look for patterns like: "minimum X months", "min X year", "Minimum Y months lease", "Lease: Minimum Z months", "min Take X Year". Extract the EXACT number and unit. Convert to months (1 year = 12 months, 3 years = 36 months). If not found, use null.
  </rule>
  <rule id="2" importance="ABSOLUTE_HIGHEST">
    **AREA SIZE EXTRACTION:** Look for land/building sizes in various formats: "3 Are" (1 Are = 100 sqm), "500sqm", "500 sqm", "500 m2", "Landsize 3 Are", "land size X sqm". Convert everything to square meters. If not found, use null.
  </rule>
  <rule id="3" importance="ABSOLUTE_HIGHEST">
    **PRICE EXTRACTION (NO CALCULATION):** Identify monthly or yearly prices and their currency. Put the raw number directly into the corresponding field ('pricing.monthly', 'pricing.yearly', 'price_yearly_idr', 'price_yearly_usd'). DO NOT perform any calculations like dividing yearly rent by 12. Just extract the original number you see.
  </rule>
  <rule id="4" importance="ABSOLUTE_HIGHEST">
    **PRECISE ADDRESS EXTRACTION:** Do NOT default to "Bali". Extract the specific area mentioned: "Canggu", "Seminyak", "Ubud", "Pererenan", "Berawa", "Kerobokan", "Padang Linjong", "Seseh", etc. Only use "Bali" if NO specific area is mentioned.
  </rule>
  <rule id="5" importance="HIGH">
    **CURRENCY DETECTION:** If the price is mentioned with a '$' symbol OR the word 'USD', the 'currency' field MUST be 'USD'. In ALL other cases, assume the currency is 'IDR'.
  </rule>
  <rule id="6">
    **NO HALLUCINATIONS:** If information is NOT explicitly written in the source material, the value MUST be null. Do NOT guess or default values.
  </rule>
  <rule id="7" name="Area/Size Extraction Guide">
    **HOW TO FIND AREA:** You must actively look for land or building size. The units can be 'sqm', 'm2', or 'Are'. **You must know that 1 Are = 100 sqm**. For example, if the source says "Landsize 3 Are", you must extract the value for the 'landSize' field as \`300\`.
  </rule>
  <rule id="8" name="Minimum Stay Extraction Guide">
    **HOW TO FIND MINIMUM STAY:** You must actively look for minimum stay information. It can be written in many ways, such as "min Take 3 Year", "minimum 12 months", "1 year minimum lease", or "yearly only". You MUST convert the final value into a single number representing months. For example, "min Take 3 Year" becomes \`36\`, and "yearly only" becomes \`12\`.
  </rule>
</critical_instructions>

<json_structure>
{
  "title": "string",
  "bedrooms": "number | null",
  "bathrooms": "number | null",
  "landSize": "number | null",
  "buildingSize": "number | null",
  "address": "string | null",
  "currency": "'USD' | 'IDR'",
  "pricing": {
    "monthly": "number | null",
    "yearly": "number | null"
  },
  "minimumStay_months": "number | null",
  "price_yearly_idr": "number | null", 
  "price_yearly_usd": "number | null",
  "amenityTags": ["string"],
  "reasoning": "string" // This field is mandatory
}
</json_structure>

<examples>
  <example id="1_idr">
    <source>Villa for rent 250jt/yr in Seminyak.</source>
    <output>
    {
      "title": "Villa for rent in Seminyak", "bedrooms": null, "bathrooms": null, "landSize": null, "buildingSize": null, "address": "Seminyak", "currency": "IDR", "pricing": { "monthly": 20833333, "yearly": 250000000 }, "minimumStay": null, "amenityTags": [], "reasoning": "Currency is IDR because no '$' or 'USD' was found in the price."
    }
    </output>
  </example>
  <example id="2_usd">
    <source>Apartment available for $1.5k/month in Canggu.</source>
    <output>
    {
      "title": "Apartment in Canggu", "bedrooms": null, "bathrooms": null, "landSize": null, "buildingSize": null, "address": "Canggu", "currency": "USD", "pricing": { "monthly": 1500, "yearly": null }, "minimumStay": null, "amenityTags": [], "reasoning": "Currency is USD because the '$' symbol was found in the price."
    }
    </output>
  </example>
</examples>

Now, analyze the following source material and provide the JSON output:
${normalizedText}
    `;
    
    return promptV6_optimized;
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
        
        // Debug: Log the parsed AI response
        console.log('🤖 AI Response parsed:', JSON.stringify(parsedData, null, 2));
        
        // Post-processing: Fix data types
        // Convert string prices to numbers
        const priceFields = ['monthlyRent', 'yearlyRent', 'monthlyRentEquivalent', 'utilities', 'deposit', 'price_yearly_idr', 'price_yearly_usd'];
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
        
        // Remove automatic calculation - let frontend handle price calculations
        // AI should only extract raw prices without performing calculations
        
        // Map new AI schema fields to expected format
        // AI returns: amenityTags, pricing.monthly, currency, etc.
        // Backend expects: amenities, monthlyRent, etc.
        if (parsedData.amenityTags && !parsedData.amenities) {
            parsedData.amenities = parsedData.amenityTags;
        }
        if (parsedData.pricing?.monthly && !parsedData.monthlyRent) {
            parsedData.monthlyRent = parsedData.pricing.monthly;
        }
        if (parsedData.pricing?.yearly && !parsedData.yearlyRent) {
            parsedData.yearlyRent = parsedData.pricing.yearly;
        }
        
        // Handle new yearly price fields
        if (parsedData.price_yearly_idr && !parsedData.yearlyRent && parsedData.currency === 'IDR') {
            parsedData.yearlyRent = parsedData.price_yearly_idr;
        }
        if (parsedData.price_yearly_usd && !parsedData.yearlyRent && parsedData.currency === 'USD') {
            parsedData.yearlyRent = parsedData.price_yearly_usd;
        }
        
        // Handle new minimum stay field (convert from minimumStay_months)
        if (parsedData.minimumStay_months && typeof parsedData.minimumStay_months === 'number') {
            parsedData.minimumStay = parsedData.minimumStay_months;
        }
        
        // Handle currency conversion - store the detected currency
        parsedData.detectedCurrency = parsedData.currency || 'IDR';
        
        // Relaxed validation - only require basic structure
        // AI might return null for fields it cannot extract from vague input
        
        // If AI explicitly returns null/empty data, that's acceptable
        // Only fail if the JSON structure is completely invalid or missing critical info
        
        // Provide sensible defaults for missing data
        if (!parsedData.title) {
            parsedData.title = "Property Listing";
        }
        if (!parsedData.bedrooms && parsedData.bedrooms !== 0) {
            parsedData.bedrooms = 1; // Default
        }
        if (!parsedData.bathrooms && parsedData.bathrooms !== 0) {
            parsedData.bathrooms = 1; // Default
        }
        // Don't set default price - let it be null if not found

        // Validate and transform data to match the expected format
        const validatedData = {
            title: String(parsedData.title || 'Rental Property'),
            monthlyRent: Number(parsedData.monthlyRent) || null, // Allow null prices
            currency: parsedData.detectedCurrency || 'IDR', // Use detected currency
            deposit: parsedData.deposit ? Number(parsedData.deposit) : (parsedData.monthlyRent ? Number(parsedData.monthlyRent) : null),
            utilities: parsedData.utilities ? Number(parsedData.utilities) : 0,
            bedrooms: Number(parsedData.bedrooms) || 1,
            bathrooms: Number(parsedData.bathrooms) || 1,
            squareFootage: parsedData.landSize || parsedData.buildingSize || null, // Use extracted sizes
            furnished: parsedData.furnished === true,
            petFriendly: parsedData.petFriendly === true,
            smokingAllowed: parsedData.smokingAllowed === true,
            address: String(parsedData.address || 'Address not specified'),
            locationArea: String(parsedData.locationArea || 'Bali'),
            availableFrom: new Date().toISOString().split('T')[0], // Default to today
            minimumStay: parsedData.minimumStay ? Number(parsedData.minimumStay) : null,
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
                price_yearly_idr: parsedData.price_yearly_idr,
                price_yearly_usd: parsedData.price_yearly_usd,
                monthlyRentEquivalent: parsedData.monthlyRentEquivalent,
                utilities: parsedData.utilities,
                deposit: parsedData.deposit,
                minimumStay: parsedData.minimumStay,
                minimumStay_months: parsedData.minimumStay_months,
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