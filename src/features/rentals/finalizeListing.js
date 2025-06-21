/**
 * Finalize Listing Lambda Function
 * Handles PATCH /listings/{listingId}/finalize - Finalize deal for rental listing
 * 
 * Features:
 * - Authenticated endpoint (Cognito authorization required)
 * - Owner-only access control (only initiator can finalize)
 * - Atomic listing status update to 'finalized'
 * - Batch update accepted applications to 'signed' status
 * - Comprehensive error handling and rollback
 * - CORS support
 */

const dynamodb = require('../../utils/dynamoDbClient');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏁 finalizeListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const claims = getAuthenticatedUser(event);
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
        await updateListingStatus(listingId, userId);
        
        // 4. Batch update accepted applications to 'signed'
        const updatedApplicationsCount = await updateAcceptedApplications(listingId);

        // 5. Return success response
        console.log(`✅ Listing finalized successfully: ${listingId}, ${updatedApplicationsCount} applications updated`);
        return createResponse(200, {
            success: true,
            data: {
                listingId,
                status: 'finalized',
                updatedApplicationsCount,
                message: 'Listing successfully finalized and all accepted applications marked as signed'
            }
        });

    } catch (error) {
        console.error('❌ Error in finalizeListing:', error);
        
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
                message: 'An internal error occurred while finalizing the listing'
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

    console.log(`🎯 Finalizing listing: ${listingId}`);
    return { listingId: listingId.trim() };
}

/**
 * Update listing status to 'finalized' with ownership verification
 */
async function updateListingStatus(listingId, userId) {
    console.log(`📝 Updating listing status to 'finalized': ${listingId}`);

    const params = {
        TableName: LISTINGS_TABLE,
        Key: { listingId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'finalized',
            ':updatedAt': new Date().toISOString(),
            ':userId': userId,
            ':currentStatus': 'open'
        },
        ConditionExpression: 'initiatorId = :userId AND #status = :currentStatus',
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await dynamodb.update(params).promise();
        console.log('✅ Listing status updated successfully:', result.Attributes);
        return result.Attributes;

    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
            console.log('❌ Conditional check failed - either not owner or listing not open');
            throw createError(403, 'FORBIDDEN', 'You can only finalize your own open listings');
        }
        console.error('❌ DynamoDB update error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to update listing status');
    }
}

/**
 * Batch update all accepted applications to 'signed' status
 */
async function updateAcceptedApplications(listingId) {
    console.log(`🔄 Updating accepted applications for listing: ${listingId}`);

    // 1. First, query all accepted applications for this listing
    const acceptedApplications = await getAcceptedApplications(listingId);
    
    if (acceptedApplications.length === 0) {
        console.log('ℹ️ No accepted applications found for this listing');
        return 0;
    }

    console.log(`📋 Found ${acceptedApplications.length} accepted applications to update`);

    // 2. Batch update all accepted applications to 'signed'
    const updatePromises = acceptedApplications.map(application => 
        updateApplicationStatus(application.applicationId)
    );

    try {
        await Promise.all(updatePromises);
        console.log(`✅ Successfully updated ${acceptedApplications.length} applications to 'signed'`);
        return acceptedApplications.length;

    } catch (error) {
        console.error('❌ Error updating applications:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to update application statuses');
    }
}

/**
 * Get all accepted applications for a listing
 */
async function getAcceptedApplications(listingId) {
    console.log(`🔍 Querying accepted applications for listing: ${listingId}`);

    const params = {
        TableName: APPLICATIONS_TABLE,
        IndexName: 'ListingIndex',
        KeyConditionExpression: 'listingId = :listingId',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':listingId': listingId,
            ':status': 'accepted'
        }
    };

    try {
        const result = await dynamodb.query(params).promise();
        console.log(`✅ Found ${result.Items.length} accepted applications`);
        return result.Items;

    } catch (error) {
        console.error('❌ Error querying applications:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to query accepted applications');
    }
}

/**
 * Update individual application status to 'signed'
 */
async function updateApplicationStatus(applicationId) {
    console.log(`📝 Updating application status to 'signed': ${applicationId}`);

    const params = {
        TableName: APPLICATIONS_TABLE,
        Key: { applicationId },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':status': 'signed',
            ':updatedAt': new Date().toISOString(),
            ':currentStatus': 'accepted'
        },
        ConditionExpression: '#status = :currentStatus',
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await dynamodb.update(params).promise();
        console.log(`✅ Application ${applicationId} updated to 'signed'`);
        return result.Attributes;

    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
            console.log(`⚠️ Application ${applicationId} is no longer in 'accepted' status, skipping`);
            return null; // Skip this application
        }
        console.error(`❌ Error updating application ${applicationId}:`, error);
        throw error; // Re-throw other errors
    }
}

/**
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'PATCH,OPTIONS',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}

/**
 * Create standardized error object
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