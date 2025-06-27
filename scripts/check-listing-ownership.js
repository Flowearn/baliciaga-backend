#!/usr/bin/env node

/**
 * Script to check listing ownership for debugging permission issues
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const LISTINGS_TABLE = 'Baliciaga-Listings-dev';
const USERS_TABLE = 'Baliciaga-Users-dev';

async function checkListingOwnership() {
  try {
    // 1. Find the listing by title
    console.log('🔍 Searching for listing: "Villa for rent Kandi House 3"');
    
    const scanParams = {
      TableName: LISTINGS_TABLE,
      FilterExpression: 'contains(title, :title)',
      ExpressionAttributeValues: {
        ':title': 'Villa for rent Kandi House 3'
      }
    };
    
    const scanResult = await dynamodb.scan(scanParams).promise();
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('❌ Listing not found');
      return;
    }
    
    const listing = scanResult.Items[0];
    console.log('\n📋 Listing found:');
    console.log(`- Listing ID: ${listing.listingId}`);
    console.log(`- Title: ${listing.title}`);
    console.log(`- Initiator ID: ${listing.initiatorId}`);
    console.log(`- Status: ${listing.status}`);
    console.log(`- Created: ${listing.createdAt}`);
    
    // 2. Find user by email
    console.log('\n🔍 Searching for user: troyzhy@gmail.com');
    
    const userScanParams = {
      TableName: USERS_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': 'troyzhy@gmail.com'
      }
    };
    
    const userScanResult = await dynamodb.scan(userScanParams).promise();
    
    if (!userScanResult.Items || userScanResult.Items.length === 0) {
      console.log('❌ User not found');
      return;
    }
    
    const user = userScanResult.Items[0];
    console.log('\n👤 User found:');
    console.log(`- User ID: ${user.userId}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Cognito Sub: ${user.cognitoSub}`);
    console.log(`- Name: ${user.profile?.name || 'N/A'}`);
    
    // 3. Compare ownership
    console.log('\n🔐 Ownership check:');
    console.log(`- Listing initiatorId: ${listing.initiatorId}`);
    console.log(`- User userId: ${user.userId}`);
    console.log(`- Match: ${listing.initiatorId === user.userId ? '✅ YES' : '❌ NO'}`);
    
    // 4. If no match, find actual owner
    if (listing.initiatorId !== user.userId) {
      console.log('\n🔍 Finding actual owner...');
      
      const ownerParams = {
        TableName: USERS_TABLE,
        Key: { userId: listing.initiatorId }
      };
      
      const ownerResult = await dynamodb.get(ownerParams).promise();
      
      if (ownerResult.Item) {
        console.log('\n👤 Actual owner:');
        console.log(`- User ID: ${ownerResult.Item.userId}`);
        console.log(`- Email: ${ownerResult.Item.email}`);
        console.log(`- Name: ${ownerResult.Item.profile?.name || 'N/A'}`);
      } else {
        console.log('❌ Owner not found in database');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkListingOwnership();