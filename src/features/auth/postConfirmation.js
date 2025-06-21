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

    try {
        console.log(`Attempting to create user record in ${USERS_TABLE} for cognitoSub: ${sub}`);
        await dynamodb.put(params).promise();
        console.log('✅ Successfully created user record:', JSON.stringify(newUser, null, 2));
    } catch (error) {
        // This might happen if the trigger fires more than once, the condition expression will protect our data.
        console.error('❌ Error creating user record. User might already exist.', error);
        // Even if it fails, we don't want to block the user's login, so we return the event without error.
    }

    // Return the original event object to Cognito
    return event;
}; 