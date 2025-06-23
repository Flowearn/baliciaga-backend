const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { buildCompleteResponse } = require('../../utils/responseUtils');

const dynamoDb = new DynamoDBClient({ region: 'ap-southeast-1' });
const tableName = process.env.LISTINGS_TABLE;

// Lambda handler for fetching rental listings
// TODO: Implement getListings handler logic

module.exports.handler = async (event) => {
  console.log(`Fetching listings from table: ${tableName}`);
  console.log('Request method:', event.httpMethod);
  console.log('Request headers:', event.headers);
  
  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': event.headers?.origin || 'http://localhost:8082',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-test-user-email,x-test-user-sub,x-test-user-groups',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }
  
  const params = {
    TableName: tableName,
  };

  try {
    const { Items } = await dynamoDb.send(new ScanCommand(params));
    const rawListings = Items.map(item => unmarshall(item));
    
    // Transform each listing using the shared buildCompleteResponse function
    const listings = await Promise.all(rawListings.map(listing => buildCompleteResponse(listing)));
    
    console.log(`Found ${rawListings.length} listings, transformed to complete response format.`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': event.headers?.origin || 'http://localhost:8082',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-test-user-email,x-test-user-sub,x-test-user-groups',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      },
      body: JSON.stringify({
        success: true,
        data: {
          listings: listings,
          pagination: {
            hasMore: false,
            nextCursor: null,
            totalCount: listings.length
          }
        }
      }),
    };
  } catch (error) {
    console.error('Error fetching listings:', error);
          return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': event.headers?.origin || 'http://localhost:8082',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-test-user-email,x-test-user-sub,x-test-user-groups',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: 'FETCH_ERROR',
            message: 'Failed to fetch listings.',
            details: error.message
          }
        }),
      };
  }
}; 