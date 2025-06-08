const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Lambda handler for GET /listings/{listingId}/applications
 * Allows listing owners to view applications for their listings
 */
exports.handler = async (event) => {
    console.log('GetApplications event:', JSON.stringify(event, null, 2));

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
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Authentication required'
                })
            };
        }

        const userCognitoSub = claims.sub;
        const currentUserId = claims['custom:userId'] || claims.userId;

        // 2. Parameter Extraction
        const listingId = event.pathParameters?.listingId;
        if (!listingId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'listingId is required'
                })
            };
        }

        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const statusFilter = queryParams.status;
        const limit = parseInt(queryParams.limit || '20');
        const startCursor = queryParams.startCursor;

        // Validate pagination parameters
        if (limit < 1 || limit > 100) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Bad Request',
                    message: 'limit must be between 1 and 100'
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
                            'Access-Control-Allow-Methods': 'GET,OPTIONS'
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
                        'Access-Control-Allow-Methods': 'GET,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Internal Server Error',
                        message: 'Failed to verify user'
                    })
                };
            }
        }

        // 4. Authorization Check - Verify listing ownership
        let listing;
        try {
            const listingParams = {
                TableName: LISTINGS_TABLE,
                Key: {
                    listingId: listingId
                }
            };

            const listingResult = await dynamodb.get(listingParams).promise();
            
            if (!listingResult.Item) {
                return {
                    statusCode: 404,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'GET,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Not Found',
                        message: 'Listing not found'
                    })
                };
            }

            listing = listingResult.Item;

            // Critical Authorization Check: Only listing owner can view applications
            if (listing.initiatorId !== userId) {
                console.log('Authorization failed:', {
                    listingId,
                    listingInitiatorId: listing.initiatorId,
                    currentUserId: userId
                });
                
                return {
                    statusCode: 403,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'GET,OPTIONS'
                    },
                    body: JSON.stringify({
                        error: 'Forbidden',
                        message: 'You can only view applications for your own listings'
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
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    message: 'Failed to verify listing ownership'
                })
            };
        }

        // 5. Query Applications with Pagination
        let applications = [];
        let nextCursor = null;
        
        try {
            // Build query parameters for ListingApplicationsIndex
            const queryParams = {
                TableName: APPLICATIONS_TABLE,
                IndexName: 'ListingApplicationsIndex',
                KeyConditionExpression: 'listingId = :listingId',
                ExpressionAttributeValues: {
                    ':listingId': listingId
                },
                ScanIndexForward: false, // Sort by createdAt descending (newest first)
                Limit: limit + 1 // Get one extra to determine if there are more pages
            };

            // Add status filter if provided
            if (statusFilter) {
                queryParams.FilterExpression = '#status = :status';
                queryParams.ExpressionAttributeNames = {
                    '#status': 'status'
                };
                queryParams.ExpressionAttributeValues[':status'] = statusFilter;
            }

            // Add cursor for pagination
            if (startCursor) {
                try {
                    const decodedCursor = JSON.parse(Buffer.from(startCursor, 'base64').toString());
                    queryParams.ExclusiveStartKey = decodedCursor;
                } catch (error) {
                    return {
                        statusCode: 400,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                            'Access-Control-Allow-Methods': 'GET,OPTIONS'
                        },
                        body: JSON.stringify({
                            error: 'Bad Request',
                            message: 'Invalid startCursor format'
                        })
                    };
                }
            }

            const result = await dynamodb.query(queryParams).promise();
            
            applications = result.Items || [];

            // Check if there are more pages
            if (applications.length > limit) {
                applications = applications.slice(0, limit);
                const lastItem = applications[applications.length - 1];
                nextCursor = Buffer.from(JSON.stringify({
                    applicationId: lastItem.applicationId,
                    listingId: lastItem.listingId,
                    createdAt: lastItem.createdAt
                })).toString('base64');
            }

        } catch (error) {
            console.error('Error querying applications:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Internal Server Error',
                    message: 'Failed to fetch applications'
                })
            };
        }

        // 6. Data Aggregation - Fetch applicant profiles
        const enrichedApplications = [];
        
        if (applications.length > 0) {
            try {
                // Get unique applicant IDs
                const applicantIds = [...new Set(applications.map(app => app.applicantId))];
                
                // Fetch all applicant profiles in parallel
                const profilePromises = applicantIds.map(async (applicantId) => {
                    try {
                        const profileParams = {
                            TableName: USERS_TABLE,
                            Key: {
                                userId: applicantId
                            },
                            ProjectionExpression: 'userId, profile, createdAt'
                        };

                        const profileResult = await dynamodb.get(profileParams).promise();
                        return {
                            userId: applicantId,
                            profile: profileResult.Item?.profile || null
                        };
                    } catch (error) {
                        console.error(`Error fetching profile for user ${applicantId}:`, error);
                        return {
                            userId: applicantId,
                            profile: null
                        };
                    }
                });

                const profiles = await Promise.all(profilePromises);
                const profileMap = profiles.reduce((map, item) => {
                    map[item.userId] = item.profile;
                    return map;
                }, {});

                // Enrich applications with applicant profiles
                for (const application of applications) {
                    const applicantProfile = profileMap[application.applicantId];
                    
                    enrichedApplications.push({
                        applicationId: application.applicationId,
                        listingId: application.listingId,
                        applicantId: application.applicantId,
                        status: application.status,
                        applicationMessage: application.applicationMessage || null,
                        createdAt: application.createdAt,
                        updatedAt: application.updatedAt || application.createdAt,
                        applicant: applicantProfile ? {
                            userId: application.applicantId,
                            profile: applicantProfile
                        } : {
                            userId: application.applicantId,
                            profile: null
                        }
                    });
                }

            } catch (error) {
                console.error('Error enriching applications with profiles:', error);
                // In case of profile fetch errors, return applications without profiles
                for (const application of applications) {
                    enrichedApplications.push({
                        ...application,
                        applicant: {
                            userId: application.applicantId,
                            profile: null
                        }
                    });
                }
            }
        }

        // 7. Build Response
        const response = {
            listingId: listingId,
            applications: enrichedApplications,
            pagination: {
                total: enrichedApplications.length,
                limit: limit,
                hasMore: nextCursor !== null,
                nextCursor: nextCursor
            },
            filters: {
                status: statusFilter || null
            }
        };

        console.log(`Successfully fetched ${enrichedApplications.length} applications for listing ${listingId}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('Unexpected error in getApplications:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            })
        };
    }
}; 