const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { buildCompleteResponse } = require('../../utils/responseUtils');

const dynamoDb = new DynamoDBClient({ region: 'ap-southeast-1' });
const tableName = process.env.LISTINGS_TABLE_NAME;

// Lambda handler for fetching rental listings
// TODO: Implement getListings handler logic

module.exports.handler = async (event) => {
  console.log(`Fetching listings from table: ${tableName}`);
  
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
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
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
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