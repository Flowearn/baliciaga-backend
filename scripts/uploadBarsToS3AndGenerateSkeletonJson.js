const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getConfig } = require('../src/utils/appConfig');

// Configuration Constants
const LOCAL_NEW_BAR_PHOTO_BASE_DIR = path.resolve(__dirname, '../../dinner');
const LOCAL_PROCESSED_PHOTO_OUTPUT_DIR = path.resolve(__dirname, '../../processed-dinner');
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_BAR_IMAGE_UPLOAD_PREFIX = 'dining-image-dev/';
const CLOUDFRONT_BASE_URL = 'https://d2cmxnft4myi1k.cloudfront.net/';
const OUTPUT_JSON_FILENAME = 'dining-ske.json';

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
 * Process image: crop to square, resize to 1200x1200, convert to lossless WebP
 * @param {string} inputImagePath - Path to original image file
 * @returns {Promise<Buffer>} Processed WebP image buffer
 */
async function processImageToWebP(inputImagePath) {
  try {
    console.log(`    🔄 Processing image: ${path.basename(inputImagePath)}`);
    
    // Read the image and get metadata
    const image = sharp(inputImagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    console.log(`      📐 Original dimensions: ${width}x${height}`);
    
    // Determine crop parameters for square crop
    let left, top, size;
    
    if (width > height) {
      // 横向图片：居中裁切
      size = height;
      left = Math.round((width - height) / 2);
      top = 0;
      console.log(`      ✂️  Horizontal crop: center extraction (${left}, ${top}, ${size}x${size})`);
    } else if (height > width) {
      // 纵向图片：底部裁切  
      size = width;
      left = 0;
      top = height - width; // 从底部开始裁切
      console.log(`      ✂️  Vertical crop: bottom extraction (${left}, ${top}, ${size}x${size})`);
    } else {
      // 已经是正方形
      size = width;
      left = 0;
      top = 0;
      console.log(`      ✂️  Already square: no crop needed`);
    }
    
    // Execute the complete processing pipeline
    const processedBuffer = await image
      .extract({ left, top, width: size, height: size }) // 1. 裁切成正方形
      .resize(1200, 1200, { withoutEnlargement: true }) // 2. 缩小到1200x1200，不放大小图
      .webp({ lossless: true, quality: 100 }) // 3. 转换为高质量无损WebP
      .toBuffer();
    
    console.log(`      ✅ Processing complete: ${processedBuffer.length} bytes`);
    return processedBuffer;
    
  } catch (error) {
    console.error(`    ❌ Failed to process image ${path.basename(inputImagePath)}:`, error.message);
    throw error;
  }
}

/**
 * Upload processed image buffer to S3 and return CloudFront URL
 * @param {S3Client} s3Client - Configured S3 client
 * @param {Buffer} imageBuffer - Processed image buffer
 * @param {string} s3Key - S3 object key for the upload
 * @param {string} originalFileName - Original file name for logging
 * @returns {Promise<string>} CloudFront URL of uploaded image
 */
async function uploadImageBufferToS3(s3Client, imageBuffer, s3Key, originalFileName) {
  try {
    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/webp'
      // Note: ACL removed because bucket has ACLs disabled ("Bucket owner enforced")
    });
    
    await s3Client.send(putCommand);
    const cloudFrontUrl = `${CLOUDFRONT_BASE_URL}${s3Key}`;
    
    console.log(`    ✅ Uploaded: ${originalFileName} -> ${s3Key}`);
    return cloudFrontUrl;
  } catch (error) {
    console.error(`    ❌ Failed to upload ${originalFileName}:`, error.message);
    throw error;
  }
}



/**
 * Create initial bar data object with only essential fields
 * @param {string} originalBarName - Original bar folder name
 * @param {string[]} photoUrls - Array of CloudFront photo URLs
 * @returns {Object} Simple bar object with name and photos only
 */
function createInitialDataObject(originalBarName, photoUrls) {
  return {
    name: originalBarName,
    photos: photoUrls || []
  };
}

/**
 * Process a single bar folder - process original images and create bar object
 * @param {S3Client} s3Client - Configured S3 client
 * @param {string} originalBarFolderName - Original bar folder name
 * @returns {Promise<Object|null>} Bar object or null if failed
 */
async function processBarFolder(s3Client, originalBarFolderName) {
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
    
    // Scan for original image files (.jpg, .jpeg, .png)
    const dirEntries = await fs.readdir(currentLocalBarImageDir, { withFileTypes: true });
    const originalImageFiles = dirEntries
      .filter(entry => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        return ['.jpg', '.jpeg', '.png'].includes(ext);
      })
      .map(entry => entry.name)
      .sort(); // Sort alphabetically for consistent naming
    
    console.log(`  📸 Found ${originalImageFiles.length} original image files: ${originalImageFiles.join(', ')}`);
    
    if (originalImageFiles.length === 0) {
      console.log(`  ⚠️  No original image files found in ${originalBarFolderName}, creating bar with empty photos`);
    }
    
    // Process images and upload to S3 with sequential naming
    const barPhotoCloudFrontUrls = [];
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    
    for (let i = 0; i < originalImageFiles.length; i++) {
      const originalFileName = originalImageFiles[i];
      const photoLetter = alphabet[i % alphabet.length]; // a, b, c, etc.
      const newWebPFileName = `photo_${photoLetter}.webp`;
      
      try {
        console.log(`  🔄 Processing image ${i + 1}/${originalImageFiles.length}: ${originalFileName}`);
        
        // Step 1: Process original image to WebP
        const localFilePath = path.join(currentLocalBarImageDir, originalFileName);
        const processedImageBuffer = await processImageToWebP(localFilePath);
        
        // Step 2: Save processed image to local output directory
        const localProcessedDir = path.join(LOCAL_PROCESSED_PHOTO_OUTPUT_DIR, sanitizedNamePart);
        await fs.mkdir(localProcessedDir, { recursive: true });
        const localProcessedPath = path.join(localProcessedDir, newWebPFileName);
        await fs.writeFile(localProcessedPath, processedImageBuffer);
        console.log(`    💾 Saved to local: ${localProcessedPath}`);
        
        // Step 3: Upload processed buffer to S3
        const s3Key = `${S3_BAR_IMAGE_UPLOAD_PREFIX}${sanitizedNamePart}/${newWebPFileName}`;
        const cloudFrontUrl = await uploadImageBufferToS3(s3Client, processedImageBuffer, s3Key, `${originalFileName} -> ${newWebPFileName}`);
        
        // Step 4: Collect CDN URL
        barPhotoCloudFrontUrls.push(cloudFrontUrl);
        stats.totalImagesUploaded++;
        
        console.log(`    ✅ Successfully processed: ${originalFileName} -> ${newWebPFileName}`);
        
      } catch (error) {
        console.error(`    ❌ Failed to process ${originalFileName}:`, error.message);
        stats.totalErrors++;
        stats.errors.push({ bar: originalBarFolderName, file: originalFileName, error: error.message });
      }
    }
    
    // Create initial bar object with collected CDN URLs
    const newBarObject = createInitialDataObject(originalBarFolderName, barPhotoCloudFrontUrls);
    
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
  console.log(`Local processed photos output: ${LOCAL_PROCESSED_PHOTO_OUTPUT_DIR}`);
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
    
    // Create local processed photos output directory if it doesn't exist
    console.log('\n📁 Ensuring processed photos output directory exists...');
    await fs.mkdir(LOCAL_PROCESSED_PHOTO_OUTPUT_DIR, { recursive: true });
    console.log(`✅ Output directory ready: ${LOCAL_PROCESSED_PHOTO_OUTPUT_DIR}`);
    
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
      const barObject = await processBarFolder(s3Client, barFolderName);
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
  processImageToWebP,
  uploadImageBufferToS3, 
  createInitialDataObject, 
  processBarFolder, 
  main 
};