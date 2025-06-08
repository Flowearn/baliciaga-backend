const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

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
    // Extract userId from Cognito JWT token
    const userId = event.requestContext?.authorizer?.claims?.sub;
    if (!userId) {
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

    // Parse query parameters
    const { limit = '10', startCursor, status = 'active' } = event.queryStringParameters || {};
    
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

    console.log(`Fetching listings for userId: ${userId}, limit: ${limitNum}, status: ${status}`);

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
      queryParams.ExpressionAttributeValues[':status'] = status;
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

    // Execute query
    const result = await dynamodb.query(queryParams).promise();

    // Transform listings to summary format (similar to GET /listings)
    const listingsSummary = result.Items.map(listing => ({
      listingId: listing.listingId,
      title: listing.title,
      description: listing.description,
      pricing: {
        monthlyRent: listing.monthlyRent,
        currency: listing.currency,
        deposit: listing.deposit,
        utilities: listing.utilities || 0
      },
      details: {
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        squareFootage: listing.squareFootage || null,
        furnished: listing.furnished || false,
        petFriendly: listing.petFriendly || false,
        smokingAllowed: listing.smokingAllowed || false
      },
      location: {
        address: listing.address,
        coordinates: listing.coordinates || null
      },
      availability: {
        availableFrom: listing.availableFrom,
        minimumStay: listing.minimumStay || 1
      },
      photos: listing.photos || [],
      amenities: listing.amenities || [],
      status: listing.status,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      // Additional fields for owner view
      applicationsCount: listing.applicationsCount || 0,
      viewsCount: listing.viewsCount || 0
    }));

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