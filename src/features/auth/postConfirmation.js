const { v4: uuidv4 } = require('uuid');
const dynamodb = require('../../utils/dynamoDbClient');

const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Cognito Post-Confirmation Lambda Trigger.
 * This function is triggered by AWS Cognito after a user successfully confirms their sign-up.
 * Its primary role is to create a corresponding user record in our internal DynamoDB users table.
 * This record links the Cognito user (via cognitoSub) to our internal userId.
 */
exports.handler = async (event) => {
    console.log('PostConfirmation trigger invoked with event:', JSON.stringify(event, null, 2));

    // Only process if the trigger is from a confirmed sign-up
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
        console.log(`Trigger source is ${event.triggerSource}, not PostConfirmation_ConfirmSignUp. Skipping.`);
        return event;
    }

    const { sub, email } = event.request.userAttributes;
    const now = new Date().toISOString();

    // First, check if this email is already in use by another user
    const emailCheckParams = {
        TableName: USERS_TABLE,
        FilterExpression: 'email = :email AND cognitoSub <> :cognitoSub',
        ExpressionAttributeValues: {
            ':email': email,
            ':cognitoSub': sub
        }
    };

    try {
        console.log(`Checking for existing users with email: ${email}`);
        const emailCheckResult = await dynamodb.scan(emailCheckParams).promise();
        
        if (emailCheckResult.Items && emailCheckResult.Items.length > 0) {
            console.error(`❌ Email ${email} is already in use by another user. Cannot create duplicate.`);
            console.error('Existing users:', emailCheckResult.Items.map(user => ({
                userId: user.userId,
                cognitoSub: user.cognitoSub,
                email: user.email
            })));
            
            // Throw error to prevent user creation
            throw new Error(`Email ${email} is already registered. Please use a different email or sign in to your existing account.`);
        }

        // Check if this cognitoSub already has a user record
        const cognitoCheckParams = {
            TableName: USERS_TABLE,
            IndexName: 'CognitoSubIndex',
            KeyConditionExpression: 'cognitoSub = :cognitoSub',
            ExpressionAttributeValues: {
                ':cognitoSub': sub
            }
        };
        
        const cognitoCheckResult = await dynamodb.query(cognitoCheckParams).promise();
        
        if (cognitoCheckResult.Items && cognitoCheckResult.Items.length > 0) {
            console.log(`User with cognitoSub ${sub} already exists. Skipping creation.`);
            return event;
        }

        // Email is unique and cognitoSub is new, create the user
        const newUser = {
            userId: uuidv4(), // Our internal, primary user identifier
            cognitoSub: sub,  // The user's unique ID from Cognito
            email: email,
            profile: {}, // Initialize with an empty profile object for future updates
            createdAt: now,
            updatedAt: now,
        };

        const params = {
            TableName: USERS_TABLE,
            Item: newUser,
            ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(cognitoSub)'
        };

        console.log(`Attempting to create user record in ${USERS_TABLE} for cognitoSub: ${sub}`);
        await dynamodb.put(params).promise();
        console.log('✅ Successfully created user record:', JSON.stringify(newUser, null, 2));
        
    } catch (error) {
        console.error('❌ Error in postConfirmation:', error);
        // If email uniqueness check fails, we should prevent user creation
        if (error.message && error.message.includes('already registered')) {
            throw error; // Re-throw to block the registration
        }
        // For other errors (like DynamoDB issues), log but don't block
        console.error('Non-blocking error:', error.message);
    }

    // Return the original event object to Cognito
    return event;
}; 