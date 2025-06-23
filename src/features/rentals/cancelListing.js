/**
 * Cancel Listing Lambda Function
 * Handles PATCH /listings/{listingId}/cancel - Cancel rental listing mid-way
 * 
 * Features:
 * - Authenticated endpoint (Cognito authorization required)
 * - Owner-only access control (only initiator can cancel)
 * - Atomic listing status update to 'cancelled'
 * - Only cancels listings in 'open' status
 * - Comprehensive error handling
 * - CORS support
 */

const dynamodb = require('../../utils/dynamoDbClient');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🚫 cancelListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const claims = await getAuthenticatedUser(event);
        if (!claims || !claims.sub) {
            throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
        }
        const cognitoSub = claims.sub;

        // Get the actual userId from our Users table (copied from getUserListings.js)
        let userId;
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

            userId = userResult.Items[0].userId;
            console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${userId}`);
        } catch (error) {
            if (error.statusCode) throw error; // Re-throw our custom errors
            console.error('❌ Error fetching user profile:', error);
            throw createError(500, 'DATABASE_ERROR', 'Failed to verify user profile');
        }
        
        // 2. Parse and validate request parameters
        const { listingId } = parsePathParameters(event);
        
        // 3. Update listing status with ownership verification using correct userId
        await updateListingStatusToCancelled(listingId, userId);

        // 4. Return success response
        console.log(`✅ Listing cancelled successfully: ${listingId}`);
        return createResponse(200, {
            success: true,
            data: {
                listingId,
                status: 'cancelled',
                message: 'Listing successfully cancelled'
            }
        });

    } catch (error) {
        console.error('❌ Error in cancelListing:', error);
        
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
                message: 'An internal error occurred while cancelling the listing'
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

    console.log(`🎯 Cancelling listing: ${listingId}`);
    return { listingId: listingId.trim() };
}

/**
 * Update listing status to 'cancelled' with ownership verification
 */
async function updateListingStatusToCancelled(listingId, userId) {
    console.log(`📝 Updating listing status to 'cancelled': ${listingId}`);

    // First, let's get the listing to see the actual initiatorId for diagnosis
    const getListing = {
        TableName: LISTINGS_TABLE,
        Key: { listingId }
    };

    try {
        const getResult = await dynamodb.get(getListing).promise();
        const listing = getResult.Item;

        if (!listing) {
            throw createError(404, 'LISTING_NOT_FOUND', 'Listing not found');
        }

        // Add diagnosis logs
        console.log('--- PERMISSION CHECK DIAGNOSIS ---');
        console.log('ID of currently logged-in user (userId):', userId);
        console.log('ID of listing initiator from DB:', listing.initiatorId);
        console.log('Data type of logged-in user ID:', typeof userId);
        console.log('Data type of initiator ID from DB:', typeof listing.initiatorId);
        console.log('Are they equal? (Strict Comparison):', userId === listing.initiatorId);
        console.log('Current listing status:', listing.status);
        console.log('--- END DIAGNOSIS ---');

    } catch (error) {
        console.error('❌ Error getting listing for diagnosis:', error);
        // Continue with original update attempt even if diagnosis fails
    }

    // This goes right before the `const params = ...` line for the UpdateItemCommand
    console.log('--- FINAL PERMISSION CHECK DIAGNOSIS ---');
    console.log('Attempting to cancel listingId:', listingId);
    console.log('ID being used for permission check (:userId):', userId);
    console.log('--- END DIAGNOSIS ---');

    // Add these three lines right before the `params` object is defined
    console.log('--- ID_DIAGNOSIS_TRACE ---');
    console.log('Listing ID being operated on:', listingId);
    console.log('User ID being used for permission check:', userId); 
    // We need to see what `userId` variable holds at this exact moment
    console.log('--- END_DIAGNOSIS_TRACE ---');

    const params = {
        TableName: LISTINGS_TABLE,
        Key: { listingId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'cancelled',
            ':updatedAt': new Date().toISOString(),
            ':userId': userId,
            ':openStatus': 'open'
        },
        ConditionExpression: 'initiatorId = :userId AND #status = :openStatus',
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await dynamodb.update(params).promise();
        console.log('✅ Listing status updated to cancelled successfully:', result.Attributes);
        return result.Attributes;

    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
            console.log('❌ Conditional check failed - either not owner or listing not open');
            throw createError(403, 'FORBIDDEN', 'You can only cancel your own open listings');
        }
        console.error('❌ DynamoDB update error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to cancel listing');
    }
}

/**
 * Create HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'OPTIONS,PATCH'
        },
        body: JSON.stringify(body)
    };
}

/**
 * Create error object with consistent structure
 */
function createError(statusCode, code, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    if (details) {
        error.details = details;
    }
    return error;
} 