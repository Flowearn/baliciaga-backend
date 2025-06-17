const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { getAuthenticatedUser } = require('../../utils/authUtils');

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const LISTINGS_TABLE_NAME = process.env.LISTINGS_TABLE_NAME;
const APPLICATIONS_TABLE_NAME = process.env.APPLICATIONS_TABLE_NAME;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME;

/**
 * Lambda handler for GET /listings/{listingId}/applications
 * Allows listing owners to view applications for their listings
 */
exports.handler = async (event) => {
    const { listingId } = event.pathParameters;

    const claims = getAuthenticatedUser(event);
        if (!claims || !claims.sub) {
        return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
        }
    const requestingUserId = claims.sub;

    try {
        // Step 1: Get the listing to verify ownership
        const listingResult = await docClient.send(new GetCommand({ TableName: LISTINGS_TABLE_NAME, Key: { listingId } }));
        if (!listingResult.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: "Listing not found" }) };
        }
        const listing = listingResult.Item;

        // Step 2: Authorization Check
        if (listing.initiatorId !== requestingUserId) {
            return { statusCode: 403, body: JSON.stringify({ message: "Forbidden: You do not own this listing." }) };
        }

        // Step 3: Get applications for this listing
        const appsResult = await docClient.send(new QueryCommand({
            TableName: APPLICATIONS_TABLE_NAME,
            IndexName: 'ListingApplicationsIndex',
            KeyConditionExpression: 'listingId = :listingId',
            ExpressionAttributeValues: { ':listingId': listingId },
        }));
        const applications = appsResult.Items || [];

        if (applications.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ success: true, data: { applications: [] } }) };
        }

        // --- CRITICAL FIX: Step 4 - Fetch all applicant profiles correctly ---
        const fullApplications = await Promise.all(applications.map(async (app) => {
            // Query the UsersTable using the GSI 'CognitoSubIndex'
                const userQuery = {
                TableName: USERS_TABLE_NAME,
                    IndexName: 'CognitoSubIndex',
                    KeyConditionExpression: 'cognitoSub = :cognitoSub',
                ExpressionAttributeValues: { ':cognitoSub': app.applicantId },
            };
            const userResult = await docClient.send(new QueryCommand(userQuery));
            const applicantData = (userResult.Items && userResult.Items.length > 0) ? userResult.Items[0] : null;

            return { ...app, applicant: applicantData };
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: { applications: fullApplications } }),
        };

    } catch (error) {
        console.error('Error in getApplications:', error);
        return { statusCode: 500, body: JSON.stringify({ message: "Internal Server Error" }) };
    }
};