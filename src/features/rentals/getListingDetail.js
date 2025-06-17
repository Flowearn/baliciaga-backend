/**
 * Get Listing Detail Lambda Function
 * Handles GET /listings/{listingId} - Retrieve complete listing details
 * 
 * Features:
 * - Public endpoint (no authentication required)
 * - Multi-table data aggregation
 * - Fetch listing, initiator profile, and accepted roommates
 * - Complete listing detail response
 * - CORS support
 */

const dynamodb = require('../../utils/dynamoDbClient');
const { buildCompleteResponse } = require('../../utils/responseUtils');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏠 getListingDetail Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate listingId from path parameters
        const { listingId } = parsePathParameters(event);
        
        // 2. Get main listing data
        const listing = await getListingById(listingId);
        
        // 3. Skip additional data aggregation - using simplified response
        // The shared buildCompleteResponse function only needs the listing data

        // 4. Build complete listing detail response using shared data transformation
        const completeListingDetail = await buildCompleteResponse(listing);

        // 5. Return success response
        console.log(`✅ Listing detail retrieved successfully: ${listingId}`);
        return createResponse(200, {
            success: true,
            data: completeListingDetail
        });

    } catch (error) {
        console.error('❌ Error in getListingDetail:', error);
        
        // Handle different error types
        if (error.statusCode) {
            return createResponse(error.statusCode, {
                success: false,
                error: {
                    code: error.code,
                    message: error.message
                }
            });
        }

        // Unknown error
        return createResponse(500, {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred while retrieving listing details'
            }
        });
    }
};

/**
 * Parse and validate path parameters
 */
function parsePathParameters(event) {
    const pathParams = event.pathParameters || {};
    const listingId = pathParams.listingId;

    if (!listingId || typeof listingId !== 'string' || listingId.trim().length === 0) {
        throw createError(400, 'INVALID_LISTING_ID', 'listingId is required and must be a valid string');
    }

    console.log(`🔍 Retrieving details for listing: ${listingId}`);
    return { listingId: listingId.trim() };
}

/**
 * Get listing by ID from DynamoDB
 */
async function getListingById(listingId) {
    console.log(`🔎 Querying listing: ${listingId}`);

    const params = {
        TableName: LISTINGS_TABLE,
        Key: { listingId }
    };

    try {
        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            console.log(`❌ Listing not found: ${listingId}`);
            throw createError(404, 'LISTING_NOT_FOUND', 'The requested listing was not found');
        }

        console.log(`✅ Listing found: ${listingId}`);
        return result.Item;

    } catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw our custom errors
        }
        console.error('❌ DynamoDB get error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to retrieve listing from database');
    }
}

// Removed unused functions: getUserProfile, getAcceptedRoommates, old buildCompleteResponse
// These functions are no longer needed as we're using the shared responseUtils functions

/**
 * Create standardized error object
 */
function createError(statusCode, code, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
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
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 