#!/usr/bin/env node

/**
 * downloadStaticMapsFromS3.js
 * 
 * This script downloads existing static map images from AWS S3 to corresponding
 * local cafe image folders if they are missing locally.
 * 
 * It reads cafe data from cafes.json, checks if each cafe's static map image
 * exists in S3, and downloads it if it's not already present locally.
 */

const fs = require('fs/promises');
const path = require('path');
const { S3Client, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const appConfig = require('../src/utils/appConfig');

// Configuration
const BUCKET_NAME = 'baliciaga-database';
const AWS_REGION = 'ap-southeast-1';
const S3_IMAGE_PREFIX = 'image/';
const LOCAL_BASE_DIR = path.resolve(__dirname, '../../cafe_images');
const STATIC_MAP_FORMAT = 'png';
const CAFES_JSON_PATH = path.join(__dirname, 'cafes.json');

// Statistics
const stats = {
  totalCafes: 0,
  mapsDownloaded: 0,
  mapsAlreadyLocal: 0,
  mapsNotFoundOnS3: 0,
  errors: 0,
  unknownCafes: 0
};

/**
 * Sanitizes a cafe name for use in folder/file paths
 */
function sanitizeFolderName(name) {
  if (!name || typeof name !== 'string') {
    return 'unknown-cafe';
  }
  let sanitized = name.toLowerCase();
  sanitized = sanitized.replace(/\s+/g, '-');
  sanitized = sanitized.replace(/[^a-z0-9-]/g, '');
  sanitized = sanitized.replace(/-+/g, '-');
  sanitized = sanitized.substring(0, 50);
  if (sanitized === '' || sanitized === '-') {
    return 'unknown-cafe';
  }
  return sanitized;
}

/**
 * Checks if an object exists in S3
 */
async function checkS3ObjectExists(objectKey, s3Client) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Downloads an object from S3 and saves it to a local file
 */
async function downloadS3ObjectToFile(objectKey, localFilePath, s3Client) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey
    });
    
    const response = await s3Client.send(command);
    
    // Create a buffer from the stream
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    
    // Write the buffer to the local file
    await fs.writeFile(localFilePath, fileBuffer);
    console.log(`✅ Downloaded: ${objectKey} -> ${localFilePath}`);
    stats.mapsDownloaded++;
    return true;
  } catch (error) {
    console.error(`❌ Error downloading ${objectKey}:`, error.message);
    stats.errors++;
    return false;
  }
}

/**
 * Ensures a directory exists, creating it if necessary
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Checks if a file exists locally
 */
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Processes a single cafe
 */
async function processCafe(cafe, s3Client) {
  stats.totalCafes++;
  
  // Skip cafes without placeId
  if (!cafe.placeId) {
    console.warn(`⚠️ Skipping cafe without placeId: ${cafe.name || 'Unknown'}`);
    stats.errors++;
    return;
  }
  
  // Generate sanitized name for folder path
  const sanitizedNamePart = sanitizeFolderName(cafe.name);
  
  // Handle unknown cafe case
  if (sanitizedNamePart === 'unknown-cafe') {
    console.warn(`⚠️ Skipping cafe with problematic name: "${cafe.name}" (placeId: ${cafe.placeId})`);
    stats.unknownCafes++;
    return;
  }
  
  console.log(`\n🔍 Processing: ${cafe.name} (placeId: ${cafe.placeId})`);
  
  // Construct the S3 object key and local file path
  const folderName = `${sanitizedNamePart}_${cafe.placeId}`;
  const fileName = `${sanitizedNamePart}_static.${STATIC_MAP_FORMAT}`;
  const s3ObjectKey = `${S3_IMAGE_PREFIX}${folderName}/${fileName}`;
  const localCafeDir = path.join(LOCAL_BASE_DIR, folderName);
  const localFilePath = path.join(localCafeDir, fileName);
  
  try {
    // Check if the static map exists on S3
    const existsOnS3 = await checkS3ObjectExists(s3ObjectKey, s3Client);
    
    if (!existsOnS3) {
      console.warn(`⚠️ Static map not found on S3: ${s3ObjectKey}`);
      stats.mapsNotFoundOnS3++;
      return;
    }
    
    // Check if the file already exists locally
    const existsLocally = await checkFileExists(localFilePath);
    
    if (existsLocally) {
      console.log(`ℹ️ Static map already exists locally: ${localFilePath}`);
      stats.mapsAlreadyLocal++;
      return;
    }
    
    // Ensure the local directory exists
    await ensureDirectoryExists(localCafeDir);
    
    // Download the static map from S3
    await downloadS3ObjectToFile(s3ObjectKey, localFilePath, s3Client);
    
  } catch (error) {
    console.error(`❌ Error processing cafe ${cafe.name} (${cafe.placeId}):`, error.message);
    stats.errors++;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting downloadStaticMapsFromS3.js');
  
  try {
    // Load configuration asynchronously
    const config = await appConfig.getConfig();
    
    // Initialize S3 client with credentials from config
    const s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        sessionToken: config.AWS_SESSION_TOKEN
      }
    });
    
    // Ensure the base directory exists
    await ensureDirectoryExists(LOCAL_BASE_DIR);
    
    // Read the cafes.json file
    const cafesData = await fs.readFile(CAFES_JSON_PATH, 'utf8');
    const cafes = JSON.parse(cafesData);
    
    console.log(`📊 Found ${cafes.length} cafes in cafes.json`);
    
    // Process each cafe
    for (const cafe of cafes) {
      await processCafe(cafe, s3Client);
    }
    
    // Print statistics
    console.log('\n📊 Summary:');
    console.log(`Total cafes processed: ${stats.totalCafes}`);
    console.log(`Static maps downloaded: ${stats.mapsDownloaded}`);
    console.log(`Static maps already local: ${stats.mapsAlreadyLocal}`);
    console.log(`Static maps not found on S3: ${stats.mapsNotFoundOnS3}`);
    console.log(`Unknown cafes skipped: ${stats.unknownCafes}`);
    console.log(`Errors encountered: ${stats.errors}`);
    
    console.log('\n✅ Download script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 