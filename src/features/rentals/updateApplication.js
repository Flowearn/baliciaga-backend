const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Lambda handler for PUT /applications/{applicationId}
 * Allows listing owners to update application status (accept/ignore)
 */
exports.handler = async (event) => {
    console.log('UpdateApplication event:', JSON.stringify(event, null, 2));

    try {
        // 1. Authentication Check
        const claims = event.requestContext?.authorizer?.claims;
        if (!claims || !claims.sub) {
            console.log('Missing authentication claims');
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Authentication required'
                })
            };
        }

        const userCognitoSub = claims.sub;
        const currentUserId = claims['custom:userId'] || claims.userId;

        // 2. Parameter Extraction and Validation
        const applicationId = event.pathParameters?.applicationId;
        if (!applicationId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'applicationId is required'
                })
            };
        }

        // Parse request body
        let requestBody;
        try {
            requestBody = JSON.parse(event.body || '{}');
        } catch (error) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'Invalid JSON in request body'
                })
            };
        }

        const newStatus = requestBody.status;
        if (!newStatus) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'status is required'
                })
            };
        }

        // Validate status value
        const validStatuses = ['accepted', 'ignored'];
        if (!validStatuses.includes(newStatus)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'status must be either "accepted" or "ignored"'
                })
            };
        }

        // 3. Get current user's userId if not available in claims
        let userId = currentUserId;
        if (!userId) {
            try {
                const userQuery = {
                    TableName: USERS_TABLE,
                    IndexName: 'CognitoSubIndex',
                    KeyConditionExpression: 'cognitoSub = :cognitoSub',
                    ExpressionAttributeValues: {
                        ':cognitoSub': userCognitoSub
                    }
                };

                const userResult = await dynamodb.query(userQuery).promise();
                if (!userResult.Items || userResult.Items.length === 0) {
                    console.log('User not found in database:', userCognitoSub);
                    return {
                        statusCode: 403,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                            'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                        },
                        body: JSON.stringify({
                            error: 'Forbidden',
                            message: 'User profile not found'
                        })
                    };
                }

                userId = userResult.Items[0].userId;
            } catch (error) {
                console.error('Error fetching user profile:', error);
                return {
                    statusCode: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Internal Server Error',
                        message: 'Failed to verify user'
                    })
                };
            }
        }

        // 4. CRITICAL Authorization Check - Get Application Details
        let application;
        try {
            const applicationParams = {
                TableName: APPLICATIONS_TABLE,
                Key: {
                    applicationId: applicationId
                }
            };

            const applicationResult = await dynamodb.get(applicationParams).promise();
            
            if (!applicationResult.Item) {
                return {
                    statusCode: 404,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Not Found',
                        message: 'Application not found'
                    })
                };
            }

            application = applicationResult.Item;

        } catch (error) {
            console.error('Error fetching application:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    message: 'Failed to fetch application'
                })
            };
        }

        // 5. Get Listing Details to Verify Ownership
        let listing;
        try {
            const listingParams = {
                TableName: LISTINGS_TABLE,
                Key: {
                    listingId: application.listingId
                }
            };

            const listingResult = await dynamodb.get(listingParams).promise();
            
            if (!listingResult.Item) {
                return {
                    statusCode: 404,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Not Found',
                        message: 'Associated listing not found'
                    })
                };
            }

            listing = listingResult.Item;

            // CRITICAL: Verify listing ownership
            if (listing.initiatorId !== userId) {
                console.log('Authorization failed - not listing owner:', {
                    applicationId,
                    listingId: application.listingId,
                    listingInitiatorId: listing.initiatorId,
                    currentUserId: userId
                });
                
                return {
                    statusCode: 403,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Forbidden',
                        message: 'You can only update applications for your own listings'
                    })
                };
            }

        } catch (error) {
            console.error('Error fetching listing:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    message: 'Failed to verify listing ownership'
                })
            };
        }

        // 6. Business Logic Check - Only update pending applications
        if (application.status !== 'pending') {
            return {
                statusCode: 409,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Conflict',
                    message: `Application is already ${application.status}. Only pending applications can be updated.`
                })
            };
        }

        // 7. Update Application Status
        let updatedApplication;
        try {
            const updateParams = {
                TableName: APPLICATIONS_TABLE,
                Key: {
                    applicationId: applicationId
                },
                UpdateExpression: 'SET #status = :newStatus, updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':newStatus': newStatus,
                    ':updatedAt': new Date().toISOString()
                },
                ConditionExpression: '#status = :currentStatus', // Ensure concurrent modification safety
                ExpressionAttributeValues: {
                    ':newStatus': newStatus,
                    ':updatedAt': new Date().toISOString(),
                    ':currentStatus': 'pending'
                },
                ReturnValues: 'ALL_NEW'
            };

            const updateResult = await dynamodb.update(updateParams).promise();
            updatedApplication = updateResult.Attributes;

        } catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                return {
                    statusCode: 409,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Conflict',
                        message: 'Application status has been modified by another request. Please refresh and try again.'
                    })
                };
            }

            console.error('Error updating application:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    message: 'Failed to update application'
                })
            };
        }

        // 8. Build Response
        const response = {
            success: true,
            data: {
                applicationId: updatedApplication.applicationId,
                listingId: updatedApplication.listingId,
                applicantId: updatedApplication.applicantId,
                status: updatedApplication.status,
                applicationMessage: updatedApplication.applicationMessage || null,
                createdAt: updatedApplication.createdAt,
                updatedAt: updatedApplication.updatedAt
            }
        };

        console.log(`Successfully updated application ${applicationId} to status: ${newStatus}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Unexpected error in updateApplication:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            })
        };
    }