/**
 * Get User Profile Lambda Function
 * Handles GET /users/me - Retrieve current user's profile
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Secure profile retrieval using cognitoSub
 * - Standardized error handling
 * - CORS support
 */

const AWS = require('aws-sdk');

// Initialize DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🔍 getUserProfile Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate Cognito authentication
        const { cognitoSub, email } = await validateAuthentication(event);
        
        // 2. Get user profile from DynamoDB
        const user = await getUserByCognitoSub(cognitoSub);
        
        // 3. Check if user exists
        if (!user) {
            console.log(`❌ User not found for cognitoSub: ${cognitoSub}`);
            return createResponse(404, {
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User profile not found. Please create your profile first.'
                }
            });
        }

        // 4. Return user profile
        console.log(`✅ User profile retrieved successfully for: ${user.userId}`);
        return createResponse(200, {
            success: true,
            data: {
                userId: user.userId,
                email: user.email,
                profile: user.profile,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        console.error('❌ Error in getUserProfile:', error);
        
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
                message: 'An internal error occurred while retrieving user profile'
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

    console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, Email: ${email}`);

    return {
        cognitoSub,
        email
    };
}

/**
 * Get user by cognitoSub from DynamoDB using GSI
 */
async function getUserByCognitoSub(cognitoSub) {
    console.log(`🔎 Querying user by cognitoSub: ${cognitoSub}`);

    const params = {
        TableName: USERS_TABLE,
        IndexName: 'CognitoSubIndex',
        KeyConditionExpression: 'cognitoSub = :cognitoSub',
        ExpressionAttributeValues: {
            ':cognitoSub': cognitoSub
        }
    };

    try {
        const result = await dynamodb.query(params).promise();
        
        console.log(`📊 DynamoDB query result: ${result.Items?.length || 0} items found`);
        
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
        console.error('❌ DynamoDB query error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to retrieve user profile from database');
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
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 