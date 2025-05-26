#!/usr/bin/env node

/**
 * initializeNewCafesWithBasicInfo.js
 * 
 * This script processes new cafe additions from subfolders in a local `new_photo` directory.
 * For each subfolder (containing pre-processed WebP images):
 * 1. Automatically derives a search name from the subfolder name
 * 2. Uses Google Places API searchText to allow user selection of correct placeId and displayName
 * 3. Renames local subfolder to include placeId
 * 4. Uploads WebP images to S3 (image-v2/ path)
 * 5. Constructs skeleton JSON object with basic info and empty defaults
 * 6. Appends to master cafes.json and saves combined data
 * 7. Uploads updated JSON to S3
 * 
 * Prerequisites:
 * - new_photo/ directory with sanitizedNamePart subfolders
 * - Images pre-processed by preprocessLocalImages.js (photo_a.webp, etc.)
 * - AWS credentials and Google Places API key configured
 * - inquirer and @aws-sdk/client-s3 packages installed
 * 
 * Usage: node initializeNewCafesWithBasicInfo.js
 */

const fs = require('fs/promises');
const path = require('path');
const inquirer = require('inquirer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const appConfig = require('../src/utils/appConfig');

// Configuration Constants
const LOCAL_NEW_PHOTO_BASE_DIR = path.resolve(__dirname, '../new_photo/');
const MASTER_JSON_BLUEPRINT_PATH = path.join(__dirname, 'cafes-dev.json');
const OUTPUT_JSON_FILENAME = 'cafes_dev_image_v2_test.json';
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_UPLOAD_IMAGE_PATH_PREFIX = 'image-v2/';
const S3_PUBLIC_URL_BASE = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/`;
const S3_TARGET_DATA_KEY = 'data/cafes_dev_image_v2_test.json';
const DEFAULT_REGION_FALLBACK = 'canggu';

// Statistics tracking
const stats = {
  foldersProcessed: 0,
  foldersSkipped: 0,
  cafesAdded: 0,
  imagesUploaded: 0,
  totalNewCafes: 0
};

/**
 * Sanitize folder name (for consistency checking)
 * @param {string} name - Name to sanitize
 * @returns {string} - Sanitized name
 */
function sanitizeFolderName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Derive search name from folder name
 * @param {string} folderName - Folder name like 'home-cafe-mengwi'
 * @returns {string} - Search-friendly name like 'Home Cafe Mengwi'
 */
function deriveSearchNameFromFolderName(folderName) {
  return folderName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Search for places using Google Places API
 * @param {string} searchQuery - Search query
 * @param {string} area - Optional area for location bias
 * @returns {Promise<Array>} - Array of search results
 */
async function searchTextPlaces(searchQuery, area = '') {
  const config = await appConfig.getConfig();
  const axios = require('axios');
  const apiKey = config.MAPS_API_KEY;
  
  let textQuery = searchQuery;
  if (area && area.trim() !== '') {
    textQuery += ` ${area.trim()}`;
  }
  
  const requestBody = {
    textQuery: textQuery,
    maxResultCount: 10,
    languageCode: "en"
  };
  
  // Add location bias for Bali if area is provided
  if (area && area.trim() !== '') {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: -8.4095,
          longitude: 115.1889
        },
        radius: 50000 // 50km radius around Bali center
      }
    };
  }
  
  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
        }
      }
    );
    
    return response.data.places || [];
  } catch (error) {
    console.error('Error searching places:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Upload file to S3
 * @param {S3Client} s3Client - S3 client instance
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key
 * @param {string} contentType - Content type
 * @returns {Promise<string>} - S3 public URL
 */
async function uploadFileToS3(s3Client, filePath, s3Key, contentType) {
  const fileContent = await fs.readFile(filePath);
  
  const uploadParams = {
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType
  };
  
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `${S3_PUBLIC_URL_BASE}${s3Key}`;
}

/**
 * Create skeleton cafe object based on blueprint structure
 * @param {Object} blueprintCafe - First cafe object from master JSON
 * @param {Object} basicInfo - Basic info (placeId, name, photos, etc.)
 * @returns {Object} - Skeleton cafe object
 */
function createSkeletonCafeObject(blueprintCafe, basicInfo) {
  const skeleton = {};
  
  // Copy all keys from blueprint but set appropriate default values
  for (const [key, value] of Object.entries(blueprintCafe)) {
    if (key === 'placeId') {
      skeleton[key] = basicInfo.placeId;
    } else if (key === 'name') {
      skeleton[key] = basicInfo.name;
    } else if (key === 'photos') {
      skeleton[key] = basicInfo.photos;
    } else if (key === 'instagramUrl') {
      skeleton[key] = basicInfo.instagramUrl || '';
    } else if (key === 'region') {
      skeleton[key] = basicInfo.region;
    } else if (typeof value === 'number') {
      skeleton[key] = 0;
    } else if (typeof value === 'boolean') {
      skeleton[key] = key === 'isOpenNow' ? false : null; // isOpenNow defaults to false, others to null
    } else if (Array.isArray(value)) {
      skeleton[key] = [];
    } else if (typeof value === 'string') {
      skeleton[key] = '';
    } else if (value === null || value === undefined) {
      skeleton[key] = null;
    } else {
      skeleton[key] = null; // For objects and other types
    }
  }
  
  return skeleton;
}

/**
 * Process a single cafe folder
 * @param {S3Client} s3Client - S3 client instance
 * @param {string} folderName - Sanitized folder name
 * @param {Object} blueprintCafe - Blueprint cafe structure
 * @returns {Promise<Object|null>} - New cafe object or null if skipped
 */
async function processCafeFolder(s3Client, folderName, blueprintCafe) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏪 Processing cafe folder: ${folderName}`);
  console.log(`${'='.repeat(60)}`);
  
  stats.foldersProcessed++;
  
  // Derive search name
  const searchableCafeName = deriveSearchNameFromFolderName(folderName);
  console.log(`📝 Auto-generated search name: "${searchableCafeName}"`);
  
  // Confirm search name with user
  const searchConfirm = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `Search for "${searchableCafeName}" from folder "${folderName}"?`,
      choices: [
        { name: 'Yes, use this search name', value: 'yes' },
        { name: 'No, let me enter a different name', value: 'no' },
        { name: 'Skip this folder', value: 'skip' }
      ]
    }
  ]);
  
  if (searchConfirm.action === 'skip') {
    console.log(`⏭️  Skipping folder: ${folderName}`);
    stats.foldersSkipped++;
    return null;
  }
  
  let finalSearchName = searchableCafeName;
  if (searchConfirm.action === 'no') {
    const customName = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchName',
        message: 'Enter the correct search name:',
        validate: input => input.trim().length > 0 || 'Search name cannot be empty'
      }
    ]);
    finalSearchName = customName.searchName.trim();
  }
  
  // Get area information
  const areaPrompt = await inquirer.prompt([
    {
      type: 'input',
      name: 'area',
      message: 'Area in Bali (optional, e.g., "Canggu", "Ubud"):',
      default: ''
    }
  ]);
  
  // Search for places
  console.log(`🔍 Searching for: "${finalSearchName}" in area: "${areaPrompt.area || 'Any'}"`);
  const searchResults = await searchTextPlaces(finalSearchName, areaPrompt.area);
  
  if (searchResults.length === 0) {
    console.log('❌ No search results found. Skipping this folder.');
    stats.foldersSkipped++;
    return null;
  }
  
  // Display search results for user selection
  const choices = searchResults.map((place, index) => ({
    name: `${place.displayName?.text || place.displayName || 'Unknown'} - ${place.formattedAddress || 'No address'}`,
    value: index
  }));
  choices.push({ name: 'None of these / Skip this folder', value: -1 });
  
  const selection = await inquirer.prompt([
    {
      type: 'list',
      name: 'placeIndex',
      message: 'Select the correct place:',
      choices: choices,
      pageSize: 10
    }
  ]);
  
  if (selection.placeIndex === -1) {
    console.log('❌ No place selected. Skipping this folder.');
    stats.foldersSkipped++;
    return null;
  }
  
  const selectedPlace = searchResults[selection.placeIndex];
  const placeId = selectedPlace.id;
  const apiDisplayName = selectedPlace.displayName?.text || selectedPlace.displayName || finalSearchName;
  
  console.log(`✅ Selected: ${apiDisplayName} (${placeId})`);
  
  // Rename folder to include placeId
  const oldFolderPath = path.join(LOCAL_NEW_PHOTO_BASE_DIR, folderName);
  const newFolderName = `${folderName}_${placeId}`;
  const newFolderPath = path.join(LOCAL_NEW_PHOTO_BASE_DIR, newFolderName);
  
  try {
    await fs.rename(oldFolderPath, newFolderPath);
    console.log(`📁 Renamed folder: ${folderName} → ${newFolderName}`);
  } catch (error) {
    console.error(`❌ Error renaming folder: ${error.message}`);
    stats.foldersSkipped++;
    return null;
  }
  
  // Upload WebP images to S3
  console.log('📤 Uploading WebP images to S3...');
  const restaurantPhotoS3Urls = [];
  
  try {
    const files = await fs.readdir(newFolderPath);
    const webpFiles = files.filter(file => file.toLowerCase().endsWith('.webp')).sort();
    
    if (webpFiles.length === 0) {
      console.log('⚠️  No WebP files found in folder');
    } else {
      for (const webpFile of webpFiles) {
        const localFilePath = path.join(newFolderPath, webpFile);
        const s3Key = `${S3_UPLOAD_IMAGE_PATH_PREFIX}${newFolderName}/${webpFile}`;
        
        try {
          const s3Url = await uploadFileToS3(s3Client, localFilePath, s3Key, 'image/webp');
          restaurantPhotoS3Urls.push(s3Url);
          stats.imagesUploaded++;
          console.log(`   ✅ Uploaded: ${webpFile} → ${s3Key}`);
        } catch (uploadError) {
          console.error(`   ❌ Failed to upload ${webpFile}: ${uploadError.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error reading folder contents: ${error.message}`);
  }
  
  // Get Instagram URL
  const instagramPrompt = await inquirer.prompt([
    {
      type: 'input',
      name: 'instagramUrl',
      message: 'Instagram URL (optional):',
      default: ''
    }
  ]);
  
  // Determine region
  const region = areaPrompt.area.toLowerCase().trim() || DEFAULT_REGION_FALLBACK;
  
  // Create skeleton cafe object
  const newCafeObject = createSkeletonCafeObject(blueprintCafe, {
    placeId: placeId,
    name: apiDisplayName,
    photos: restaurantPhotoS3Urls,
    instagramUrl: instagramPrompt.instagramUrl.trim(),
    region: region
  });
  
  console.log(`✅ Created skeleton cafe object for: ${apiDisplayName}`);
  console.log(`   📊 Photos uploaded: ${restaurantPhotoS3Urls.length}`);
  console.log(`   🌍 Region: ${region}`);
  
  stats.cafesAdded++;
  return newCafeObject;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting initializeNewCafesWithBasicInfo.js');
  console.log(`📂 Source directory: ${LOCAL_NEW_PHOTO_BASE_DIR}`);
  console.log(`📄 Blueprint JSON: ${MASTER_JSON_BLUEPRINT_PATH}`);
  console.log(`📤 Output file: ${OUTPUT_JSON_FILENAME}`);
  console.log(`☁️  S3 bucket: ${S3_BUCKET_NAME}`);
  console.log(`🔗 S3 upload path: ${S3_UPLOAD_IMAGE_PATH_PREFIX}`);
  
  try {
    // Initialize S3 client
    console.log('\n🔧 Initializing AWS S3 client...');
    const config = await appConfig.getConfig();
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Check if source directory exists
    try {
      await fs.access(LOCAL_NEW_PHOTO_BASE_DIR);
    } catch (error) {
      console.error(`❌ Source directory does not exist: ${LOCAL_NEW_PHOTO_BASE_DIR}`);
      process.exit(1);
    }
    
    // Read blueprint JSON
    console.log('\n📖 Reading blueprint JSON...');
    let masterCafes;
    try {
      const blueprintData = await fs.readFile(MASTER_JSON_BLUEPRINT_PATH, 'utf8');
      masterCafes = JSON.parse(blueprintData);
      
      if (!Array.isArray(masterCafes) || masterCafes.length === 0) {
        console.error('❌ Blueprint JSON does not contain an array of cafes or is empty');
        process.exit(1);
      }
      
      console.log(`   ✅ Loaded ${masterCafes.length} cafes from blueprint`);
    } catch (error) {
      console.error(`❌ Error reading blueprint JSON: ${error.message}`);
      process.exit(1);
    }
    
    const blueprintCafe = masterCafes[0]; // Use first cafe as structure template
    
    // Get subfolders from new_photo directory
    console.log('\n📁 Scanning for new cafe folders...');
    const entries = await fs.readdir(LOCAL_NEW_PHOTO_BASE_DIR, { withFileTypes: true });
    const subfolders = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith('.')) // Exclude hidden folders
      .sort();
    
    if (subfolders.length === 0) {
      console.log('ℹ️  No subfolders found in new_photo directory');
      process.exit(0);
    }
    
    console.log(`   📊 Found ${subfolders.length} subfolders to process:`);
    subfolders.forEach(folder => console.log(`      - ${folder}`));
    
    // Process each subfolder
    const newlyAddedCafes = [];
    
    for (const folderName of subfolders) {
      const newCafe = await processCafeFolder(s3Client, folderName, blueprintCafe);
      if (newCafe) {
        newlyAddedCafes.push(newCafe);
      }
    }
    
    // Combine with master data
    console.log('\n📝 Combining with master cafe data...');
    const combinedCafes = [...masterCafes, ...newlyAddedCafes];
    stats.totalNewCafes = combinedCafes.length;
    
    // Save combined data locally
    console.log('💾 Saving combined data locally...');
    const outputJsonPath = path.join(__dirname, OUTPUT_JSON_FILENAME);
    const outputJsonString = JSON.stringify(combinedCafes, null, 2);
    await fs.writeFile(outputJsonPath, outputJsonString, 'utf8');
    console.log(`   ✅ Saved to: ${outputJsonPath}`);
    
    // Upload to S3
    console.log('☁️  Uploading combined data to S3...');
    try {
      await uploadFileToS3(s3Client, outputJsonPath, S3_TARGET_DATA_KEY, 'application/json');
      console.log(`   ✅ Uploaded to: s3://${S3_BUCKET_NAME}/${S3_TARGET_DATA_KEY}`);
    } catch (uploadError) {
      console.error(`   ❌ Failed to upload to S3: ${uploadError.message}`);
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 PROCESSING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Folders processed: ${stats.foldersProcessed}`);
    console.log(`Folders skipped: ${stats.foldersSkipped}`);
    console.log(`New cafes added: ${stats.cafesAdded}`);
    console.log(`Images uploaded: ${stats.imagesUploaded}`);
    console.log(`Total cafes in output: ${stats.totalNewCafes}`);
    
    console.log('\n📋 Next Steps:');
    console.log('1. Review the generated data in: ' + OUTPUT_JSON_FILENAME);
    console.log('2. Use enrichment scripts to populate detailed fields (location, opening hours, etc.)');
    console.log('3. Generate static maps for new cafes');
    console.log('4. Deploy the updated data to your application');
    
    console.log('\n✅ New cafe initialization completed successfully!');
    
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

module.exports = { 
  main, 
  sanitizeFolderName, 
  deriveSearchNameFromFolderName, 
  searchTextPlaces,
  createSkeletonCafeObject 
}; 