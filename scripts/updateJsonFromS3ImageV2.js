#!/usr/bin/env node

/**
 * updateJsonFromS3ImageV2.js
 * 
 * This script scans S3 for images in a specified path (e.g., 'image-v2/') 
 * corresponding to each cafe in the master cafes.json file, and updates 
 * the JSON with the S3 URLs of these images, separating user photos from 
 * the static map image.
 * 
 * It reads the master cafes.json file, processes each cafe object, and
 * writes the updated array to a new JSON file.
 */

const fs = require('fs/promises');
const path = require('path');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const appConfig = require('../src/utils/appConfig');

// S3 Configuration Constants
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const NEW_S3_IMAGE_PATH_PREFIX = 'image-v2/';
const S3_PUBLIC_URL_BASE = 'https://baliciaga-database.s3.ap-southeast-1.amazonaws.com/';
const STATIC_MAP_FILENAME_SUFFIX = '_static.png';

// File paths
const CAFES_JSON_PATH = path.join(__dirname, 'cafes.json');
const OUTPUT_JSON_PATH = path.join(__dirname, 'cafes_updated_with_new_s3_paths.json');

// Statistics
const stats = {
  totalCafes: 0,
  cafesUpdated: 0,
  totalImagesProcessed: 0,
  staticMapsFound: 0,
  errors: 0,
  unknownCafes: 0,
  systemFilesSkipped: 0
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
 * Extracts filename from an S3 object key
 */
function extractFilenameFromS3Key(s3Key) {
  const parts = s3Key.split('/');
  return parts[parts.length - 1];
}

/**
 * Checks if a filename is a system file that should be ignored
 */
function isSystemFile(filename) {
  if (!filename) return false;
  
  const systemFiles = [
    '.ds_store',      // macOS
    'thumbs.db',      // Windows
    'desktop.ini',    // Windows
    '.directory',     // KDE
    '._.ds_store',    // macOS alternate
    '.localized',     // macOS
    'icon\r'          // macOS custom icon
  ];
  
  return systemFiles.includes(filename.toLowerCase());
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
    return cafe; // Return original cafe object unchanged
  }
  
  // Generate sanitized name for folder path
  const sanitizedNamePart = sanitizeFolderName(cafe.name);
  
  // Handle unknown cafe case
  if (sanitizedNamePart === 'unknown-cafe') {
    console.warn(`⚠️ Skipping cafe with problematic name: "${cafe.name}" (placeId: ${cafe.placeId})`);
    stats.unknownCafes++;
    return cafe; // Return original cafe object unchanged
  }
  
  // Construct the S3 prefix for this cafe
  const cafeS3Prefix = `${NEW_S3_IMAGE_PATH_PREFIX}${sanitizedNamePart}_${cafe.placeId}/`;
  
  console.log(`\n🔍 Processing: ${cafe.name} (placeId: ${cafe.placeId})`);
  console.log(`   S3 Path: ${cafeS3Prefix}`);
  
  try {
    // Extract original ordered filenames from cafe.photos (if exists)
    let originalOrderedFilenames = [];
    if (Array.isArray(cafe.photos)) {
      originalOrderedFilenames = cafe.photos.map(oldUrl => {
        if (typeof oldUrl === 'string' && oldUrl.trim() !== '') {
          return extractFilenameFromS3Key(oldUrl);
        }
        return null;
      }).filter(filename => filename !== null);
      
      console.log(`   📸 Original photos: ${originalOrderedFilenames.length}`);
    }
    
    // List all objects under the cafe's S3 prefix
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET_NAME,
      Prefix: cafeS3Prefix
    });
    
    const response = await s3Client.send(command);
    const objects = response.Contents || [];
    
    console.log(`   Found ${objects.length} objects in S3 path`);
    
    // Initialize collections for S3 objects
    let newStaticMapS3Url = '';
    const s3UserPhotos = []; // Temporary store for user photos with filenames
    
    // Process each S3 object
    for (const obj of objects) {
      const s3ObjectKey = obj.Key;
      const filename = extractFilenameFromS3Key(s3ObjectKey);
      
      // Skip system files
      if (isSystemFile(filename)) {
        console.log(`   ℹ️ Skipping system file on S3: ${filename}`);
        stats.systemFilesSkipped++;
        continue; // Skip to the next S3 object
      }
      
      const fullS3Url = `${S3_PUBLIC_URL_BASE}${s3ObjectKey}`;
      
      stats.totalImagesProcessed++;
      
      // Check if this is a static map image
      if (filename === `${sanitizedNamePart}${STATIC_MAP_FILENAME_SUFFIX}`) {
        newStaticMapS3Url = fullS3Url;
        stats.staticMapsFound++;
        console.log(`   📍 Found static map: ${filename}`);
      } else {
        // It's a user photo, add to temporary collection
        s3UserPhotos.push({ filename, s3Url: fullS3Url });
      }
    }
    
    // Build final photos array prioritizing original order
    const newPhotosArray = [];
    
    // Track which S3 photos we've already added to preserve order
    const processedS3Photos = new Set();
    
    // First, add photos in original order (if they exist in S3)
    for (const originalFilename of originalOrderedFilenames) {
      const matchingPhoto = s3UserPhotos.find(p => p.filename === originalFilename);
      if (matchingPhoto) {
        newPhotosArray.push(matchingPhoto.s3Url);
        processedS3Photos.add(matchingPhoto.filename);
        console.log(`   ✓ Preserved original photo order: ${originalFilename}`);
      }
    }
    
    // Then add any new photos not in the original list
    const newPhotos = s3UserPhotos
      .filter(p => !processedS3Photos.has(p.filename))
      .sort((a, b) => a.filename.localeCompare(b.filename));
    
    if (newPhotos.length > 0) {
      console.log(`   ➕ Appending ${newPhotos.length} new photos to the end`);
      for (const photo of newPhotos) {
        newPhotosArray.push(photo.s3Url);
      }
    }
    
    // Create an updated cafe object
    const updatedCafe = {
      ...cafe,
      photos: newPhotosArray,
      staticMapS3Url: newStaticMapS3Url || null
    };
    
    // Check if updates were actually made
    const wasUpdated = 
      JSON.stringify(updatedCafe.photos) !== JSON.stringify(cafe.photos) || 
      updatedCafe.staticMapS3Url !== cafe.staticMapS3Url;
    
    if (wasUpdated) {
      stats.cafesUpdated++;
      console.log(`   ✅ Updated cafe with ${newPhotosArray.length} photos and ${newStaticMapS3Url ? 'a' : 'no'} static map`);
    } else {
      console.log(`   ℹ️ No changes for this cafe`);
    }
    
    return updatedCafe;
    
  } catch (error) {
    console.error(`❌ Error processing cafe ${cafe.name} (${cafe.placeId}):`, error.message);
    stats.errors++;
    return cafe; // Return original cafe object unchanged
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`🚀 Starting updateJsonFromS3ImageV2.js`);
  console.log(`   Using S3 image path prefix: ${NEW_S3_IMAGE_PATH_PREFIX}`);
  
  try {
    // Load configuration asynchronously
    const config = await appConfig.getConfig();
    
    // Initialize S3 client with credentials from config
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        sessionToken: config.AWS_SESSION_TOKEN
      }
    });
    
    // Read the cafes.json file
    console.log(`📂 Reading cafes from: ${CAFES_JSON_PATH}`);
    const cafesData = await fs.readFile(CAFES_JSON_PATH, 'utf8');
    const cafes = JSON.parse(cafesData);
    
    console.log(`📊 Found ${cafes.length} cafes in cafes.json`);
    
    // Process each cafe and collect updated results
    const updatedCafes = [];
    for (const cafe of cafes) {
      const updatedCafe = await processCafe(cafe, s3Client);
      updatedCafes.push(updatedCafe);
    }
    
    // Write the updated cafes to the output file
    console.log(`\n💾 Writing updated cafes to: ${OUTPUT_JSON_PATH}`);
    await fs.writeFile(
      OUTPUT_JSON_PATH, 
      JSON.stringify(updatedCafes, null, 2), 
      'utf8'
    );
    
    // Print statistics
    console.log('\n📊 Summary:');
    console.log(`Total cafes processed: ${stats.totalCafes}`);
    console.log(`Cafes updated with new image links: ${stats.cafesUpdated}`);
    console.log(`Total images processed: ${stats.totalImagesProcessed}`);
    console.log(`Static maps found: ${stats.staticMapsFound}`);
    console.log(`System files skipped: ${stats.systemFilesSkipped}`);
    console.log(`Unknown cafes skipped: ${stats.unknownCafes}`);
    console.log(`Errors encountered: ${stats.errors}`);
    
    console.log('\n✅ Update script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 