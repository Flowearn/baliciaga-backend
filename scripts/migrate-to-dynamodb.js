#!/usr/bin/env node

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs').promises;
const path = require('path');

// Configure AWS SDK
const dynamoDBClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'ap-southeast-1' 
});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = 'baliciaga-places-dev';

// Source data files to migrate
const SOURCE_FILES = [
  'dining-dev.json',
  'bars-dev.json',
  'cafes-dev.json',
  'cowork-dev.json'
];

async function createTableIfNotExists() {
  try {
    // Check if table exists
    await dynamoDBClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`Table ${TABLE_NAME} already exists.`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Creating table ${TABLE_NAME}...`);
      
      const createTableParams = {
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'placeId', KeyType: 'HASH' } // Partition key
        ],
        AttributeDefinitions: [
          { AttributeName: 'placeId', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST' // On-demand billing
      };
      
      await dynamoDBClient.send(new CreateTableCommand(createTableParams));
      
      // Wait for table to be active
      console.log('Waiting for table to be active...');
      let tableActive = false;
      while (!tableActive) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const { Table } = await dynamoDBClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        tableActive = Table.TableStatus === 'ACTIVE';
      }
      console.log('Table created successfully!');
    } else {
      throw error;
    }
  }
}

async function loadPlacesData() {
  const allPlaces = [];
  const scriptDir = __dirname;
  
  for (const file of SOURCE_FILES) {
    const filePath = path.join(scriptDir, file);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const places = JSON.parse(data);
      
      // Add type based on filename
      const type = file.includes('dining') ? 'dining' : 
                   file.includes('bars') ? 'bar' : 
                   file.includes('cafes') ? 'cafe' : 
                   file.includes('cowork') ? 'coworking' : 'other';
      
      // Add type field to each place
      places.forEach(place => {
        place.type = type;
      });
      
      allPlaces.push(...places);
      console.log(`Loaded ${places.length} places from ${file}`);
    } catch (error) {
      console.error(`Error loading ${file}:`, error.message);
    }
  }
  
  return allPlaces;
}

async function batchWritePlaces(places) {
  console.log(`Starting migration of ${places.length} places...`);
  
  // Process in batches of 25 (DynamoDB limit)
  const batchSize = 25;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    
    try {
      // Use individual PutItem operations for better error handling
      const putPromises = batch.map(place => {
        // Ensure placeId exists
        if (!place.placeId) {
          console.error(`Skipping place without placeId: ${place.name}`);
          errorCount++;
          return Promise.resolve();
        }
        
        return docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: place
        })).then(() => {
          successCount++;
        }).catch(error => {
          console.error(`Error writing place ${place.placeId}:`, error.message);
          errorCount++;
        });
      });
      
      await Promise.all(putPromises);
      
      // Show progress
      const progress = Math.min(i + batchSize, places.length);
      console.log(`Progress: ${progress}/${places.length} (${Math.round(progress / places.length * 100)}%)`);
      
      // Small delay to avoid throttling
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Batch error:`, error);
      errorCount += batch.length;
    }
  }
  
  console.log(`\nMigration complete!`);
  console.log(`✓ Successfully migrated: ${successCount} places`);
  console.log(`✗ Failed: ${errorCount} places`);
}

async function main() {
  try {
    console.log('Starting DynamoDB migration...\n');
    
    // Step 1: Create table if it doesn't exist
    await createTableIfNotExists();
    
    // Step 2: Load all places data
    const places = await loadPlacesData();
    console.log(`\nTotal places to migrate: ${places.length}`);
    
    // Step 3: Batch write to DynamoDB
    await batchWritePlaces(places);
    
    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main();