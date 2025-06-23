/**
 * Script to clean up all listings and related applications
 * This will remove all test data from the database
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
      return;
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
    
  } catch (error) {
    console.error(`❌ Error cleaning up ${tableName}: ${error.message}`);
    throw error;
  }
}

/**
 * Main cleanup function
 */
async function cleanupAllData() {
  console.log('🚀 Starting database cleanup...');
  console.log('⚠️  WARNING: This will delete ALL listings and applications!');
  console.log('');
  
  try {
    // Clean up applications first (they reference listings)
    await cleanupTable(APPLICATIONS_TABLE, 'applicationId');
    
    // Then clean up listings
    await cleanupTable(LISTINGS_TABLE, 'listingId');
    
    console.log('\n🎉 Database cleanup completed successfully!');
    console.log('📝 Summary:');
    console.log(`   - All applications have been removed from ${APPLICATIONS_TABLE}`);
    console.log(`   - All listings have been removed from ${LISTINGS_TABLE}`);
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Add confirmation prompt
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚠️  ============================================');
console.log('⚠️  WARNING: This will DELETE ALL DATA');
console.log('⚠️  All listings and applications will be removed');
console.log('⚠️  ============================================');
console.log('');

rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    rl.close();
    cleanupAllData();
  } else {
    console.log('❌ Cleanup cancelled');
    rl.close();
    process.exit(0);
  }
});