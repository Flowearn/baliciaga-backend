/**
 * Create Application Lambda Function
 * Handles POST /listings/{listingId}/applications - Submit application for a listing
 * 
 * Features:
 * - Authenticated endpoint (Cognito authorization required)
 * - Pre-condition validation (listing exists, is open, not self-application, no duplicate)
 * - Secure application creation with proper data validation
 * - CORS support
 */

const { v4: uuidv4 } = require('uuid');
const dynamodb = require('../../utils/dynamoDbClient');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('📝 createApplication Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const { applicantId } = await validateAuthentication(event);
        
        // 2. Parse and validate request parameters
        const { listingId, applicationMessage, applicantLeaseDuration } = parseRequestParameters(event);
        
        // 3. Perform critical pre-condition checks
        await performPreConditionChecks(listingId, applicantId);
        
        // 4. Create new application
        const newApplication = await createNewApplication(listingId, applicantId, applicationMessage, applicantLeaseDuration);

        // 5. Return success response
        console.log(`✅ Application created successfully: ${newApplication.applicationId}`);
        return createResponse(201, {
            success: true,
            data: newApplication
        });

    } catch (error) {
        console.error('❌ Error in createApplication:', error);
        
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
                message: 'An internal error occurred while creating application'
            }
        });
    }
};

/**
 * Validate Cognito authentication and extract user information
 */
async function validateAuthentication(event) {
    // Extract Cognito claims from API Gateway authorizer
    const claims = event.requestContext?.authorizer?.claims;
    
    if (!claims || !claims.sub) {
        console.log('❌ Missing or invalid Cognito claims');
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const cognitoSub = claims.sub;
    const email = claims.email;

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

        const applicantId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, ApplicantId: ${applicantId}, Email: ${email}`);

    return { applicantId };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        console.error('❌ Error fetching user profile:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to verify user profile');
    }
}

/**
 * Parse and validate request parameters
 */
function parseRequestParameters(event) {
    // Extract listingId from path parameters
    const pathParams = event.pathParameters || {};
    const listingId = pathParams.listingId;

    if (!listingId || typeof listingId !== 'string' || listingId.trim().length === 0) {
        throw createError(400, 'INVALID_LISTING_ID', 'listingId is required and must be a valid string');
    }

    // Extract optional applicationMessage and applicantLeaseDuration from request body
    let applicationMessage = null;
    let applicantLeaseDuration = null;
    if (event.body) {
        try {
            const body = JSON.parse(event.body);
            applicationMessage = body.applicationMessage;
            applicantLeaseDuration = body.applicantLeaseDuration;
            
            // Validate applicationMessage if provided
            if (applicationMessage !== null && applicationMessage !== undefined) {
                if (typeof applicationMessage !== 'string') {
                    throw createError(400, 'INVALID_MESSAGE', 'applicationMessage must be a string');
                }
                
                // Trim and check length
                applicationMessage = applicationMessage.trim();
                if (applicationMessage.length > 1000) {
                    throw createError(400, 'MESSAGE_TOO_LONG', 'applicationMessage cannot exceed 1000 characters');
                }
                
                // Set to null if empty after trimming
                if (applicationMessage.length === 0) {
                    applicationMessage = null;
                }
            }
            
            // Validate applicantLeaseDuration if provided
            if (applicantLeaseDuration !== null && applicantLeaseDuration !== undefined) {
                if (typeof applicantLeaseDuration !== 'string') {
                    throw createError(400, 'INVALID_LEASE_DURATION', 'applicantLeaseDuration must be a string');
                }
                
                // Trim and set to null if empty
                applicantLeaseDuration = applicantLeaseDuration.trim();
                if (applicantLeaseDuration.length === 0) {
                    applicantLeaseDuration = null;
                }
            }
        } catch (parseError) {
            if (parseError.statusCode) {
                throw parseError; // Re-throw our custom errors
            }
            throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
        }
    }

    console.log(`📋 Request params - ListingId: ${listingId}, Message: ${applicationMessage ? 'provided' : 'none'}, LeaseDuration: ${applicantLeaseDuration ? 'provided' : 'none'}`);
    
    return {
        listingId: listingId.trim(),
        applicationMessage,
        applicantLeaseDuration
    };
}

/**
 * Perform pre-condition checks before creating application
 */
async function performPreConditionChecks(listingId, applicantId) {
    console.log(`🔍 Performing pre-condition checks for listing: ${listingId}, applicant: ${applicantId}`);

    // 1. Check if listing exists and is open
    const listing = await getListingById(listingId);
    
    if (!listing) {
        throw createError(404, 'LISTING_NOT_FOUND', 'The requested listing does not exist');
    }
    
    if (listing.status !== 'open') {
        throw createError(400, 'LISTING_NOT_OPEN', 'Cannot apply to a closed listing');
    }

    // 2. Prevent self-application
    if (listing.initiatorId === applicantId) {
        throw createError(400, 'SELF_APPLICATION_FORBIDDEN', 'Cannot apply to your own listing');
    }

    // 3. Check for duplicate application
    const existingApplication = await getExistingApplication(listingId, applicantId);
    
    if (existingApplication) {
        throw createError(409, 'DUPLICATE_APPLICATION', 'You have already applied to this listing');
    }

    console.log(`✅ All pre-condition checks passed`);
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
        return result.Item || null;
    } catch (error) {
        console.error('❌ Error getting listing:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to retrieve listing information');
    }
}

/**
 * Check if user has already applied to this listing
 */
async function getExistingApplication(listingId, applicantId) {
    console.log(`🔍 Checking for existing application: ${listingId} by ${applicantId}`);

    // Use UserApplicationsIndex to efficiently query user's applications
    // Then filter by listingId (since we need both listingId and applicantId match)
    const params = {
        TableName: APPLICATIONS_TABLE,
        IndexName: 'UserApplicationsIndex',
        KeyConditionExpression: 'applicantId = :applicantId',
        FilterExpression: 'listingId = :listingId',
        ExpressionAttributeValues: {
            ':applicantId': applicantId,
            ':listingId': listingId
        }
    };

    try {
        const result = await dynamodb.query(params).promise();
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
        console.error('❌ Error checking existing application:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to check for existing application');
    }
}

/**
 * Create new application and save to DynamoDB
 */
async function createNewApplication(listingId, applicantId, applicationMessage, applicantLeaseDuration) {
    console.log(`📝 Creating new application for listing: ${listingId}`);

    const now = new Date().toISOString();
    const applicationId = uuidv4();

    const newApplication = {
        applicationId,
        listingId,
        applicantId,
        status: 'pending',
        applicationMessage,
        applicantLeaseDuration,
        createdAt: now,
        updatedAt: now
    };

    const params = {
        TableName: APPLICATIONS_TABLE,
        Item: newApplication,
        // Add condition to ensure applicationId doesn't already exist (though highly unlikely with UUID)
        ConditionExpression: 'attribute_not_exists(applicationId)'
    };

    try {
        await dynamodb.put(params).promise();
        console.log(`✅ Application saved to database: ${applicationId}`);
        return newApplication;
    } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
            console.error('❌ Application ID collision detected');
            throw createError(500, 'ID_COLLISION', 'Application ID collision, please try again');
        }
        console.error('❌ Error saving application:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to save application to database');
    }
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
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 