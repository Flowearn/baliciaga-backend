#!/usr/bin/env node

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs").promises;
const path = require("path");

// Configure AWS client with explicit credentials if needed
const client = new DynamoDBClient({ 
  region: "ap-southeast-1",
  // AWS SDK will automatically use credentials from:
  // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. AWS credentials file (~/.aws/credentials)
  // 3. IAM role (if running on EC2/Lambda)
});
const docClient = DynamoDBDocumentClient.from(client);

// Get environment from command line argument
const environment = process.argv[2] || 'dev';
const TABLE_NAME = `baliciaga-places-${environment}`;
console.log(`Using table: ${TABLE_NAME}`);

async function updateBarAttributes() {
  try {
    console.log("🚀 Starting DynamoDB update with bar attributes...");
    
    // Read the updated bars json based on environment
    const barsPath = path.join(__dirname, `bars-${environment}.json`);
    const barsData = JSON.parse(await fs.readFile(barsPath, 'utf-8'));
    
    console.log(`Found ${barsData.length} bars to process`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Update each bar that has the new attributes
    for (const bar of barsData) {
      // Only update if bar has the new attributes
      if (bar.barType || bar.drinkFocus || bar.signatureDrinks || bar.priceRange) {
        try {
          const updateExpression = [];
          const expressionAttributeNames = {};
          const expressionAttributeValues = {};
          
          // Build update expression for each attribute
          if (bar.barType) {
            updateExpression.push('#barType = :barType');
            expressionAttributeNames['#barType'] = 'barType';
            expressionAttributeValues[':barType'] = bar.barType;
          }
          
          if (bar.drinkFocus) {
            updateExpression.push('#drinkFocus = :drinkFocus');
            expressionAttributeNames['#drinkFocus'] = 'drinkFocus';
            expressionAttributeValues[':drinkFocus'] = bar.drinkFocus;
          }
          
          if (bar.atmosphere) {
            updateExpression.push('#atmosphere = :atmosphere');
            expressionAttributeNames['#atmosphere'] = 'atmosphere';
            expressionAttributeValues[':atmosphere'] = bar.atmosphere;
          }
          
          if (bar.signatureDrinks) {
            updateExpression.push('#signatureDrinks = :signatureDrinks');
            expressionAttributeNames['#signatureDrinks'] = 'signatureDrinks';
            expressionAttributeValues[':signatureDrinks'] = bar.signatureDrinks;
          }
          
          if (bar.priceRange) {
            updateExpression.push('#priceRange = :priceRange');
            expressionAttributeNames['#priceRange'] = 'priceRange';
            expressionAttributeValues[':priceRange'] = bar.priceRange;
          }
          
          if (updateExpression.length > 0) {
            const params = {
              TableName: TABLE_NAME,
              Key: {
                placeId: bar.placeId
              },
              UpdateExpression: 'SET ' + updateExpression.join(', '),
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues
            };
            
            await docClient.send(new UpdateCommand(params));
            console.log(`✅ Updated ${bar.name} (${bar.placeId})`);
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Error updating ${bar.name}:`, error.message);
          errorCount++;
        }
      }
    }
    
    console.log(`\n✨ Update complete!`);
    console.log(`   Success: ${successCount} bars`);
    console.log(`   Errors: ${errorCount} bars`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the update
updateBarAttributes();