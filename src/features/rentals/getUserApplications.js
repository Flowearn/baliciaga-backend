const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");
const _ = require('lodash');
const { buildCompleteResponse } = require('../../utils/responseUtils');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);

const USERS_TABLE_NAME = process.env.USERS_TABLE;
const APPLICATIONS_TABLE_NAME = process.env.APPLICATIONS_TABLE;
const LISTINGS_TABLE_NAME = process.env.LISTINGS_TABLE;

// buildCompleteResponse function is now imported from shared utils

exports.handler = async (event) => {
    const claims = await getAuthenticatedUser(event);

    if (!claims || !claims.sub) {
        return {
            statusCode: 401,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ message: "Unauthorized" }),
        };
    }

    const cognitoSub = claims.sub;

    // Get the actual userId from our Users table
    let applicantId;
    try {
        const userQuery = {
            TableName: process.env.USERS_TABLE,
            IndexName: 'CognitoSubIndex',
            KeyConditionExpression: 'cognitoSub = :cognitoSub',
            ExpressionAttributeValues: {
                ':cognitoSub': cognitoSub
            }
        };

        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
        const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
        const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        
        const userResult = await dynamodb.send(new QueryCommand(userQuery));
        if (!userResult.Items || userResult.Items.length === 0) {
            console.log('❌ User not found in database:', cognitoSub);
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User profile not found. Please create your profile first.'
                    }
                })
            };
        }

        applicantId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, ApplicantId: ${applicantId}`);
    } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Failed to verify user profile'
                }
            })
        };
    }

    try {
        // --- STAGE 1: Get all applications for the user ---
        const queryParams = {
            TableName: APPLICATIONS_TABLE_NAME,
            IndexName: 'UserApplicationsIndex',
            KeyConditionExpression: 'applicantId = :applicantId',
            ExpressionAttributeValues: {
                ':applicantId': applicantId,
            },
        };

        const applicationResults = await docClient.send(new QueryCommand(queryParams));
        const applications = applicationResults.Items || [];

        if (applications.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    userId: applicantId,
                    applications: [],
                    pagination: { total: 0, hasMore: false },
                    filters: { status: null }
                })
            };
        }

        // --- STAGE 2: Batch get all associated listings ---
        const listingIds = _.uniq(applications.map(app => app.listingId));
        console.log(`Fetching complete listing data for ${listingIds.length} listings:`, listingIds);
        
        const batchGetParams = {
            RequestItems: {
                [LISTINGS_TABLE_NAME]: {
                    Keys: listingIds.map(id => ({ listingId: id })),
                },
            },
        };

        const listingResults = await docClient.send(new BatchGetCommand(batchGetParams));
        const listings = listingResults.Responses[LISTINGS_TABLE_NAME] || [];
        console.log(`Successfully fetched ${listings.length} complete listings`);
        
        const listingsMap = _.keyBy(listings, 'listingId');

        // --- STAGE 3: Combine application data with full listing data and filter out cancelled/finalized listings ---
        const fullApplications = await Promise.all(applications.map(async (app) => {
            const fullListing = listingsMap[app.listingId];
            
            // Skip applications for cancelled or finalized listings
            if (fullListing && (fullListing.status === 'cancelled' || fullListing.status === 'finalized')) {
                console.log(`Filtering out application ${app.applicationId} for ${fullListing.status} listing ${app.listingId}`);
                return null;
            }
            
            return {
                ...app,
                // IMPORTANT: Attach the fully transformed listing object
                listing: fullListing ? await buildCompleteResponse(fullListing) : null
            };
        }));
        
        // Remove filtered out (null) applications
        const validApplications = fullApplications.filter(app => app !== null);
        console.log(`Filtered from ${applications.length} to ${validApplications.length} applications (removed ${applications.length - validApplications.length} applications for cancelled/finalized listings)`);

        // --- STAGE 4: For accepted applications, get roommate information ---
        const finalApplications = await Promise.all(validApplications.map(async (app) => {
            // Only fetch roommates for accepted applications
            if (app.status !== 'accepted') {
                return app;
            }

            try {
                // Query all accepted applications for this listing
                const roommateQueryParams = {
                    TableName: APPLICATIONS_TABLE_NAME,
                    IndexName: 'ListingApplicationsIndex',
                    KeyConditionExpression: 'listingId = :listingId',
                    FilterExpression: '#status = :status',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':listingId': app.listingId,
                        ':status': 'accepted'
                    }
                };

                const roommateApplications = await docClient.send(new QueryCommand(roommateQueryParams));
                const acceptedApplications = roommateApplications.Items || [];

                if (acceptedApplications.length === 0) {
                    return { ...app, acceptedRoommates: [] };
                }

                // Get unique applicant IDs
                const roommateIds = _.uniq(acceptedApplications.map(a => a.applicantId));

                // Batch get user profiles for all accepted applicants
                const userBatchParams = {
                    RequestItems: {
                        [USERS_TABLE_NAME]: {
                            Keys: roommateIds.map(id => ({ userId: id }))
                        }
                    }
                };

                const userResults = await docClient.send(new BatchGetCommand(userBatchParams));
                const users = userResults.Responses[USERS_TABLE_NAME] || [];

                // Transform user data to include profile information
                const acceptedRoommates = users.map(user => ({
                    userId: user.userId,
                    email: user.email,
                    profile: user.profile || {}
                }));

                return {
                    ...app,
                    acceptedRoommates
                };

            } catch (error) {
                console.error(`Error fetching roommates for application ${app.applicationId}:`, error);
                // Return application without roommates if there's an error
                return { ...app, acceptedRoommates: [] };
            }
        }));

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                userId: applicantId,
                applications: finalApplications,
                pagination: { total: finalApplications.length, hasMore: false },
                filters: { status: null }
            }),
        };

    } catch (error) {
        console.error('Error fetching user applications:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ message: 'Failed to fetch applications.', error: error.message }),
        };
    }
}; 