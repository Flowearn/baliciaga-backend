/**
 * User Profile Lambda Function
 * Handles POST /users/profile - Create or update user profile
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Smart upsert (create new or update existing user)
 * - Input validation according to PRD requirements
 * - Standardized error handling
 * - CORS support
 */

const { v4: uuidv4 } = require('uuid');
const dynamodb = require('../../utils/dynamoDbClient');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🚀 createUserProfile Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Parse and validate request
        const { cognitoSub, email, profileData } = await parseAndValidateRequest(event);
        
        // 2. Check if user exists (by cognitoSub or email)
        const existingUser = await getUserByCognitoSubOrEmail(cognitoSub, email);
        console.log('🔍 User lookup result:', existingUser ? 'EXISTING USER FOUND' : 'NEW USER');
        
        // 3. Check for email uniqueness (only for new users)
        if (!existingUser) {
            console.log('🚨 NEW USER DETECTED - Running email uniqueness check...');
            await checkEmailUniqueness(email, cognitoSub);
        } else {
            console.log('📝 EXISTING USER - Skipping email uniqueness check');
        }
        
        // 3. Prepare user data
        const now = new Date().toISOString();
        const userData = {
            profile: profileData,
            updatedAt: now,
            ...(existingUser ? {} : {
                userId: uuidv4(),
                cognitoSub,
                email,
                createdAt: now
            })
        };

        // 4. Save to DynamoDB (upsert operation)
        const savedUser = existingUser 
            ? await updateUser(existingUser.userId, userData)
            : await createUser(userData);

        // 5. Return success response
        return createResponse(200, {
            success: true,
            data: {
                userId: savedUser.userId,
                profile: savedUser.profile,
                createdAt: savedUser.createdAt,
                updatedAt: savedUser.updatedAt
            }
        });

    } catch (error) {
        console.error('❌ Error in createUserProfile:', error);
        
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
                message: 'An internal error occurred'
            }
        });
    }
};

/**
 * Parse and validate the incoming request
 */
async function parseAndValidateRequest(event) {
    const claims = await getAuthenticatedUser(event);
    
    if (!claims || !claims.sub) {
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const cognitoSub = claims.sub;
    const email = claims.email;

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    // Validate profile data exists
    if (!body.profile || typeof body.profile !== 'object') {
        throw createError(400, 'MISSING_PROFILE', 'Profile data is required');
    }

    // Validate profile fields
    const validatedProfile = await validateProfile(body.profile);

    return {
        cognitoSub,
        email,
        profileData: validatedProfile
    };
}

/**
 * Validate profile data according to PRD requirements
 */
async function validateProfile(profile) {
    const errors = [];

    // Required fields
    if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
        errors.push('Name is required and must be a non-empty string');
    }

    // WhatsApp is now optional
    if (profile.whatsApp !== undefined && profile.whatsApp !== null) {
        if (typeof profile.whatsApp !== 'string') {
            errors.push('WhatsApp must be a string');
        }
    }

    // Optional but validated fields
    if (profile.gender && !['male', 'female', 'other'].includes(profile.gender)) {
        errors.push('Gender must be one of: male, female, other');
    }

    if (profile.age !== undefined) {
        const age = parseInt(profile.age);
        if (isNaN(age) || age < 18 || age > 100) {
            errors.push('Age must be a number between 18 and 100');
        }
        profile.age = age; // Ensure it's stored as number
    }

    if (profile.languages !== undefined) {
        if (!Array.isArray(profile.languages)) {
            errors.push('Languages must be an array');
        } else if (profile.languages.some(lang => typeof lang !== 'string' || lang.trim().length === 0)) {
            errors.push('All languages must be non-empty strings');
        }
    }

    if (profile.socialMedia && typeof profile.socialMedia !== 'string') {
        errors.push('Social media must be a string');
    }

    if (profile.occupation && typeof profile.occupation !== 'string') {
        errors.push('Occupation must be a string');
    }

    if (profile.profilePictureUrl && typeof profile.profilePictureUrl !== 'string') {
        errors.push('Profile picture URL must be a string');
    }

    // If any validation errors, throw
    if (errors.length > 0) {
        throw createError(400, 'VALIDATION_ERROR', 'Profile validation failed', errors);
    }

    // Return cleaned profile
    return {
        name: profile.name.trim(),
        ...(profile.whatsApp && { whatsApp: profile.whatsApp.trim() }),
        ...(profile.gender && { gender: profile.gender }),
        ...(profile.age && { age: profile.age }),
        ...(profile.languages && { languages: profile.languages.map(lang => lang.trim()) }),
        ...(profile.socialMedia && { socialMedia: profile.socialMedia.trim() }),
        ...(profile.occupation && { occupation: profile.occupation.trim() }),
        ...(profile.profilePictureUrl && { profilePictureUrl: profile.profilePictureUrl.trim() })
    };
}

/**
 * Check if email is already in use by another user
 */
async function checkEmailUniqueness(email, currentCognitoSub) {
    console.log(`🔍 Checking email uniqueness for: ${email}`);
    
    const params = {
        TableName: USERS_TABLE,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: {
            ':email': email
        }
    };

    try {
        const result = await dynamodb.scan(params).promise();
        const existingUsers = result.Items || [];
        
        // Filter out the current user (in case of update)
        const otherUsers = existingUsers.filter(user => user.cognitoSub !== currentCognitoSub);
        
        if (otherUsers.length > 0) {
            console.log(`❌ Email ${email} is already in use by ${otherUsers.length} other user(s)`);
            otherUsers.forEach((user, index) => {
                console.log(`   ${index + 1}. User ID: ${user.userId}, CognitoSub: ${user.cognitoSub}`);
            });
            throw createError(409, 'EMAIL_ALREADY_EXISTS', 
                `Email address ${email} is already in use. Please use a different email or sign in to your existing account.`);
        }
        
        console.log(`✅ Email ${email} is available`);
    } catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw our custom errors
        }
        console.error('❌ Error checking email uniqueness:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to verify email uniqueness');
    }
}

/**
 * Get user by cognitoSub or email from DynamoDB
 */
async function getUserByCognitoSubOrEmail(cognitoSub, email) {
    // First try to find by cognitoSub
    const paramsBySub = {
        TableName: USERS_TABLE,
        IndexName: 'CognitoSubIndex',
        KeyConditionExpression: 'cognitoSub = :cognitoSub',
        ExpressionAttributeValues: {
            ':cognitoSub': cognitoSub
        }
    };

    const resultBySub = await dynamodb.query(paramsBySub).promise();
    if (resultBySub.Items && resultBySub.Items.length > 0) {
        return resultBySub.Items[0];
    }

    // If not found by cognitoSub, try to find by email
    // This handles cases where users were created with different cognitoSub (e.g., before passwordless migration)
    if (email) {
        console.log(`🔄 User not found by cognitoSub ${cognitoSub}, trying email ${email}`);
        const paramsByEmail = {
            TableName: USERS_TABLE,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        };

        const resultByEmail = await dynamodb.scan(paramsByEmail).promise();
        if (resultByEmail.Items && resultByEmail.Items.length > 0) {
            console.log(`✅ Found user by email, updating cognitoSub from ${resultByEmail.Items[0].cognitoSub} to ${cognitoSub}`);
            // Update the user's cognitoSub to the new one
            const user = resultByEmail.Items[0];
            await dynamodb.update({
                TableName: USERS_TABLE,
                Key: { userId: user.userId },
                UpdateExpression: 'SET cognitoSub = :newSub, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':newSub': cognitoSub,
                    ':updatedAt': new Date().toISOString()
                }
            }).promise();
            
            return { ...user, cognitoSub };
        }
    }

    return null;
}

/**
 * Create new user in DynamoDB
 */
async function createUser(userData) {
    const params = {
        TableName: USERS_TABLE,
        Item: userData,
        ConditionExpression: 'attribute_not_exists(userId)'
    };

    await dynamodb.put(params).promise();
    return userData;
}

/**
 * Update existing user in DynamoDB
 */
async function updateUser(userId, updateData) {
    // Prepare update expression
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Profile update
    if (updateData.profile) {
        updateExpression.push('#profile = :profile');
        expressionAttributeNames['#profile'] = 'profile';
        expressionAttributeValues[':profile'] = updateData.profile;
    }

    // Updated timestamp
    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = updateData.updatedAt;

    const params = {
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    };

    const result = await dynamodb.update(params).promise();
    return result.Attributes;
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