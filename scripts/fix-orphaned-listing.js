/**
 * Fix orphaned listing and status inconsistency
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'Baliciaga-Listings-dev';

const ORPHANED_LISTING_ID = '6a8cca6b-2ca2-4857-9bf7-f1243684c8e2';
const REAL_USER_ID = '9f113eec-8d0d-4422-8e0b-4fd44010500f'; // Troy's real userId

async function fixOrphanedListing() {
  console.log('🔧 Fixing orphaned listing...');
  console.log('Listing ID:', ORPHANED_LISTING_ID);
  console.log('New owner:', REAL_USER_ID);
  console.log('');

  try {
    // 1. Get current listing
    const getParams = {
      TableName: LISTINGS_TABLE,
      Key: { listingId: ORPHANED_LISTING_ID }
    };
    
    const getResult = await dynamodb.get(getParams).promise();
    const listing = getResult.Item;
    
    if (!listing) {
      console.error('❌ Listing not found');
      return;
    }
    
    console.log('📋 Current listing:');
    console.log(`   Title: ${listing.title}`);
    console.log(`   Status: ${listing.status}`);
    console.log(`   InitiatorId: ${listing.initiatorId}`);
    console.log(`   Created: ${listing.createdAt}`);
    console.log(`   Updated: ${listing.updatedAt}`);
    
    // 2. Fix the listing
    const updateParams = {
      TableName: LISTINGS_TABLE,
      Key: { listingId: ORPHANED_LISTING_ID },
      UpdateExpression: 'SET initiatorId = :newUserId, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':newUserId': REAL_USER_ID,
        ':status': 'open',  // Change from 'active' to 'open'
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const updateResult = await dynamodb.update(updateParams).promise();
    
    console.log('\n✅ Listing fixed!');
    console.log('📋 Updated listing:');
    console.log(`   Title: ${updateResult.Attributes.title}`);
    console.log(`   Status: ${updateResult.Attributes.status}`);
    console.log(`   InitiatorId: ${updateResult.Attributes.initiatorId}`);
    console.log(`   Updated: ${updateResult.Attributes.updatedAt}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Also check what status values are actually being used
async function checkStatusValues() {
  console.log('\n🔍 Checking all status values in use:');
  
  try {
    const scanParams = {
      TableName: LISTINGS_TABLE,
      ProjectionExpression: 'listingId, title, #status',
      ExpressionAttributeNames: {
        '#status': 'status'
      }
    };
    
    const scanResult = await dynamodb.scan(scanParams).promise();
    const listings = scanResult.Items;
    
    const statusCounts = {};
    listings.forEach(listing => {
      statusCounts[listing.status] = (statusCounts[listing.status] || 0) + 1;
    });
    
    console.log('Status distribution:');
    Object.keys(statusCounts).forEach(status => {
      console.log(`   "${status}": ${statusCounts[status]} listings`);
    });
    
    // Show all statuses for reference
    console.log('\nAll listings:');
    listings.forEach(listing => {
      console.log(`   ${listing.title}: "${listing.status}"`);
    });
    
  } catch (error) {
    console.error('Error checking statuses:', error);
  }
}

async function run() {
  await fixOrphanedListing();
  await checkStatusValues();
}

run()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });