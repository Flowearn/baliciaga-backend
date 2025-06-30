/**
 * Create Listing Lambda Function
 * Handles POST /listings - Create new rental listing
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Support for simplified data structure from frontend
 * - Photo URLs validation
 * - DynamoDB listing storage
 * - Standardized error handling
 * - CORS support
 */

const { v4: uuidv4 } = require('uuid');
const dynamodb = require('../../utils/dynamoDbClient');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏠 createListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const { userId, cognitoGroups } = await validateAuthentication(event);
        
        // 2. Parse and validate request body
        const listingData = await parseAndValidateRequest(event);
        console.log('[CREATE_DIAGNOSIS_1] Data returned from parser/validator:', listingData);
        
        // 🔍 CCt#4 LOG POINT 1: Data received and parsed from event body
        console.log('1. [createListing] Data received and parsed from event body:', JSON.stringify(listingData, null, 2));
        
        // 3. Validate platform role permission
        if (listingData.posterRole === 'platform' && !cognitoGroups.includes('InternalStaff')) {
            console.log('❌ User attempted to create platform listing without InternalStaff permission');
            throw createError(403, 'FORBIDDEN', 'You do not have permission to create platform listings');
        }
        
        // 4. Prepare listing object
        const now = new Date().toISOString();
        console.log('[CCt#8 Diagnosis] About to create listing with initiatorId:', userId);
        const listing = {
            listingId: uuidv4(),
            initiatorId: userId,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            
            // Core fields
            title: listingData.title,
            description: listingData.description,
            propertyContact: listingData.propertyContact, // Explicitly include propertyContact
            posterRole: listingData.posterRole,
            
            // Nested location object
            location: {
                address: listingData.location.address,
                locationArea: listingData.location.locationArea,
                coordinates: {
                    latitude: 0,
                    longitude: 0
                }
            },
            
            // Pricing information
            pricing: {
                monthlyRent: listingData.monthlyRent,
                yearlyRent: listingData.yearlyRent,
                currency: listingData.currency,
                deposit: listingData.deposit,
                utilities: listingData.utilities
            },
            
            // Property details
            details: {
                bedrooms: listingData.bedrooms,
                bathrooms: listingData.bathrooms,
                squareFootage: listingData.squareFootage,
                furnished: listingData.furnished,
                petFriendly: listingData.petFriendly,
                smokingAllowed: listingData.smokingAllowed
            },
            
            // Availability information
            availability: {
                availableFrom: listingData.availableFrom,
                minimumStay: listingData.minimumStay,
                leaseDuration: listingData.leaseDuration
            },
            
            // Additional fields
            amenities: listingData.amenities,
            photos: listingData.photos,
            
            // Auto-calculated fields
            acceptedApplicantsCount: 0,
            totalSpots: listingData.bedrooms || 1
        };

        // 5. Save to DynamoDB
        await saveListing(listing);

        // 5. Return success response
        console.log(`✅ Listing created successfully: ${listing.listingId}`);
        return createResponse(201, {
            success: true,
            data: {
                listingId: listing.listingId,
                message: 'Listing created successfully'
            }
        });

    } catch (error) {
        console.error('❌ Error in createListing:', error);
        
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
                message: 'An internal error occurred while creating the listing'
            }
        });
    }
};

/**
 * Validate authentication and extract user information
 * Supports both Cognito (production) and test headers (development)
 */
async function validateAuthentication(event) {
    const { getAuthenticatedUser } = require('../../utils/authUtils');
    
    const userClaims = await getAuthenticatedUser(event);
    if (!userClaims || !userClaims.sub) {
        console.log('❌ Missing or invalid authentication');
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const cognitoSub = userClaims.sub;
    const cognitoGroups = userClaims['cognito:groups'] || [];

    // Get the actual userId from our Users table
    try {
        const userQuery = {
            TableName: process.env.USERS_TABLE,
            IndexName: 'CognitoSubIndex',
            KeyConditionExpression: 'cognitoSub = :cognitoSub',
            ExpressionAttributeValues: {
                ':cognitoSub': cognitoSub
            }
        };

        const userResult = await dynamodb.query(userQuery).promise();
        if (!userResult.Items || userResult.Items.length === 0) {
            console.log('❌ User not found in database:', cognitoSub);
            throw createError(403, 'USER_NOT_FOUND', 'User profile not found. Please create your profile first.');
        }

        const userId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${userId}, Groups: ${JSON.stringify(cognitoGroups)}`);
        console.log('[CCt#8 Diagnosis] Successfully mapped Cognito Sub to internal userId:', {
            cognitoSub: cognitoSub,
            internalUserId: userId,
            userRecord: userResult.Items[0]
        });

        return { userId, cognitoGroups };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        console.error('❌ Error fetching user profile:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to verify user profile');
    }
}

/**
 * Parse and validate the incoming request for simplified data structure
 */
async function parseAndValidateRequest(event) {
    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    console.log('Request body:', JSON.stringify(body, null, 2));
    console.log('[DEBUG] Request body propertyContact field:', {
        propertyContact: body.propertyContact,
        type: typeof body.propertyContact,
        exists: 'propertyContact' in body
    });

    const errors = [];

    // Required fields validation
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        errors.push('title is required and must be a non-empty string');
    }

    if (!body.address || typeof body.address !== 'string' || body.address.trim().length === 0) {
        errors.push('address is required and must be a non-empty string');
    }

    if (!body.propertyContact || typeof body.propertyContact !== 'string' || body.propertyContact.trim().length === 0) {
        console.log('PropertyContact validation failed:', { 
            propertyContact: body.propertyContact, 
            type: typeof body.propertyContact,
            trimmedLength: body.propertyContact ? body.propertyContact.toString().trim().length : 0
        });
        errors.push('propertyContact is required and must be a non-empty string');
    }

    // Convert string numbers to numbers for monthlyRent
    if (typeof body.monthlyRent === 'string' && !isNaN(body.monthlyRent) && body.monthlyRent.trim() !== '') {
        body.monthlyRent = parseFloat(body.monthlyRent);
    }
    if (body.monthlyRent === undefined || typeof body.monthlyRent !== 'number' || body.monthlyRent < 0) {
        errors.push('monthlyRent must be a non-negative number');
    }

    // Yearly rent validation (optional) - handle string to number conversion
    if (typeof body.yearlyRent === 'string' && !isNaN(body.yearlyRent) && body.yearlyRent.trim() !== '') {
        body.yearlyRent = parseFloat(body.yearlyRent);
    }
    if (body.yearlyRent !== undefined && body.yearlyRent !== null && (typeof body.yearlyRent !== 'number' || body.yearlyRent < 0)) {
        errors.push('yearlyRent must be a non-negative number if provided');
    }

    if (!body.currency || typeof body.currency !== 'string') {
        errors.push('currency is required and must be a string');
    }

    // Poster role validation (required)
    if (!body.posterRole || typeof body.posterRole !== 'string') {
        errors.push('posterRole is required and must be a string');
    } else if (body.posterRole !== 'tenant' && body.posterRole !== 'landlord' && body.posterRole !== 'platform') {
        errors.push('posterRole must be either "tenant", "landlord", or "platform"');
    }

    // Numeric field validation with string-to-number conversion and null handling
    
    // Helper function to convert string numbers
    const convertStringToNumber = (field, fieldName) => {
        if (typeof body[field] === 'string' && !isNaN(body[field]) && body[field].trim() !== '') {
            body[field] = parseFloat(body[field]);
        }
    };
    
    convertStringToNumber('deposit', 'deposit');
    convertStringToNumber('utilities', 'utilities');
    convertStringToNumber('bedrooms', 'bedrooms');
    convertStringToNumber('bathrooms', 'bathrooms');
    convertStringToNumber('squareFootage', 'squareFootage');
    convertStringToNumber('minimumStay', 'minimumStay');

    if (body.deposit !== undefined && body.deposit !== null && (typeof body.deposit !== 'number' || body.deposit < 0)) {
        errors.push('deposit must be a non-negative number if provided');
    }

    if (body.utilities !== undefined && body.utilities !== null && (typeof body.utilities !== 'number' || body.utilities < 0)) {
        errors.push('utilities must be a non-negative number if provided');
    }

    if (body.bedrooms !== undefined && body.bedrooms !== null && (typeof body.bedrooms !== 'number' || body.bedrooms < 0)) {
        errors.push('bedrooms must be a non-negative number if provided');
    }

    if (body.bathrooms !== undefined && body.bathrooms !== null && (typeof body.bathrooms !== 'number' || body.bathrooms < 0)) {
        errors.push('bathrooms must be a non-negative number if provided');
    }

    if (body.squareFootage !== undefined && body.squareFootage !== null && (typeof body.squareFootage !== 'number' || body.squareFootage <= 0)) {
        errors.push('squareFootage must be a positive number if provided');
    }

    if (body.minimumStay !== undefined && body.minimumStay !== null && (typeof body.minimumStay !== 'number' || body.minimumStay <= 0)) {
        errors.push('minimumStay must be a positive number if provided');
    }

    // Boolean field validation (allow null values)
    if (body.furnished !== undefined && body.furnished !== null && typeof body.furnished !== 'boolean') {
        errors.push('furnished must be a boolean if provided');
    }

    if (body.petFriendly !== undefined && body.petFriendly !== null && typeof body.petFriendly !== 'boolean') {
        errors.push('petFriendly must be a boolean if provided');
    }

    if (body.smokingAllowed !== undefined && body.smokingAllowed !== null && typeof body.smokingAllowed !== 'boolean') {
        errors.push('smokingAllowed must be a boolean if provided');
    }

    // Optional fields validation - description field removed

    if (body.amenities !== undefined && body.amenities !== null && (!Array.isArray(body.amenities) || !body.amenities.every(item => typeof item === 'string'))) {
        errors.push('amenities must be an array of strings if provided');
    }

    if (body.photos !== undefined && body.photos !== null && (!Array.isArray(body.photos) || !body.photos.every(item => typeof item === 'string'))) {
        errors.push('photos must be an array of strings if provided');
    }

    if (body.availableFrom !== undefined && body.availableFrom !== null && typeof body.availableFrom !== 'string') {
        errors.push('availableFrom must be a string if provided');
    }

    if (body.locationArea !== undefined && body.locationArea !== null && typeof body.locationArea !== 'string') {
        errors.push('locationArea must be a string if provided');
    }

    if (body.leaseDuration !== undefined && body.leaseDuration !== null && typeof body.leaseDuration !== 'string') {
        errors.push('leaseDuration must be a string if provided');
    }

    // If any validation errors, throw
    if (errors.length > 0) {
        throw createError(400, 'VALIDATION_ERROR', 'Invalid request body', errors);
    }

    // Return structured listing data object for further processing
    // Note: description and some others are now optional.
    return {
        title: body.title.trim(),
        description: body.description ? body.description.trim() : "",
        propertyContact: body.propertyContact, // Ensure propertyContact is returned
        posterRole: body.posterRole,
        location: {
            address: body.address.trim(),
            locationArea: body.locationArea || null, // New field for AI-extracted area
        },
        monthlyRent: Math.round(body.monthlyRent), // Convert to integer
        yearlyRent: body.yearlyRent !== null && body.yearlyRent !== undefined ? Math.round(body.yearlyRent) : 0, // Handle null
        currency: body.currency,
        deposit: body.deposit !== null && body.deposit !== undefined ? Math.round(body.deposit) : 0, // Handle null
        utilities: body.utilities !== null && body.utilities !== undefined ? Math.round(body.utilities) : 0, // Handle null
        bedrooms: body.bedrooms !== null && body.bedrooms !== undefined ? Math.round(body.bedrooms) : 0, // Handle null
        bathrooms: body.bathrooms !== null && body.bathrooms !== undefined ? Math.round(body.bathrooms) : 0, // Handle null
        squareFootage: body.squareFootage !== null && body.squareFootage !== undefined ? Math.round(body.squareFootage) : null, // Handle null
        minimumStay: body.minimumStay !== null && body.minimumStay !== undefined ? Math.round(body.minimumStay) : 1, // Handle null
        furnished: body.furnished !== null && body.furnished !== undefined ? body.furnished : false, // Handle null
        petFriendly: body.petFriendly !== null && body.petFriendly !== undefined ? body.petFriendly : false, // Handle null
        smokingAllowed: body.smokingAllowed !== null && body.smokingAllowed !== undefined ? body.smokingAllowed : false, // Handle null
        amenities: body.amenities !== null && body.amenities !== undefined ? body.amenities : [], // Handle null
        photos: body.photos !== null && body.photos !== undefined ? body.photos : [], // Handle null
        availableFrom: body.availableFrom !== null && body.availableFrom !== undefined ? body.availableFrom : '', // Handle null
        leaseDuration: body.leaseDuration || null // Handle optional leaseDuration field
    };
}

/**
 * Save listing to DynamoDB
 */
async function saveListing(listing) {
    console.log('💾 Saving listing to DynamoDB:', listing.listingId);
    
    const params = {
        TableName: LISTINGS_TABLE,
        Item: listing
    };
    console.log('[CREATE_DIAGNOSIS_2] Final Item object being sent to DynamoDB:', params.Item);
    
    // 🔍 CCt#4 LOG POINT 2: Final Item object just before DynamoDB put operation
    console.log('2. [createListing] Final Item object just before DynamoDB put operation:', JSON.stringify(params.Item, null, 2));

    try {
        await dynamodb.put(params).promise();
        console.log('✅ Listing saved successfully');
    } catch (error) {
        console.error('❌ Error saving listing:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to save listing to database');
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
 * Create standardized API response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
} 