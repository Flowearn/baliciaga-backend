const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getConfig } = require('../src/utils/appConfig');

// Configuration Constants
const LOCAL_NEW_BAR_PHOTO_BASE_DIR = path.resolve(__dirname, '../../bars_batch2');
const MASTER_JSON_BLUEPRINT_PATH = path.join(__dirname, 'bars-dev.json');
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_BAR_IMAGE_UPLOAD_PREFIX = 'bar-image-dev/';
const CLOUDFRONT_BASE_URL = 'https://d2cmxnft4myi1k.cloudfront.net/';
const OUTPUT_JSON_FILENAME = 'bars-batch2.json';

// Statistics tracking
let stats = {
  totalBarsProcessed: 0,
  totalImagesUploaded: 0,
  totalErrors: 0,
  errors: []
};

/**
 * Sanitize folder name to create a safe S3 path component
 * @param {string} folderName - Original folder name
 * @returns {string} Sanitized name suitable for S3 paths
 */
function sanitizeFolderName(folderName) {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Upload a single image file to S3 and return CloudFront URL
 * @param {S3Client} s3Client - Configured S3 client
 * @param {string} localFilePath - Path to local image file
 * @param {string} s3Key - S3 object key for the upload
 * @returns {Promise<string>} CloudFront URL of uploaded image
 */
async function uploadImageToS3(s3Client, localFilePath, s3Key) {
  try {
    const fileBuffer = await fs.readFile(localFilePath);
    
    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/webp'
      // Note: ACL removed because bucket has ACLs disabled ("Bucket owner enforced")
    });
    
    await s3Client.send(putCommand);
    const cloudFrontUrl = `${CLOUDFRONT_BASE_URL}${s3Key}`;
    
    console.log(`    ✅ Uploaded: ${path.basename(localFilePath)} -> ${s3Key}`);
    return cloudFrontUrl;
  } catch (error) {
    console.error(`    ❌ Failed to upload ${path.basename(localFilePath)}:`, error.message);
    throw error;
  }
}

/**
 * Read blueprint JSON file to extract all field keys
 * @param {string} blueprintPath - Path to the blueprint JSON file
 * @returns {Promise<string[]>} Array of all field keys
 */
async function getAllFieldKeysFromBlueprint(blueprintPath) {
  try {
    const blueprintContent = await fs.readFile(blueprintPath, 'utf-8');
    const blueprintData = JSON.parse(blueprintContent);
    
    if (!Array.isArray(blueprintData) || blueprintData.length === 0) {
      throw new Error('Blueprint JSON must be a non-empty array');
    }
    
    // Get all keys from the first cafe object
    const sampleCafe = blueprintData[0];
    const allKeys = Object.keys(sampleCafe);
    
    // Add the 'table' field for bars
    if (!allKeys.includes('table')) {
      allKeys.push('table');
    }
    
    console.log(`📋 Extracted ${allKeys.length} field keys from blueprint:`, allKeys.join(', '));
    return allKeys;
  } catch (error) {
    console.error(`❌ Error reading blueprint file ${blueprintPath}:`, error.message);
    throw error;
  }
}

/**
 * Create a skeleton bar object with all required fields
 * @param {string[]} allFieldKeys - Array of all field keys from blueprint
 * @param {string} originalBarName - Original bar folder name
 * @param {string[]} photoUrls - Array of CloudFront photo URLs
 * @returns {Object} Skeleton bar object
 */
function createSkeletonBarObject(allFieldKeys, originalBarName, photoUrls) {
  const skeletonObject = {};
  
  for (const key of allFieldKeys) {
    switch (key) {
      case 'name':
        skeletonObject[key] = originalBarName;
        break;
      case 'photos':
        skeletonObject[key] = photoUrls || [];
        break;
      case 'placeId':
        // Generate a unique placeholder ID
        skeletonObject[key] = `bar_${sanitizeFolderName(originalBarName)}_${Date.now()}`;
        break;
      case 'latitude':
      case 'longitude':
      case 'rating':
        skeletonObject[key] = 0;
        break;
      case 'userRatingsTotal':
      case 'priceLevel':
        skeletonObject[key] = 0;
        break;
      case 'isOpenNow':
        skeletonObject[key] = null;
        break;
      case 'allowsDogs':
      case 'outdoorSeating':
      case 'servesVegetarianFood':
        skeletonObject[key] = false;
        break;
      case 'types':
      case 'openingHours':
        skeletonObject[key] = [];
        break;
      case 'address':
      case 'website':
      case 'phoneNumber':
      case 'instagramUrl':
      case 'gofoodUrl':
      case 'region':
      case 'businessStatus':
      case 'staticMapS3Url':
      case 'table':
        skeletonObject[key] = '';
        break;
      default:
        // Default to empty string for unknown fields
        skeletonObject[key] = '';
        break;
    }
  }
  
  return skeletonObject;
}

/**
 * Process a single bar folder - upload images and create bar object
 * @param {S3Client} s3Client - Configured S3 client
 * @param {string[]} allFieldKeys - Array of all field keys from blueprint
 * @param {string} originalBarFolderName - Original bar folder name
 * @returns {Promise<Object|null>} Bar object or null if failed
 */
async function processBarFolder(s3Client, allFieldKeys, originalBarFolderName) {
  try {
    console.log(`\n🍺 Processing bar: "${originalBarFolderName}"`);
    
    const sanitizedNamePart = sanitizeFolderName(originalBarFolderName);
    const currentLocalBarImageDir = path.join(LOCAL_NEW_BAR_PHOTO_BASE_DIR, originalBarFolderName);
    
    console.log(`  📁 Local directory: ${currentLocalBarImageDir}`);
    console.log(`  🏷️  Sanitized name: ${sanitizedNamePart}`);
    
    // Check if directory exists
    try {
      await fs.access(currentLocalBarImageDir);
    } catch (error) {
      throw new Error(`Directory does not exist: ${currentLocalBarImageDir}`);
    }
    
    // Scan for .webp files
    const dirEntries = await fs.readdir(currentLocalBarImageDir, { withFileTypes: true });
    const webpFiles = dirEntries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.webp'))
      .map(entry => entry.name)
      .sort(); // Sort alphabetically
    
    console.log(`  📸 Found ${webpFiles.length} WebP files: ${webpFiles.join(', ')}`);
    
    if (webpFiles.length === 0) {
      console.log(`  ⚠️  No WebP files found in ${originalBarFolderName}, creating bar with empty photos`);
    }
    
    // Upload images to S3 and collect CloudFront URLs
    const barPhotoCloudFrontUrls = [];
    for (const webpFileName of webpFiles) {
      try {
        const localFilePath = path.join(currentLocalBarImageDir, webpFileName);
        const s3Key = `${S3_BAR_IMAGE_UPLOAD_PREFIX}${sanitizedNamePart}/${webpFileName}`;
        const cloudFrontUrl = await uploadImageToS3(s3Client, localFilePath, s3Key);
        barPhotoCloudFrontUrls.push(cloudFrontUrl);
        stats.totalImagesUploaded++;
      } catch (error) {
        console.error(`    ❌ Failed to upload ${webpFileName}:`, error.message);
        stats.totalErrors++;
        stats.errors.push({ bar: originalBarFolderName, file: webpFileName, error: error.message });
      }
    }
    
    // Create skeleton bar object
    const newBarObject = createSkeletonBarObject(allFieldKeys, originalBarFolderName, barPhotoCloudFrontUrls);
    
    console.log(`  ✅ Successfully processed "${originalBarFolderName}" with ${barPhotoCloudFrontUrls.length} images`);
    stats.totalBarsProcessed++;
    
    return newBarObject;
  } catch (error) {
    console.error(`  ❌ Error processing bar "${originalBarFolderName}":`, error.message);
    stats.totalErrors++;
    stats.errors.push({ bar: originalBarFolderName, error: error.message });
    return null;
  }
}

/**
 * Main script execution
 */
async function main() {
  console.log('🍺 Bar Upload and JSON Generation Script Started');
  console.log('===============================================');
  console.log(`Local bar photos directory: ${LOCAL_NEW_BAR_PHOTO_BASE_DIR}`);
  console.log(`Blueprint JSON path: ${MASTER_JSON_BLUEPRINT_PATH}`);
  console.log(`S3 bucket: ${S3_BUCKET_NAME}`);
  console.log(`S3 upload prefix: ${S3_BAR_IMAGE_UPLOAD_PREFIX}`);
  console.log(`CloudFront base URL: ${CLOUDFRONT_BASE_URL}`);
  console.log(`Output JSON: ${OUTPUT_JSON_FILENAME}`);
  console.log('');
  
  try {
    // Load configuration and initialize S3 client
    console.log('🔧 Loading configuration...');
    const config = await getConfig();
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        ...(config.AWS_SESSION_TOKEN && { sessionToken: config.AWS_SESSION_TOKEN })
      }
    });
    console.log('✅ S3 client initialized');
    
    // Read blueprint JSON to get field keys
    console.log('\n📋 Reading blueprint JSON...');
    const allFieldKeys = await getAllFieldKeysFromBlueprint(MASTER_JSON_BLUEPRINT_PATH);
    
    // Check if local directory exists
    try {
      await fs.access(LOCAL_NEW_BAR_PHOTO_BASE_DIR);
    } catch (error) {
      console.error(`❌ Local bar photos directory does not exist: ${LOCAL_NEW_BAR_PHOTO_BASE_DIR}`);
      console.error('Please ensure the directory exists and try again.');
      process.exit(1);
    }
    
    // Read all bar folder names
    console.log('\n🔍 Scanning for bar folders...');
    const dirEntries = await fs.readdir(LOCAL_NEW_BAR_PHOTO_BASE_DIR, { withFileTypes: true });
    const barFolderNames = dirEntries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    if (barFolderNames.length === 0) {
      console.log('📭 No bar folders found in the specified directory.');
      console.log(`Searched in: ${LOCAL_NEW_BAR_PHOTO_BASE_DIR}`);
      return;
    }
    
    console.log(`📂 Found ${barFolderNames.length} bar folder(s): ${barFolderNames.join(', ')}`);
    
    // Process each bar folder
    const processedBarsData = [];
    for (const barFolderName of barFolderNames) {
      const barObject = await processBarFolder(s3Client, allFieldKeys, barFolderName);
      if (barObject) {
        processedBarsData.push(barObject);
      }
    }
    
    // Check if any bars were successfully processed
    if (processedBarsData.length === 0) {
      console.log('\n📭 No new bars were processed or no images found to upload.');
      return;
    }
    
    // Save processed data to local JSON file
    console.log('\n💾 Saving data to local JSON file...');
    const outputPath = path.join(__dirname, OUTPUT_JSON_FILENAME);
    await fs.writeFile(outputPath, JSON.stringify(processedBarsData, null, 2), 'utf-8');
    
    console.log(`✅ Successfully saved ${processedBarsData.length} bar(s) to: ${outputPath}`);
    
    // Print final summary
    console.log('\n📊 Processing Summary');
    console.log('===================');
    console.log(`Total bar folders found: ${barFolderNames.length}`);
    console.log(`Successfully processed bars: ${stats.totalBarsProcessed}`);
    console.log(`Total images uploaded: ${stats.totalImagesUploaded}`);
    console.log(`Total errors encountered: ${stats.totalErrors}`);
    
    if (stats.totalErrors > 0) {
      console.log('\n❌ Error Details:');
      stats.errors.forEach((error, index) => {
        if (error.file) {
          console.log(`  ${index + 1}. ${error.bar}/${error.file}: ${error.error}`);
        } else {
          console.log(`  ${index + 1}. ${error.bar}: ${error.error}`);
        }
      });
    }
    
    if (stats.totalBarsProcessed > 0) {
      console.log(`\n🎉 Successfully processed ${stats.totalBarsProcessed} bar(s) and uploaded ${stats.totalImagesUploaded} image(s)!`);
      console.log(`📄 Generated JSON file: ${outputPath}`);
    }
    
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { 
  sanitizeFolderName, 
  uploadImageToS3, 
  getAllFieldKeysFromBlueprint, 
  createSkeletonBarObject, 
  processBarFolder, 
  main 
};