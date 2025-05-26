#!/usr/bin/env node

/**
 * mergeDeliveryLinks.js
 * 
 * This script merges delivery links (specifically gofoodUrl) from a manually 
 * prepared workfile JSON into the main master cafe JSON data file.
 * 
 * Input: 
 * - cafes-dev.json (master cafe data)
 * - cafes_delivery_workfile.json (manually populated workfile)
 * Output: cafes_with_delivery_links.json (merged data)
 * 
 * Usage: node mergeDeliveryLinks.js
 */

const fs = require('fs/promises');
const path = require('path');

// Configuration Constants
const MASTER_JSON_PATH = path.join(__dirname, 'cafes_dev_image_v2_test.json');
const WORKFILE_JSON_PATH = path.join(__dirname, 'cafes_delivery_workfile.json');
const OUTPUT_JSON_PATH = path.join(__dirname, 'cafes_with_delivery_links.json');

// Statistics tracking
const stats = {
  masterCafesProcessed: 0,
  workfileEntriesLoaded: 0,
  validDeliveryLinksFound: 0,
  cafesWithDeliveryLinksAdded: 0,
  cafesWithoutDeliveryLinks: 0
};

/**
 * Create a lookup map from workfile data
 * @param {Array} workfileEntries - Array of workfile entries
 * @returns {Map} - Map from placeId to gofoodUrl
 */
function createDeliveryLookupMap(workfileEntries) {
  console.log(`📊 Creating delivery lookup map from ${workfileEntries.length} workfile entries...`);
  
  const lookupMap = new Map();
  
  for (const entry of workfileEntries) {
    stats.workfileEntriesLoaded++;
    
    const placeId = entry.placeId;
    const gofoodUrl = entry.gofoodUrl;
    
    // Only add to map if gofoodUrl is non-empty
    if (placeId && gofoodUrl && gofoodUrl.trim() !== '') {
      lookupMap.set(placeId, gofoodUrl.trim());
      stats.validDeliveryLinksFound++;
      
      if (stats.validDeliveryLinksFound % 5 === 0) {
        console.log(`   Found ${stats.validDeliveryLinksFound} valid delivery links...`);
      }
    }
  }
  
  console.log(`   ✅ Created lookup map with ${lookupMap.size} delivery links`);
  return lookupMap;
}

/**
 * Merge delivery links into master cafe data
 * @param {Array} masterCafes - Array of master cafe objects
 * @param {Map} deliveryLookupMap - Map from placeId to gofoodUrl
 * @returns {Array} - Array of merged cafe objects
 */
function mergeCafesWithDeliveryLinks(masterCafes, deliveryLookupMap) {
  console.log(`🔄 Merging delivery links into ${masterCafes.length} master cafes...`);
  
  const mergedCafes = [];
  
  for (const masterCafe of masterCafes) {
    stats.masterCafesProcessed++;
    
    // Create a copy of the master cafe object
    const mergedCafe = { ...masterCafe };
    
    // Look up delivery link for this cafe
    const placeId = masterCafe.placeId;
    if (placeId && deliveryLookupMap.has(placeId)) {
      const gofoodUrl = deliveryLookupMap.get(placeId);
      mergedCafe.gofoodUrl = gofoodUrl;
      stats.cafesWithDeliveryLinksAdded++;
      
      console.log(`   ✅ Added delivery link for: ${masterCafe.name || 'Unknown'}`);
    } else {
      stats.cafesWithoutDeliveryLinks++;
      // Don't add gofoodUrl property if not found (as requested)
    }
    
    mergedCafes.push(mergedCafe);
    
    // Log progress for every 10 cafes
    if (stats.masterCafesProcessed % 10 === 0) {
      console.log(`   Processed ${stats.masterCafesProcessed} master cafes...`);
    }
  }
  
  return mergedCafes;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting mergeDeliveryLinks.js');
  console.log(`📂 Master cafe data: ${MASTER_JSON_PATH}`);
  console.log(`📄 Delivery workfile: ${WORKFILE_JSON_PATH}`);
  console.log(`📤 Output file: ${OUTPUT_JSON_PATH}`);
  
  try {
    // Check if both input files exist
    try {
      await fs.access(MASTER_JSON_PATH);
      await fs.access(WORKFILE_JSON_PATH);
    } catch (error) {
      console.error(`❌ Error: One or more input files do not exist`);
      console.error(`   Master file: ${MASTER_JSON_PATH}`);
      console.error(`   Workfile: ${WORKFILE_JSON_PATH}`);
      console.error('Please ensure both files exist before running this script.');
      process.exit(1);
    }
    
    // Read the master cafe JSON file
    console.log('\n📖 Reading master cafe data...');
    const masterData = await fs.readFile(MASTER_JSON_PATH, 'utf8');
    
    let masterCafes;
    try {
      masterCafes = JSON.parse(masterData);
    } catch (parseError) {
      console.error(`❌ Error: Invalid JSON in master file: ${parseError.message}`);
      process.exit(1);
    }
    
    if (!Array.isArray(masterCafes)) {
      console.error('❌ Error: Master JSON does not contain an array of cafes');
      process.exit(1);
    }
    
    console.log(`   ✅ Successfully loaded ${masterCafes.length} cafes from master file`);
    
    // Read the delivery workfile JSON
    console.log('\n📖 Reading delivery workfile...');
    const workfileData = await fs.readFile(WORKFILE_JSON_PATH, 'utf8');
    
    let workfileEntries;
    try {
      workfileEntries = JSON.parse(workfileData);
    } catch (parseError) {
      console.error(`❌ Error: Invalid JSON in workfile: ${parseError.message}`);
      process.exit(1);
    }
    
    if (!Array.isArray(workfileEntries)) {
      console.error('❌ Error: Workfile JSON does not contain an array of entries');
      process.exit(1);
    }
    
    console.log(`   ✅ Successfully loaded ${workfileEntries.length} entries from workfile`);
    
    // Create delivery lookup map
    console.log('\n🗂️ Creating delivery lookup map...');
    const deliveryLookupMap = createDeliveryLookupMap(workfileEntries);
    
    // Merge delivery links into master data
    console.log('\n🔗 Merging delivery links with master cafe data...');
    const mergedCafes = mergeCafesWithDeliveryLinks(masterCafes, deliveryLookupMap);
    
    // Write the merged JSON
    console.log('\n💾 Writing merged cafe data...');
    const outputJsonString = JSON.stringify(mergedCafes, null, 2);
    await fs.writeFile(OUTPUT_JSON_PATH, outputJsonString, 'utf8');
    
    console.log(`   ✅ Successfully wrote merged data to: ${OUTPUT_JSON_PATH}`);
    
    // Print processing summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 MERGE SUMMARY');
    console.log('='.repeat(50));
    console.log(`Master cafes processed: ${stats.masterCafesProcessed}`);
    console.log(`Workfile entries loaded: ${stats.workfileEntriesLoaded}`);
    console.log(`Valid delivery links found in workfile: ${stats.validDeliveryLinksFound}`);
    console.log(`Cafes with delivery links added: ${stats.cafesWithDeliveryLinksAdded}`);
    console.log(`Cafes without delivery links: ${stats.cafesWithoutDeliveryLinks}`);
    console.log(`Total cafes in output: ${mergedCafes.length}`);
    
    const coveragePercentage = stats.masterCafesProcessed > 0 
      ? ((stats.cafesWithDeliveryLinksAdded / stats.masterCafesProcessed) * 100).toFixed(1)
      : 0;
    console.log(`Delivery link coverage: ${coveragePercentage}%`);
    
    console.log('\n📋 Next Steps:');
    console.log('1. Review the merged data in: cafes_with_delivery_links.json');
    console.log('2. Verify that delivery links were merged correctly');
    console.log('3. Consider renaming this file to cafes.json if it should become the new master');
    console.log('4. Deploy the updated data to your application');
    
    console.log('\n✅ Delivery links merge completed successfully!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main, createDeliveryLookupMap, mergeCafesWithDeliveryLinks }; 