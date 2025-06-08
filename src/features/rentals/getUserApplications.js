const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Lambda handler for GET /users/me/applications
 * Allows users to view their own submitted applications
 */
exports.handler = async (event) => {
    console.log('GetUserApplications event:', JSON.stringify(event, null, 2));

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

        // 2. Get current user's userId if not available in claims
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

        // 3. Query User Applications with Pagination
        let applications = [];
        let nextCursor = null;
        
        try {
            // Build query parameters for UserApplicationsIndex
            const applicationQueryParams = {
                TableName: APPLICATIONS_TABLE,
                IndexName: 'UserApplicationsIndex',
                KeyConditionExpression: 'applicantId = :applicantId',
                ExpressionAttributeValues: {
                    ':applicantId': userId
                },
                ScanIndexForward: false, // Sort by createdAt descending (newest first)
                Limit: limit + 1 // Get one extra to determine if there are more pages
            };

            // Add status filter if provided
            if (statusFilter) {
                applicationQueryParams.FilterExpression = '#status = :status';
                applicationQueryParams.ExpressionAttributeNames = {
                    '#status': 'status'
                };
                applicationQueryParams.ExpressionAttributeValues[':status'] = statusFilter;
            }

            // Add cursor for pagination
            if (startCursor) {
                try {
                    const decodedCursor = JSON.parse(Buffer.from(startCursor, 'base64').toString());
                    applicationQueryParams.ExclusiveStartKey = decodedCursor;
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

            const result = await dynamodb.query(applicationQueryParams).promise();
            
            applications = result.Items || [];

            // Check if there are more pages
            if (applications.length > limit) {
                applications = applications.slice(0, limit);
                const lastItem = applications[applications.length - 1];
                nextCursor = Buffer.from(JSON.stringify({
                    applicationId: lastItem.applicationId,
                    applicantId: lastItem.applicantId,
                    createdAt: lastItem.createdAt
                })).toString('base64');
            }

        } catch (error) {
            console.error('Error querying user applications:', error);
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

        // 4. Data Aggregation - Fetch listing summaries
        const enrichedApplications = [];
        
        if (applications.length > 0) {
            try {
                // Get unique listing IDs
                const listingIds = [...new Set(applications.map(app => app.listingId))];
                
                // Fetch all listing summaries in parallel
                const listingPromises = listingIds.map(async (listingId) => {
                    try {
                        const listingParams = {
                            TableName: LISTINGS_TABLE,
                            Key: {
                                listingId: listingId
                            },
                            ProjectionExpression: 'listingId, propertyDetails.locationName, propertyDetails.photos, leaseDetails.displayPrice, #status, propertyDetails.propertyType, title',
                            ExpressionAttributeNames: {
                                '#status': 'status'
                            }
                        };

                        const listingResult = await dynamodb.get(listingParams).promise();
                        
                        if (listingResult.Item) {
                            // Build listing summary
                            const listing = listingResult.Item;
                            return {
                                listingId: listing.listingId,
                                title: listing.title || null,
                                locationName: listing.propertyDetails?.locationName || null,
                                primaryPhoto: listing.propertyDetails?.photos?.[0] || null,
                                displayPrice: listing.leaseDetails?.displayPrice || null,
                                propertyType: listing.propertyDetails?.propertyType || null,
                                status: listing.status || null
                            };
                        }
                        
                        return {
                            listingId: listingId,
                            title: null,
                            locationName: null,
                            primaryPhoto: null,
                            displayPrice: null,
                            propertyType: null,
                            status: null
                        };
                    } catch (error) {
                        console.error(`Error fetching listing ${listingId}:`, error);
                        return {
                            listingId: listingId,
                            title: null,
                            locationName: null,
                            primaryPhoto: null,
                            displayPrice: null,
                            propertyType: null,
                            status: null
                        };
                    }
                });

                const listings = await Promise.all(listingPromises);
                const listingMap = listings.reduce((map, item) => {
                    map[item.listingId] = item;
                    return map;
                }, {});

                // Enrich applications with listing summaries
                for (const application of applications) {
                    const listingSummary = listingMap[application.listingId];
                    
                    enrichedApplications.push({
                        applicationId: application.applicationId,
                        listingId: application.listingId,
                        applicantId: application.applicantId,
                        status: application.status,
                        applicationMessage: application.applicationMessage || null,
                        createdAt: application.createdAt,
                        updatedAt: application.updatedAt || application.createdAt,
                        listing: listingSummary
                    });
                }

            } catch (error) {
                console.error('Error enriching applications with listing summaries:', error);
                // In case of listing fetch errors, return applications without listing info
                for (const application of applications) {
                    enrichedApplications.push({
                        ...application,
                        listing: {
                            listingId: application.listingId,
                            title: null,
                            locationName: null,
                            primaryPhoto: null,
                            displayPrice: null,
                            propertyType: null,
                            status: null
                        }
                    });
                }
            }
        }

        // 5. Build Response
        const response = {
            userId: userId,
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

        console.log(`Successfully fetched ${enrichedApplications.length} applications for user ${userId}`);

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
        console.error('Unexpected error in getUserApplications:', error);
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