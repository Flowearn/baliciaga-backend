const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { getAuthenticatedUser } = require('../../utils/authUtils');

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const APPLICATIONS_TABLE_NAME = process.env.APPLICATIONS_TABLE_NAME;
const LISTINGS_TABLE_NAME = process.env.LISTINGS_TABLE_NAME;

/**
 * Lambda handler for PUT /applications/{applicationId}
 * Allows listing owners to update application status (accept/ignore)
 */
exports.handler = async (event) => {
    const { applicationId } = event.pathParameters;
    const { status } = JSON.parse(event.body);

    if (!['accepted', 'ignored', 'pending'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid status." }) };
        }

    const claims = await getAuthenticatedUser(event);
    if (!claims || !claims.sub) {
        return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
        }
    
    const cognitoSub = claims.sub;

    // Get the actual userId from our Users table
    let requestingUserId;
    try {
        const userQuery = {
            TableName: process.env.USERS_TABLE,
            IndexName: 'CognitoSubIndex',
            KeyConditionExpression: 'cognitoSub = :cognitoSub',
            ExpressionAttributeValues: {
                ':cognitoSub': cognitoSub
            }
        };

        const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
        const userResult = await docClient.send(new QueryCommand(userQuery));
        if (!userResult.Items || userResult.Items.length === 0) {
            console.log('❌ User not found in database:', cognitoSub);
            return { statusCode: 403, body: JSON.stringify({ message: "User profile not found. Please create your profile first." }) };
        }

        requestingUserId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${requestingUserId}`);
    } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        return { statusCode: 500, body: JSON.stringify({ message: "Failed to verify user profile" }) };
    }

    try {
        // Step 1: Get the application to find the listingId
        const appResult = await docClient.send(new GetCommand({ TableName: APPLICATIONS_TABLE_NAME, Key: { applicationId } }));
        if (!appResult.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: "Application not found" }) };
            }
        const application = appResult.Item;

        // Step 2: Get the listing to verify ownership
        const listingResult = await docClient.send(new GetCommand({ TableName: LISTINGS_TABLE_NAME, Key: { listingId: application.listingId } }));
            if (!listingResult.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: "Associated listing not found" }) };
            }

        // Step 3: Authorization Check - THIS IS THE CRITICAL FIX
        if (listingResult.Item.initiatorId !== requestingUserId) {
            return { statusCode: 403, body: JSON.stringify({ message: "Forbidden: You do not own this listing." }) };
        }

        // Step 4: If authorized, check for irrevocable acceptance logic
        // Prevent changing accepted applications back to pending/ignored
        if (application.status === 'accepted' && status !== 'accepted') {
            return { 
                statusCode: 400, 
                body: JSON.stringify({ 
                    message: "Cannot change status of an accepted application. Acceptance is final and irrevocable." 
                }) 
            };
        }

        // Step 5: Update the application status
            const updateParams = {
            TableName: APPLICATIONS_TABLE_NAME,
            Key: { applicationId },
            UpdateExpression: "set #status = :status, updatedAt = :updatedAt",
            ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                ":status": status,
                ":updatedAt": new Date().toISOString(),
                },
            ReturnValues: "ALL_NEW",
            };

        const updatedResult = await docClient.send(new UpdateCommand(updateParams));

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: updatedResult.Attributes }),
        };

    } catch (error) {
        console.error('Error updating application:', error);
        return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error" }) };
    }
};