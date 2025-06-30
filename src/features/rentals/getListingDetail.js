/**
 * Get Listing Detail Lambda Function
 * Handles GET /listings/{listingId} - Retrieve complete listing details
 * 
 * Features:
 * - Public endpoint (no authentication required)
 * - Optional authentication support for sensitive data
 * - Multi-table data aggregation
 * - Conditional propertyContact field based on user role
 * - Fetch listing, initiator profile, and accepted roommates
 * - Complete listing detail response
 * - CORS support
 */

const dynamodb = require('../../utils/dynamoDbClient');
const { buildCompleteResponse } = require('../../utils/responseUtils');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

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
        
        // 3. Optional authentication - check if user is authenticated
        let userId = null;
        let cognitoSub = null;
        try {
            // This will return null if no valid auth token is present
            const authUser = await getAuthenticatedUser(event);
            if (authUser && authUser.sub) {
                cognitoSub = authUser.sub;
                console.log(`🔐 Authenticated user detected - Cognito Sub: ${cognitoSub}`);
                
                // Get the actual userId from our Users table
                const userQuery = {
                    TableName: process.env.USERS_TABLE,
                    IndexName: 'CognitoSubIndex',
                    KeyConditionExpression: 'cognitoSub = :cognitoSub',
                    ExpressionAttributeValues: {
                        ':cognitoSub': cognitoSub
                    }
                };

                const userResult = await dynamodb.query(userQuery).promise();
                if (userResult.Items && userResult.Items.length > 0) {
                    userId = userResult.Items[0].userId;
                    console.log(`✅ Mapped Cognito Sub to internal userId: ${cognitoSub} -> ${userId}`);
                } else {
                    console.log(`⚠️ User not found in database for Cognito Sub: ${cognitoSub}`);
                    // Continue as anonymous if user profile not found
                    userId = null;
                }
            } else {
                console.log('👤 Anonymous user access');
            }
        } catch (authError) {
            // If auth fails, treat as anonymous user
            console.log('👤 Auth verification failed, treating as anonymous user:', authError.message);
            userId = null;
        }
        
        // 4. Build complete listing detail response using shared data transformation
        const completeListingDetail = await buildCompleteResponse(listing);
        
        // 5. Apply conditional data filtering based on user permissions
        const filteredResponse = await applyConditionalDataFiltering(
            completeListingDetail, 
            listing, 
            userId
        );
        
        // 6. Return success response
        return createResponse(200, {
            success: true,
            data: filteredResponse
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
 * Apply conditional data filtering based on user permissions
 * @param {Object} listingDetail - The complete listing detail object
 * @param {Object} rawListing - The raw listing from database
 * @param {string|null} userId - The authenticated user ID (if any)
 * @returns {Object} The filtered listing detail
 */
async function applyConditionalDataFiltering(listingDetail, rawListing, userId) {
    // Create a deep copy to avoid modifying the original
    const filteredListing = JSON.parse(JSON.stringify(listingDetail));
    
    // By default, remove sensitive fields
    delete filteredListing.propertyContact;
    
    // If no authenticated user, return the filtered listing
    if (!userId) {
        console.log('🔒 propertyContact hidden for anonymous user');
        return filteredListing;
    }
    
    // Check if user is the initiator
    if (rawListing.initiatorId === userId) {
        console.log('✅ User is the initiator - showing propertyContact');
        filteredListing.propertyContact = rawListing.propertyContact || null;
        return filteredListing;
    }
    
    // Check if user is an accepted applicant
    const isAcceptedApplicant = await checkIfAcceptedApplicant(rawListing.listingId, userId);
    if (isAcceptedApplicant) {
        console.log('✅ User is an accepted applicant - showing propertyContact');
        filteredListing.propertyContact = rawListing.propertyContact || null;
        return filteredListing;
    }
    
    console.log('🔒 propertyContact hidden - user is neither initiator nor accepted applicant');
    return filteredListing;
}

/**
 * Check if a user has an accepted application for a listing
 * @param {string} listingId - The listing ID
 * @param {string} userId - The user ID to check
 * @returns {boolean} True if user has an accepted application
 */
async function checkIfAcceptedApplicant(listingId, userId) {
    console.log(`🔍 Checking if user ${userId} has accepted application for listing ${listingId}`);
    
    const params = {
        TableName: APPLICATIONS_TABLE,
        IndexName: 'listingId-index',
        KeyConditionExpression: 'listingId = :listingId',
        FilterExpression: 'applicantId = :applicantId AND #status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':listingId': listingId,
            ':applicantId': userId,
            ':status': 'accepted'
        }
    };
    
    try {
        const result = await dynamodb.query(params).promise();
        const hasAcceptedApplication = result.Items && result.Items.length > 0;
        
        if (hasAcceptedApplication) {
            console.log(`✅ User ${userId} has an accepted application`);
        } else {
            console.log(`❌ User ${userId} does not have an accepted application`);
        }
        
        return hasAcceptedApplication;
    } catch (error) {
        console.error('❌ Error checking application status:', error);
        // In case of error, default to not showing sensitive data
        return false;
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