#!/usr/bin/env node

const dynamodb = require('../src/utils/dynamoDbClient');

const USERS_TABLE = process.env.USERS_TABLE_NAME;
const LISTINGS_TABLE = process.env.LISTINGS_TABLE_NAME;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE_NAME;

async function debugData() {
  try {
    console.log('🔍 Debugging DynamoDB Data');
    console.log('==========================');
    
    // Get recent users
    console.log('\n📋 Recent Users:');
    const usersResult = await dynamodb.scan({
      TableName: USERS_TABLE,
      Limit: 5
    }).promise();
    
    usersResult.Items.forEach(user => {
      console.log(`  - UserId: ${user.userId}`);
      console.log(`    CognitoSub: ${user.cognitoSub}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Name: ${user.profile?.name}`);
      console.log('');
    });
    
    // Get recent listings
    console.log('\n🏠 Recent Listings:');
    const listingsResult = await dynamodb.scan({
      TableName: LISTINGS_TABLE,
      Limit: 5
    }).promise();
    
    listingsResult.Items.forEach(listing => {
      console.log(`  - ListingId: ${listing.listingId}`);
      console.log(`    InitiatorId: ${listing.initiatorId}`);
      console.log(`    Location: ${listing.locationName}`);
      console.log(`    Status: ${listing.status}`);
      console.log('');
    });
    
    // Get recent applications
    console.log('\n📝 Recent Applications:');
    const applicationsResult = await dynamodb.scan({
      TableName: APPLICATIONS_TABLE,
      Limit: 5
    }).promise();
    
    applicationsResult.Items.forEach(application => {
      console.log(`  - ApplicationId: ${application.applicationId}`);
      console.log(`    ListingId: ${application.listingId}`);
      console.log(`    ApplicantId: ${application.applicantId}`);
      console.log(`    Status: ${application.status}`);
      console.log('');
    });
    
    // Check for matching data
    if (usersResult.Items.length > 0 && listingsResult.Items.length > 0) {
      console.log('\n🔗 Checking Data Relationships:');
      const user = usersResult.Items[0];
      const listing = listingsResult.Items[0];
      
      console.log(`User.userId: ${user.userId}`);
      console.log(`Listing.initiatorId: ${listing.initiatorId}`);
      console.log(`Match: ${user.userId === listing.initiatorId ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugData(); 