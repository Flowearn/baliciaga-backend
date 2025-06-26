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

    if (!['accepted', 'ignored', 'pending', 'withdrawn'].includes(status)) {
        return { 
            statusCode: 400, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({ message: "Invalid status." }) 
        };
    }

    const claims = await getAuthenticatedUser(event);
    if (!claims || !claims.sub) {
        return { 
            statusCode: 401, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({ message: "Unauthorized" }) 
        };
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
            return { 
                statusCode: 403, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({ message: "User profile not found. Please create your profile first." }) 
            };
        }

        requestingUserId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${requestingUserId}`);
    } catch (error) {
        console.error('❌ Error fetching user profile:', error);
        return { 
            statusCode: 500, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({ message: "Failed to verify user profile" }) 
        };
    }

    try {
        // Step 1: Get the application to find the listingId
        const appResult = await docClient.send(new GetCommand({ TableName: APPLICATIONS_TABLE_NAME, Key: { applicationId } }));
        if (!appResult.Item) {
            return { 
                statusCode: 404, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({ message: "Application not found" }) 
            };
        }
        const application = appResult.Item;

        // Step 2: Get the listing to verify ownership
        const listingResult = await docClient.send(new GetCommand({ TableName: LISTINGS_TABLE_NAME, Key: { listingId: application.listingId } }));
        if (!listingResult.Item) {
            return { 
                statusCode: 404, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({ message: "Associated listing not found" }) 
            };
        }

        // Step 3: Authorization Check - THIS IS THE CRITICAL FIX
        if (listingResult.Item.initiatorId !== requestingUserId) {
            return { 
                statusCode: 403, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({ message: "Forbidden: You do not own this listing." }) 
            };
        }

        // Step 4: Handle special logic for withdrawn status
        if (status === 'withdrawn') {
            // Only allow withdrawing from accepted status
            if (application.status !== 'accepted') {
                return { 
                    statusCode: 400, 
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({ 
                        message: "Can only withdraw applications that are currently accepted." 
                    }) 
                };
            }
            
            // Decrement acceptedApplicantsCount in the listing (atomic operation)
            // First, try to get the current count
            const currentListing = await docClient.send(new GetCommand({
                TableName: LISTINGS_TABLE_NAME,
                Key: { listingId: application.listingId }
            }));
            
            const currentCount = currentListing.Item?.acceptedApplicantsCount || 0;
            
            // Only decrement if count is greater than 0
            if (currentCount > 0) {
                const decrementParams = {
                    TableName: LISTINGS_TABLE_NAME,
                    Key: { listingId: application.listingId },
                    UpdateExpression: "SET acceptedApplicantsCount = :newCount, updatedAt = :updatedAt",
                    ExpressionAttributeValues: {
                        ":newCount": currentCount - 1,
                        ":updatedAt": new Date().toISOString()
                    }
                };
                
                try {
                    await docClient.send(new UpdateCommand(decrementParams));
                    console.log(`✅ Decremented acceptedApplicantsCount for listing ${application.listingId} from ${currentCount} to ${currentCount - 1}`);
                } catch (error) {
                    console.error('❌ Error decrementing acceptedApplicantsCount:', error);
                    return { 
                        statusCode: 500, 
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                            'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                        },
                        body: JSON.stringify({ message: "Failed to update listing accepted applicants count" }) 
                    };
                }
            } else {
                console.log(`⚠️ acceptedApplicantsCount is already 0 for listing ${application.listingId}, skipping decrement`);
            }
        } else if (application.status === 'accepted' && status !== 'accepted') {
            // Prevent changing accepted applications to any other status except withdrawn
            return { 
                statusCode: 400, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({ 
                    message: "Cannot change status of an accepted application. Acceptance is final and irrevocable." 
                }) 
            };
        }

        // Step 5: Handle accepting applications - increment acceptedApplicantsCount
        if (status === 'accepted' && application.status !== 'accepted') {
            // Increment acceptedApplicantsCount when accepting an application
            const currentListing = await docClient.send(new GetCommand({
                TableName: LISTINGS_TABLE_NAME,
                Key: { listingId: application.listingId }
            }));
            
            const currentCount = currentListing.Item?.acceptedApplicantsCount || 0;
            
            const incrementParams = {
                TableName: LISTINGS_TABLE_NAME,
                Key: { listingId: application.listingId },
                UpdateExpression: "SET acceptedApplicantsCount = :newCount, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                    ":newCount": currentCount + 1,
                    ":updatedAt": new Date().toISOString()
                }
            };
            
            try {
                await docClient.send(new UpdateCommand(incrementParams));
                console.log(`✅ Incremented acceptedApplicantsCount for listing ${application.listingId} from ${currentCount} to ${currentCount + 1}`);
            } catch (error) {
                console.error('❌ Error incrementing acceptedApplicantsCount:', error);
                return { 
                    statusCode: 500, 
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({ message: "Failed to update listing accepted applicants count" }) 
                };
            }
        }

        // Step 6: Update the application status
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
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({ success: true, data: updatedResult.Attributes }),
        };

    } catch (error) {
        console.error('Error updating application:', error);
        return { 
            statusCode: 500, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({ message: "Internal Server Error" }) 
        };
    }
};