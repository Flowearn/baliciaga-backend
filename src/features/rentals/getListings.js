const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoDb = new DynamoDBClient({ region: 'ap-southeast-1' });
const tableName = `Baliciaga-Listings-${process.env.STAGE || 'dev'}`;

// Lambda handler for fetching rental listings
// TODO: Implement getListings handler logic

module.exports.handler = async (event) => {
  console.log(`Fetching listings from table: ${tableName}`);
  
  const params = {
    TableName: tableName,
  };

  try {
    const { Items } = await dynamoDb.send(new ScanCommand(params));
    const listings = Items.map(item => unmarshall(item));
    
    console.log(`Found ${listings.length} listings.`);

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