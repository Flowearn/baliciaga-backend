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

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🚫 cancelListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const { userId } = await validateAuthentication(event);
        
        // 2. Parse and validate request parameters
        const { listingId } = parsePathParameters(event);
        
        // 3. Update listing status with ownership verification
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
 * Validate Cognito authentication and extract user information
 */
async function validateAuthentication(event) {
    const claims = event.requestContext?.authorizer?.claims;
    
    if (!claims || !claims.sub) {
        console.log('❌ Missing or invalid Cognito claims');
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const cognitoSub = claims.sub;
    console.log(`🔐 Authenticated user: ${cognitoSub}`);

    // Get userId from Users table
    const userId = await getUserIdFromCognitoSub(cognitoSub);
    
    return { userId };
}

/**
 * Get userId from cognitoSub using Users table
 */
async function getUserIdFromCognitoSub(cognitoSub) {
    console.log(`🔍 Looking up userId for cognitoSub: ${cognitoSub}`);

    const params = {
        TableName: process.env.USERS_TABLE,
        IndexName: 'CognitoSubIndex',
        KeyConditionExpression: 'cognitoSub = :cognitoSub',
        ExpressionAttributeValues: {
            ':cognitoSub': cognitoSub
        }
    };

    try {
        const result = await dynamodb.query(params).promise();
        
        if (!result.Items || result.Items.length === 0) {
            throw createError(404, 'USER_NOT_FOUND', 'User profile not found');
        }

        const userId = result.Items[0].userId;
        console.log(`✅ Found userId: ${userId}`);
        return userId;

    } catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw our custom errors
        }
        console.error('❌ DynamoDB query error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to lookup user information');
    }
}

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