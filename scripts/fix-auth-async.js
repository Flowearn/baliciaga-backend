#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// List of files that need to be fixed
const filesToFix = [
  '../src/features/rentals/createListing.js',
  '../src/features/rentals/createUserProfile-flexible.js',
  '../src/features/rentals/cancelListing.js',
  '../src/features/rentals/finalizeListing.js',
  '../src/features/rentals/updateListing.js',
  '../src/features/rentals/getApplications.js',
  '../src/features/rentals/updateApplication.js',
  '../src/features/rentals/getUserApplications.js',
  '../src/features/rentals/getUserListings.js',
];

console.log('🔧 Fixing async getAuthenticatedUser calls...\n');

filesToFix.forEach((relativePath) => {
  const filePath = path.join(__dirname, relativePath);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace getAuthenticatedUser(event) with await getAuthenticatedUser(event)
    // But only if it's not already await
    const pattern = /(?<!await\s+)getAuthenticatedUser\(event\)/g;
    const originalContent = content;
    content = content.replace(pattern, 'await getAuthenticatedUser(event)');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${path.basename(filePath)}`);
    } else {
      console.log(`⏭️  Already fixed or not needed: ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${path.basename(filePath)}:`, error.message);
  }
});

console.log('\n✨ Done!');