const dynamodb = require('../../utils/dynamoDbClient');
const { buildCompleteResponse } = require('../../utils/responseUtils');
const { getAuthenticatedUser } = require('../../utils/authUtils');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Credentials': true,
};

/**
 * AWS Lambda handler for GET /users/me/listings
 * Retrieves all listings created by the current authenticated user
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const claims = await getAuthenticatedUser(event);
    console.log('[DIAGNOSIS] Step 1 - Cognito Sub from token:', claims.sub);
    
    if (!claims || !claims.sub) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            details: 'User ID not found in token'
          }
        })
      };
    }
    
    const cognitoSub = claims.sub;

    // Get the actual userId from our Users table (using correct logic from createListing.js)
    let userId;
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
      console.log('[DIAGNOSIS] Step 2 - Found internal userId from DB:', userResult.Items.length > 0 ? userResult.Items[0].userId : null);
      
      if (!userResult.Items || userResult.Items.length === 0) {
        console.log('❌ User not found in database:', cognitoSub);
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User profile not found. Please create your profile first.'
            }
          })
        };
      }

      userId = userResult.Items[0].userId;
      console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${userId}`);
      console.log('[GetUserListings-Debug] 1. Querying listings for internalUserId:', userId);
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to verify user profile'
          }
        })
      };
    }

    // Parse query parameters
    const { limit = '10', startCursor, status = 'active' } = event.queryStringParameters || {};
    
    // Map frontend status to backend status for database query
    const mapStatusToBackend = (frontendStatus) => {
      const statusMap = {
        'active': 'open',
        'closed': 'closed', 
        'paused': 'cancelled'
      };
      // Log the mapping for debugging
      const mapped = statusMap[frontendStatus] || frontendStatus;
      console.log(`[GetUserListings-Debug] Status mapping: frontend "${frontendStatus}" -> backend "${mapped}"`);
      return mapped;
    };
    
    // Validate limit parameter
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_LIMIT',
            message: 'Limit must be a number between 1 and 50',
            details: { providedLimit: limit }
          }
        })
      };
    }

    // Map frontend status to backend status for database query
    const backendStatus = mapStatusToBackend(status);
    
    console.log(`Fetching listings for userId: ${userId}, limit: ${limitNum}, frontend status: ${status}, backend status: ${backendStatus}`);

    // Build DynamoDB query parameters
    const queryParams = {
      TableName: process.env.LISTINGS_TABLE,
      IndexName: 'InitiatorIndex', // GSI for querying by initiatorId (userId)
      KeyConditionExpression: 'initiatorId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: limitNum,
      ScanIndexForward: false // Sort by creation date descending (newest first)
    };

    // Add status filter if not 'all'
    if (status !== 'all') {
      queryParams.FilterExpression = '#status = :status';
      queryParams.ExpressionAttributeNames = {
        '#status': 'status'
      };
      queryParams.ExpressionAttributeValues[':status'] = backendStatus;
      console.log(`[GetUserListings-Debug] Filtering for status: "${backendStatus}"`);
    } else {
      console.log('[GetUserListings-Debug] No status filter - returning all statuses');
    }

    // Add pagination cursor if provided
    if (startCursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(startCursor, 'base64').toString());
        queryParams.ExclusiveStartKey = decodedCursor;
      } catch (error) {
        console.error('Invalid startCursor format:', error);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: {
              code: 'INVALID_CURSOR',
              message: 'Invalid pagination cursor format',
              details: 'The startCursor parameter is malformed'
            }
          })
        };
      }
    }

    // Execute query with pagination handling for filtered results
    console.log('[MyListings API] DynamoDB Query Params:', JSON.stringify(queryParams, null, 2));
    console.log('[GetUserListings-Debug] 2. DynamoDB Query Params:', JSON.stringify(queryParams, null, 2));
    
    // When using FilterExpression, we need to handle pagination differently
    // to ensure we get enough filtered results
    let allItems = [];
    let lastEvaluatedKey = queryParams.ExclusiveStartKey;
    let actualScannedCount = 0;
    
    // Keep querying until we have enough filtered results or no more data
    while (allItems.length < limitNum) {
        const currentQueryParams = { ...queryParams };
        if (lastEvaluatedKey) {
            currentQueryParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const queryResult = await dynamodb.query(currentQueryParams).promise();
        console.log(`[MyListings API] Query iteration - Found ${queryResult.Items.length} items after filtering, ScannedCount: ${queryResult.ScannedCount}`);
        
        // Debug: Let's query without filter to see what statuses exist
        if (queryResult.Items.length === 0 && queryResult.ScannedCount > 0) {
            const debugParams = {
                TableName: process.env.LISTINGS_TABLE,
                IndexName: 'InitiatorIndex',
                KeyConditionExpression: 'initiatorId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                },
                Limit: 5
            };
            const debugResult = await dynamodb.query(debugParams).promise();
            console.log('[GetUserListings-Debug] Sample listings without filter:', debugResult.Items.map(item => ({
                listingId: item.listingId,
                status: item.status,
                title: item.title
            })));
            
            // Count listings by status
            const statusCounts = {};
            debugResult.Items.forEach(item => {
                statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
            });
            console.log('[GetUserListings-Debug] Status distribution for user listings:', statusCounts);
        }
        
        allItems = allItems.concat(queryResult.Items);
        actualScannedCount += queryResult.ScannedCount || 0;
        lastEvaluatedKey = queryResult.LastEvaluatedKey;
        
        // Stop if no more items to scan
        if (!lastEvaluatedKey) {
            console.log('[GetUserListings-Debug] No more pages to scan, stopping pagination');
            break;
        }
        
        // Log pagination status
        console.log(`[GetUserListings-Debug] Pagination status: allItems=${allItems.length}, limitNum=${limitNum}, hasMore=${!!lastEvaluatedKey}`);
        
        // Safety limit to prevent infinite loops
        if (actualScannedCount > 1000) {
            console.log('[MyListings API] Safety limit reached, stopping pagination');
            break;
        }
    }
    
    // Trim to requested limit
    const hasMoreItems = allItems.length > limitNum || !!lastEvaluatedKey;
    allItems = allItems.slice(0, limitNum);
    
    const result = {
        Items: allItems,
        Count: allItems.length,
        ScannedCount: actualScannedCount,
        LastEvaluatedKey: hasMoreItems ? lastEvaluatedKey : undefined
    };
    
    console.log('[MyListings API] Final aggregated result:', {
        itemCount: result.Items.length,
        scannedCount: result.ScannedCount,
        hasMore: !!result.LastEvaluatedKey
    });
    console.log('[GetUserListings-Debug] 3. Raw result from DynamoDB:', JSON.stringify(result, null, 2));
    
    console.log(`DynamoDB query result: Found ${result.Items.length} raw items`);
    if (result.Items.length > 0) {
      console.log('Sample raw item status:', result.Items[0].status);
      console.log('All raw item statuses:', result.Items.map(item => item.status));
    }

    // Get application counts for each listing
    const listingIds = result.Items.map(item => item.listingId);
    const applicationCountsMap = {};
    
    if (listingIds.length > 0) {
      // Query applications table to get counts for each listing
      for (const listingId of listingIds) {
        try {
          const appQueryParams = {
            TableName: process.env.APPLICATIONS_TABLE,
            IndexName: 'ListingApplicationsIndex', // GSI for querying by listingId
            KeyConditionExpression: 'listingId = :listingId',
            ExpressionAttributeValues: {
              ':listingId': listingId
            },
            Select: 'COUNT'
          };
          
          console.log(`Querying applications for listing ${listingId}, table: ${process.env.APPLICATIONS_TABLE}`);
          console.log('Query params:', JSON.stringify(appQueryParams, null, 2));
          
          const appResult = await dynamodb.query(appQueryParams).promise();
          console.log(`Application count result for ${listingId}:`, appResult.Count);
          
          applicationCountsMap[listingId] = appResult.Count || 0;
        } catch (error) {
          console.error(`Error getting application count for listing ${listingId}:`, error);
          applicationCountsMap[listingId] = 0;
        }
      }
    }
    
    console.log('Application counts map:', applicationCountsMap);

    // Transform listings using shared buildCompleteResponse function
    const listingsSummary = await Promise.all(result.Items.map(async (listing) => {
      const completeResponse = await buildCompleteResponse(listing);
      // Add additional fields for owner view with dynamic application count
      return {
        ...completeResponse,
        applicationsCount: applicationCountsMap[listing.listingId] || 0,
        viewsCount: listing.viewsCount || 0
      };
    }));

    console.log(`Transformed ${listingsSummary.length} listings using buildCompleteResponse`);

    // Prepare pagination information
    const hasNextPage = !!result.LastEvaluatedKey;
    const nextCursor = hasNextPage 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null;

    // Response
    const response = {
      success: true,
      data: {
        listings: listingsSummary,
        pagination: {
          nextCursor,
          hasNextPage,
          totalCount: result.ScannedCount, // Note: This is approximate for filtered queries
          returnedCount: listingsSummary.length
        }
      }
    };

    console.log(`Successfully retrieved ${listingsSummary.length} listings for user ${userId}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error in getUserListings:', error);

    // Handle specific DynamoDB errors
    if (error.code === 'ValidationException') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.message
          }
        })
      };
    }

    if (error.code === 'ResourceNotFoundException') {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Database table not found',
            details: 'The listings table or index is not available'
          }
        })
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while fetching your listings',
          details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        }
      })
    };
  }
}; 