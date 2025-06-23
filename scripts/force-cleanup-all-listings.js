/**
 * Script to clean up all listings and related applications
 * This will remove all test data from the database
 * FORCE VERSION - No confirmation required
 */

const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Table names from environment variables
const LISTINGS_TABLE = process.env.LISTINGS_TABLE || 'Baliciaga-Listings-dev';
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE || 'Baliciaga-Applications-dev';

/**
 * Scan and delete all items from a table
 */
async function cleanupTable(tableName, keyAttribute) {
  console.log(`\n🧹 Cleaning up table: ${tableName}`);
  
  try {
    // First, scan to get all items
    const scanParams = {
      TableName: tableName
    };
    
    let items = [];
    let lastEvaluatedKey = null;
    
    // Scan all items (handle pagination)
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const scanResult = await dynamodb.scan(scanParams).promise();
      items = items.concat(scanResult.Items);
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    console.log(`📊 Found ${items.length} items to delete`);
    
    if (items.length === 0) {
      console.log('✅ Table is already empty');
      return 0;
    }
    
    // Delete items in batches (DynamoDB supports max 25 items per batch)
    const batchSize = 25;
    let deletedCount = 0;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const deleteRequests = batch.map(item => ({
        DeleteRequest: {
          Key: {
            [keyAttribute]: item[keyAttribute]
          }
        }
      }));
      
      const batchWriteParams = {
        RequestItems: {
          [tableName]: deleteRequests
        }
      };
      
      try {
        await dynamodb.batchWrite(batchWriteParams).promise();
        deletedCount += batch.length;
        console.log(`🗑️  Deleted ${deletedCount}/${items.length} items...`);
      } catch (error) {
        console.error(`❌ Error deleting batch: ${error.message}`);
      }
    }
    
    console.log(`✅ Successfully deleted ${deletedCount} items from ${tableName}`);
    return deletedCount;
    
  } catch (error) {
    console.error(`❌ Error cleaning up ${tableName}: ${error.message}`);
    throw error;
  }
}

/**
 * Main cleanup function
 */
async function cleanupAllData() {
  console.log('🚀 Starting FORCED database cleanup...');
  console.log('⚠️  WARNING: Deleting ALL listings and applications!');
  console.log('');
  
  try {
    // Clean up applications first (they reference listings)
    const deletedApplications = await cleanupTable(APPLICATIONS_TABLE, 'applicationId');
    
    // Then clean up listings
    const deletedListings = await cleanupTable(LISTINGS_TABLE, 'listingId');
    
    console.log('\n🎉 Database cleanup completed successfully!');
    console.log('📝 Summary:');
    console.log(`   - Deleted ${deletedApplications} applications from ${APPLICATIONS_TABLE}`);
    console.log(`   - Deleted ${deletedListings} listings from ${LISTINGS_TABLE}`);
    
    // Verify cleanup
    console.log('\n🔍 Verifying cleanup...');
    
    // Check listings count
    const listingsCount = await dynamodb.scan({ 
      TableName: LISTINGS_TABLE,
      Select: 'COUNT'
    }).promise();
    
    // Check applications count
    const applicationsCount = await dynamodb.scan({ 
      TableName: APPLICATIONS_TABLE,
      Select: 'COUNT'
    }).promise();
    
    console.log(`   - Remaining listings: ${listingsCount.Count}`);
    console.log(`   - Remaining applications: ${applicationsCount.Count}`);
    
    if (listingsCount.Count === 0 && applicationsCount.Count === 0) {
      console.log('\n✅ All data successfully cleaned!');
    } else {
      console.log('\n⚠️  Some data may still remain in the tables');
    }
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run cleanup immediately
cleanupAllData()
  .then(() => {
    console.log('\n✨ Cleanup process finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });