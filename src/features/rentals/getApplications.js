const dynamodb = require('../../utils/dynamoDbClient'); // Use the shared v2 client
const { getAuthenticatedUser } = require('../../utils/authUtils');

const LISTINGS_TABLE_NAME = process.env.LISTINGS_TABLE;
const APPLICATIONS_TABLE_NAME = process.env.APPLICATIONS_TABLE;
const USERS_TABLE_NAME = process.env.USERS_TABLE;

/**
 * Lambda handler for GET /listings/{listingId}/applications
 * Allows listing owners to view applications for their listings
 */
exports.handler = async (event) => {
    const { listingId } = event.pathParameters;

    const claims = await getAuthenticatedUser(event);
    if (!claims || !claims.sub) {
        return { 
            statusCode: 401, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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

        const userResult = await dynamodb.query(userQuery).promise();
        if (!userResult.Items || userResult.Items.length === 0) {
            console.log('❌ User not found in database:', cognitoSub);
            return { 
                statusCode: 403, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({ message: "Failed to verify user profile" }) 
        };
    }

    try {
        // Step 1: Get the listing to verify ownership
        const listingResult = await dynamodb.get({ TableName: LISTINGS_TABLE_NAME, Key: { listingId } }).promise();
        if (!listingResult.Item) {
            return { 
                statusCode: 404, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ message: "Listing not found" }) 
            };
        }
        const listing = listingResult.Item;

        // Step 2: Authorization Check
        if (listing.initiatorId !== requestingUserId) {
            return { 
                statusCode: 403, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ message: "Forbidden: You do not own this listing." }) 
            };
        }

        // Step 3: Get applications for this listing
        const appsResult = await dynamodb.query({
            TableName: APPLICATIONS_TABLE_NAME,
            IndexName: 'ListingApplicationsIndex',
            KeyConditionExpression: 'listingId = :listingId',
            ExpressionAttributeValues: { ':listingId': listingId },
        }).promise();

        const applications = appsResult.Items || [];

        if (applications.length === 0) {
            return { 
                statusCode: 200, 
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ success: true, data: { applications: [] } }) 
            };
        }

        // ===== 强制替换核心逻辑，确保返回申请人完整资料 =====

        const applicationsFromDB = applications; // 本地变量重命名保持与说明一致

        // 如果没有申请，直接返回空数组
        if (applicationsFromDB.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                },
                body: JSON.stringify({ success: true, data: [] }),
            };
        }

        // Helper: 批量获取用户资料
        const batchGetUsersByIds = async (userIds) => {
            const uniqueIds = [...new Set(userIds)];
            const params = {
                RequestItems: {
                    [USERS_TABLE_NAME]: {
                        Keys: uniqueIds.map(id => ({ userId: id }))
                    }
                }
            };
            const res = await dynamodb.batchGet(params).promise();
            return res.Responses[USERS_TABLE_NAME] || [];
        };

        // 使用所有 applicantId，一次性从 Users 表获取所有用户信息
        const applicantUserIds = applicationsFromDB.map(app => app.applicantId);
        const userProfiles = await batchGetUsersByIds(applicantUserIds);

        // 将用户信息映射回申请列表
        const applicationsWithDetails = applicationsFromDB.map(app => {
            const applicantProfile = userProfiles.find(p => p.userId === app.applicantId);
            return {
                ...app,
                applicant: applicantProfile || null,
            };
        });

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({ 
                success: true, 
                data: { 
                    applications: applicationsWithDetails,
                    listing: {
                        listingId: listing.listingId,
                        title: listing.title || '',
                        address: listing.address || listing.location?.address || '',
                        monthlyRent: listing.monthlyRent || listing.pricing?.monthlyRent || 0,
                        currency: listing.currency || listing.pricing?.currency || 'USD'
                    },
                    pagination: {
                        nextCursor: null,
                        hasNextPage: false,
                        totalCount: applicationsWithDetails.length
                    }
                } 
            }),
        };

    } catch (error) {
        console.error('Error in getApplications:', error);
        return { 
            statusCode: 500, 
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            },
            body: JSON.stringify({ message: "Internal Server Error" }) 
        };
    }
};