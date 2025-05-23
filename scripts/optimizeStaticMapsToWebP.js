/**
 * optimizeStaticMapsToWebP.js
 * 
 * This script processes static map PNG images from local directory,
 * optimizes them using sharp (resizing and converting to WebP),
 * uploads them to S3, and updates the cafe data with the new WebP URLs.
 * 
 * Prerequisites:
 * - sharp package installed: npm install sharp
 * - AWS credentials configured in .env or available through environment variables
 * 
 * Usage: node optimizeStaticMapsToWebP.js
 */

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const appConfig = require('../src/utils/appConfig');

// Configuration constants
const LOCAL_CAFE_IMAGES_BASE_DIR = path.resolve(__dirname, '../../cafe_images');
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_UPLOAD_PATH_PREFIX = 'image-v2/';
const S3_PUBLIC_URL_BASE = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com/`;
const STATIC_MAP_ORIGINAL_FORMAT_SUFFIX = '_static.png';
const STATIC_MAP_OUTPUT_FORMAT_SUFFIX = '_static.webp';
const TARGET_IMAGE_WIDTH = 430;
const INPUT_JSON_PATH = path.join(__dirname, 'cafes.json');
const OUTPUT_JSON_PATH = path.join(__dirname, 'cafes_with_webp_static_maps.json');

// Sanitizes a cafe name to create a valid folder name
function sanitizeFolderName(name) {
  if (!name || typeof name !== 'string') {
    return 'unknown-cafe';
  }
  let sanitized = name.toLowerCase();
  sanitized = sanitized.replace(/\s+/g, '-'); // Replace spaces with hyphens
  sanitized = sanitized.replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric (allowing hyphens)
  sanitized = sanitized.replace(/-+/g, '-'); // Replace multiple hyphens with single
  sanitized = sanitized.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  sanitized = sanitized.substring(0, 50); // Limit length

  if (sanitized === '' || sanitized === '-') {
    return 'unknown-cafe';
  }
  return sanitized;
}

// Main function
async function main() {
  console.log('Starting static map optimization process...');
  
  try {
    // Load configuration for AWS credentials
    const config = await appConfig.getConfig();
    
    // Initialize S3 client
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Read the input JSON file
    console.log(`Reading cafe data from ${INPUT_JSON_PATH}...`);
    const data = await fs.readFile(INPUT_JSON_PATH, 'utf8');
    const cafes = JSON.parse(data);
    console.log(`Found ${cafes.length} cafes in the input file.`);

    // Statistics tracking
    const stats = {
      totalCafes: cafes.length,
      processedSuccessfully: 0,
      skippedMissingSourceFile: 0,
      skippedProcessingError: 0,
      skippedUploadError: 0,
      skippedUnknownName: 0,
      totalErrors: 0
    };
    
    // Process each cafe
    const updatedCafes = await Promise.all(cafes.map(async (cafe, index) => {
      const cafeNum = index + 1;
      console.log(`\nProcessing cafe ${cafeNum}/${cafes.length}: ${cafe.name} (${cafe.placeId})`);
      
      try {
        // Sanitize cafe name
        const sanitizedNamePart = sanitizeFolderName(cafe.name);
        if (sanitizedNamePart === 'unknown-cafe') {
          console.warn(`Warning: Cafe has no valid name, skipping optimization.`);
          stats.skippedUnknownName++;
          return cafe; // Return unchanged cafe object
        }
        
        // Construct local source PNG path
        const localPngPath = `${LOCAL_CAFE_IMAGES_BASE_DIR}/${sanitizedNamePart}_${cafe.placeId}/${sanitizedNamePart}${STATIC_MAP_ORIGINAL_FORMAT_SUFFIX}`;
        
        // Check if local PNG file exists
        try {
          await fs.access(localPngPath);
          console.log(`Found local PNG: ${localPngPath}`);
        } catch (error) {
          console.warn(`Warning: Local PNG file not found at ${localPngPath}, skipping optimization.`);
          stats.skippedMissingSourceFile++;
          return cafe; // Return unchanged cafe object
        }
        
        // Read local PNG file
        console.log('Reading local PNG file...');
        const localPngBuffer = await fs.readFile(localPngPath);
        
        // Process with sharp: resize and convert to WebP
        console.log(`Processing image: converting to lossless WebP...`);
        try {
          const processedWebPBuffer = await sharp(localPngBuffer)
            .webp({ lossless: true })              // Convert to lossless WebP, maintaining original dimensions
            .toBuffer();
          
          // Determine S3 object key for the WebP image
          const s3ObjectKey = `${S3_UPLOAD_PATH_PREFIX}${sanitizedNamePart}_${cafe.placeId}/${sanitizedNamePart}${STATIC_MAP_OUTPUT_FORMAT_SUFFIX}`;
          
          // Upload WebP to S3
          console.log(`Uploading WebP to S3: ${s3ObjectKey}`);
          try {
            await s3Client.send(new PutObjectCommand({
              Bucket: S3_BUCKET_NAME,
              Key: s3ObjectKey,
              Body: processedWebPBuffer,
              ContentType: 'image/webp'
            }));
            
            // Construct the new S3 URL
            const newWebpUrl = `${S3_PUBLIC_URL_BASE}${s3ObjectKey}`;
            console.log(`Successfully uploaded. New WebP URL: ${newWebpUrl}`);
            
            // Update cafe object with new WebP URL
            stats.processedSuccessfully++;
            return {
              ...cafe,
              staticMapS3Url: newWebpUrl
            };
          } catch (uploadError) {
            console.error(`Error uploading to S3: ${uploadError.message}`);
            stats.skippedUploadError++;
            stats.totalErrors++;
            return cafe; // Return unchanged cafe object
          }
        } catch (processingError) {
          console.error(`Error processing image with sharp: ${processingError.message}`);
          stats.skippedProcessingError++;
          stats.totalErrors++;
          return cafe; // Return unchanged cafe object
        }
      } catch (error) {
        console.error(`Unexpected error processing cafe ${cafe.name || 'unknown'}: ${error.message}`);
        stats.totalErrors++;
        return cafe; // Return unchanged cafe object
      }
    }));
    
    // Write updated cafes to output file
    console.log(`\nWriting updated cafe data to ${OUTPUT_JSON_PATH}...`);
    await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(updatedCafes, null, 2), 'utf8');
    
    // Print summary statistics
    console.log('\n=== Processing Complete ===');
    console.log(`Total cafes: ${stats.totalCafes}`);
    console.log(`Successfully processed: ${stats.processedSuccessfully}`);
    console.log(`Skipped - missing source PNG: ${stats.skippedMissingSourceFile}`);
    console.log(`Skipped - processing error: ${stats.skippedProcessingError}`);
    console.log(`Skipped - upload error: ${stats.skippedUploadError}`);
    console.log(`Skipped - unknown cafe name: ${stats.skippedUnknownName}`);
    console.log(`Total errors: ${stats.totalErrors}`);
    console.log('=========================');
    
    console.log(`\nOptimized static maps have been saved to: ${OUTPUT_JSON_PATH}`);
    
  } catch (error) {
    console.error(`Critical error in main process: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 