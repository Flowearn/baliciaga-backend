/**
 * syncRestaurantPhotos.js
 * 
 * This script synchronizes restaurant photos based on local files:
 * - Converts them to lossless WebP format (maintaining original dimensions)
 * - Uploads them to S3 under the image-v2/ path
 * - Updates the photos array in the master JSON file (cafes.json)
 * - Preserves the original photo order, appends new photos, and removes links for missing photos
 * - Keeps the staticMapS3Url field unchanged
 * 
 * Prerequisites:
 * - sharp package installed: npm install sharp
 * - AWS credentials configured in .env or available through environment variables
 * - Local cafe_images/{sanitizedNamePart}_{placeId}/ folders with restaurant photos
 * 
 * Usage: node syncRestaurantPhotos.js
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
const STATIC_MAP_FILENAME_PATTERN = /_static\.(png|webp)$/i;
const INPUT_JSON_PATH = path.join(__dirname, 'cafes.json');
const OUTPUT_JSON_PATH = path.join(__dirname, 'cafes_photos_synced.json');

// List of valid image file extensions
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

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

// Extract filename from S3 URL
function extractFilenameFromS3Url(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Extract the last part of the URL (filename)
  const parts = url.split('/');
  return parts[parts.length - 1];
}

// Extract base filename without extension
function getBaseFilename(filename) {
  if (!filename) return null;
  return path.parse(filename).name;
}

// Check if a file is a system file to be ignored
function isSystemFile(filename) {
  return filename.startsWith('.') || filename === 'Thumbs.db';
}

// Check if a file is a static map file
function isStaticMapFile(filename) {
  return STATIC_MAP_FILENAME_PATTERN.test(filename);
}

// Check if a file is a valid image file
function isValidImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return VALID_IMAGE_EXTENSIONS.includes(ext);
}

// Find a matching local file for a given S3 filename
function findMatchingLocalFile(s3Filename, localFiles) {
  if (!s3Filename) return null;
  
  // Get base name without extension
  const s3BaseName = getBaseFilename(s3Filename);
  
  // First try to find exact match
  const exactMatch = localFiles.find(file => file === s3Filename);
  if (exactMatch) return exactMatch;
  
  // Then try to find file with same base name but different extension
  return localFiles.find(file => getBaseFilename(file) === s3BaseName);
}

// Process a single image file: convert to WebP and upload to S3
async function processAndUploadImage(localFilePath, s3ObjectKey, s3Client) {
  try {
    // Read the local file
    const imageBuffer = await fs.readFile(localFilePath);
    
    // Convert to lossless WebP, maintaining original dimensions
    const processedWebPBuffer = await sharp(imageBuffer)
      .webp({ lossless: true })
      .toBuffer();
    
    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3ObjectKey,
      Body: processedWebPBuffer,
      ContentType: 'image/webp'
    }));
    
    // Return the public S3 URL
    return `${S3_PUBLIC_URL_BASE}${s3ObjectKey}`;
  } catch (error) {
    throw new Error(`Failed to process/upload image ${path.basename(localFilePath)}: ${error.message}`);
  }
}

// Main function
async function main() {
  console.log('Starting restaurant photo synchronization process...');
  console.log(`Target S3 path: ${S3_PUBLIC_URL_BASE}${S3_UPLOAD_PATH_PREFIX}`);
  
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
      cafesWithPhotosProcessed: 0,
      totalImagesProcessed: 0,
      totalNewImagesAdded: 0,
      totalImagesFailed: 0,
      cafesMissingLocalFolder: 0
    };
    
    // Process each cafe
    const updatedCafes = await Promise.all(cafes.map(async (cafe, index) => {
      const cafeNum = index + 1;
      console.log(`\n[${cafeNum}/${cafes.length}] Processing cafe: ${cafe.name} (${cafe.placeId})`);
      
      // Sanitize cafe name
      const sanitizedNamePart = sanitizeFolderName(cafe.name);
      if (sanitizedNamePart === 'unknown-cafe') {
        console.warn(`  Warning: Cafe has no valid name, skipping photo processing.`);
        return cafe; // Return unchanged cafe object
      }
      
      // Define the local source image folder for this cafe
      const localCafeImageFolder = `${LOCAL_CAFE_IMAGES_BASE_DIR}/${sanitizedNamePart}_${cafe.placeId}/`;
      
      // Check if the local folder exists
      let localImageFilenames;
      try {
        localImageFilenames = await fs.readdir(localCafeImageFolder);
        console.log(`  Found local folder with ${localImageFilenames.length} files.`);
      } catch (error) {
        console.warn(`  Warning: Local folder not found at ${localCafeImageFolder}, skipping photo processing.`);
        stats.cafesMissingLocalFolder++;
        return cafe; // Return unchanged cafe object
      }
      
      // Extract original photo order from cafe.photos array
      const originalPhotoUrls = Array.isArray(cafe.photos) ? cafe.photos : [];
      console.log(`  Original photo count: ${originalPhotoUrls.length}`);
      
      // Extract filenames from S3 URLs
      const originalOrderedFilenames = originalPhotoUrls
        .map(url => extractFilenameFromS3Url(url))
        .filter(filename => filename !== null);
      
      // Filter local files to only include valid image files, exclude system files and static maps
      const validLocalImageFiles = localImageFilenames.filter(filename => 
        !isSystemFile(filename) && 
        !isStaticMapFile(filename) && 
        isValidImageFile(filename)
      );
      
      console.log(`  Valid local image files: ${validLocalImageFiles.length}`);
      
      // Initialize array for new S3 photo URLs
      const newS3PhotoUrls = [];
      let processedCount = 0;
      let newImagesCount = 0;
      let failedCount = 0;
      
      // Process original ordered filenames first
      for (const originalFilename of originalOrderedFilenames) {
        const matchingLocalFile = findMatchingLocalFile(originalFilename, validLocalImageFiles);
        
        if (matchingLocalFile) {
          try {
            // Construct full local file path
            const localFilePath = path.join(localCafeImageFolder, matchingLocalFile);
            
            // Construct S3 object key with .webp extension
            const s3ObjectKey = `${S3_UPLOAD_PATH_PREFIX}${sanitizedNamePart}_${cafe.placeId}/${getBaseFilename(originalFilename)}.webp`;
            
            console.log(`  Processing ordered image: ${matchingLocalFile} -> ${path.basename(s3ObjectKey)}`);
            
            // Process and upload the image
            const newS3Url = await processAndUploadImage(localFilePath, s3ObjectKey, s3Client);
            
            // Add the new S3 URL to the list
            newS3PhotoUrls.push(newS3Url);
            processedCount++;
            
            console.log(`  ✅ Successfully processed and uploaded: ${path.basename(s3ObjectKey)}`);
          } catch (error) {
            console.error(`  ❌ Error processing file ${matchingLocalFile}: ${error.message}`);
            failedCount++;
          }
        }
      }
      
      // Identify new local photos not in the original list
      const processedBaseNames = originalOrderedFilenames.map(filename => getBaseFilename(filename));
      const newLocalFiles = validLocalImageFiles.filter(filename => 
        !processedBaseNames.includes(getBaseFilename(filename))
      );
      
      // Sort new photos alphabetically
      newLocalFiles.sort();
      
      console.log(`  Found ${newLocalFiles.length} new local photos to process.`);
      
      // Process new local photos
      for (const newFile of newLocalFiles) {
        try {
          // Construct full local file path
          const localFilePath = path.join(localCafeImageFolder, newFile);
          
          // Construct S3 object key with .webp extension
          const s3ObjectKey = `${S3_UPLOAD_PATH_PREFIX}${sanitizedNamePart}_${cafe.placeId}/${getBaseFilename(newFile)}.webp`;
          
          console.log(`  Processing new image: ${newFile} -> ${path.basename(s3ObjectKey)}`);
          
          // Process and upload the image
          const newS3Url = await processAndUploadImage(localFilePath, s3ObjectKey, s3Client);
          
          // Add the new S3 URL to the list
          newS3PhotoUrls.push(newS3Url);
          processedCount++;
          newImagesCount++;
          
          console.log(`  ✅ Successfully processed and uploaded new image: ${path.basename(s3ObjectKey)}`);
        } catch (error) {
          console.error(`  ❌ Error processing new file ${newFile}: ${error.message}`);
          failedCount++;
        }
      }
      
      // Update statistics
      if (processedCount > 0) {
        stats.cafesWithPhotosProcessed++;
        stats.totalImagesProcessed += processedCount;
        stats.totalNewImagesAdded += newImagesCount;
        stats.totalImagesFailed += failedCount;
      }
      
      console.log(`  Summary for ${cafe.name}: Processed ${processedCount} photos (${newImagesCount} new), Failed: ${failedCount}`);
      
      // Create updated cafe object with new photos array, preserving all other properties
      return {
        ...cafe,
        photos: newS3PhotoUrls
      };
    }));
    
    // Write updated cafes to output file
    console.log(`\nWriting updated cafe data to ${OUTPUT_JSON_PATH}...`);
    await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(updatedCafes, null, 2), 'utf8');
    
    // Print summary statistics
    console.log('\n=== Processing Complete ===');
    console.log(`Total cafes: ${stats.totalCafes}`);
    console.log(`Cafes with photos processed: ${stats.cafesWithPhotosProcessed}`);
    console.log(`Total images processed: ${stats.totalImagesProcessed}`);
    console.log(`New images added: ${stats.totalNewImagesAdded}`);
    console.log(`Failed images: ${stats.totalImagesFailed}`);
    console.log(`Cafes missing local folder: ${stats.cafesMissingLocalFolder}`);
    console.log('=========================');
    
    console.log(`\nSynchronized cafe photos have been saved to: ${OUTPUT_JSON_PATH}`);
    
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