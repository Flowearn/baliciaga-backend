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
        
        // 3. Validate platform role permission
        if (listingData.posterRole === 'platform' && !cognitoGroups.includes('InternalStaff')) {
            console.log('❌ User attempted to create platform listing without InternalStaff permission');
            throw createError(403, 'FORBIDDEN', 'You do not have permission to create platform listings');
        }
        
        // 4. Prepare listing object
        const now = new Date().toISOString();
        const listing = {
            listingId: uuidv4(),
            initiatorId: userId,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            ...listingData
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
    
    const userClaims = getAuthenticatedUser(event);
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

    const errors = [];

    // Required fields validation
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        errors.push('title is required and must be a non-empty string');
    }

    if (!body.address || typeof body.address !== 'string' || body.address.trim().length === 0) {
        errors.push('address is required and must be a non-empty string');
    }

    if (body.monthlyRent === undefined || !Number.isInteger(body.monthlyRent) || body.monthlyRent <= 0) {
        errors.push('monthlyRent must be a positive integer');
    }

    // Yearly rent validation (optional)
    if (body.yearlyRent !== undefined && (!Number.isInteger(body.yearlyRent) || body.yearlyRent < 0)) {
        errors.push('yearlyRent must be a non-negative integer if provided');
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

    // Numeric field validation
    if (body.deposit !== undefined && (!Number.isInteger(body.deposit) || body.deposit < 0)) {
        errors.push('deposit must be a non-negative integer if provided');
    }

    if (body.utilities !== undefined && (!Number.isInteger(body.utilities) || body.utilities < 0)) {
        errors.push('utilities must be a non-negative integer if provided');
    }

    if (body.bedrooms !== undefined && (!Number.isInteger(body.bedrooms) || body.bedrooms < 0)) {
        errors.push('bedrooms must be a non-negative integer if provided');
    }

    if (body.bathrooms !== undefined && (!Number.isInteger(body.bathrooms) || body.bathrooms < 0)) {
        errors.push('bathrooms must be a non-negative integer if provided');
    }

    if (body.squareFootage !== undefined && body.squareFootage !== null && (!Number.isInteger(body.squareFootage) || body.squareFootage <= 0)) {
        errors.push('squareFootage must be a positive integer if provided');
    }

    if (body.minimumStay !== undefined && (!Number.isInteger(body.minimumStay) || body.minimumStay <= 0)) {
        errors.push('minimumStay must be a positive integer if provided');
    }

    // Boolean field validation
    if (body.furnished !== undefined && typeof body.furnished !== 'boolean') {
        errors.push('furnished must be a boolean if provided');
    }

    if (body.petFriendly !== undefined && typeof body.petFriendly !== 'boolean') {
        errors.push('petFriendly must be a boolean if provided');
    }

    if (body.smokingAllowed !== undefined && typeof body.smokingAllowed !== 'boolean') {
        errors.push('smokingAllowed must be a boolean if provided');
    }

    // Optional fields validation - description field removed

    if (body.amenities !== undefined && (!Array.isArray(body.amenities) || !body.amenities.every(item => typeof item === 'string'))) {
        errors.push('amenities must be an array of strings if provided');
    }

    if (body.photos !== undefined && (!Array.isArray(body.photos) || !body.photos.every(item => typeof item === 'string'))) {
        errors.push('photos must be an array of strings if provided');
    }

    if (body.availableFrom !== undefined && typeof body.availableFrom !== 'string') {
        errors.push('availableFrom must be a string if provided');
    }

    if (body.locationArea !== undefined && body.locationArea !== null && typeof body.locationArea !== 'string') {
        errors.push('locationArea must be a string if provided');
    }

    // If any validation errors, throw
    if (errors.length > 0) {
        throw createError(400, 'VALIDATION_ERROR', 'Listing validation failed', errors);
    }

    // Return normalized data structure
    return {
        title: body.title.trim(),
        address: body.address.trim(),
        locationArea: body.locationArea || null, // New field for AI-extracted area
        posterRole: body.posterRole, // New field for poster role
        monthlyRent: body.monthlyRent,
        yearlyRent: body.yearlyRent || 0,
        currency: body.currency,
        deposit: body.deposit || 0,
        utilities: body.utilities || 0,
        bedrooms: body.bedrooms || 0,
        bathrooms: body.bathrooms || 0,
        squareFootage: body.squareFootage || null,
        minimumStay: body.minimumStay || 1,
        furnished: body.furnished || false,
        petFriendly: body.petFriendly || false,
        smokingAllowed: body.smokingAllowed || false,
        amenities: body.amenities || [],
        photos: body.photos || [],
        availableFrom: body.availableFrom || ''
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