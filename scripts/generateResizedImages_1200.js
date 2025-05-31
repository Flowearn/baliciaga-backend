const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// Configuration
const SCRIPT_DIR = __dirname;
const BACKEND_DIR = path.dirname(SCRIPT_DIR);
const PROJECT_ROOT = path.dirname(BACKEND_DIR);
const INPUT_IMAGE_DIR = path.join(PROJECT_ROOT, 'photo_webp');
const OUTPUT_BASE_DIR = path.join(PROJECT_ROOT, 'photo_webp_resized');
const OUTPUT_DIR_1200 = path.join(OUTPUT_BASE_DIR, '1200');
const TARGET_SIZE = 1200;

console.log('🖼️  Baliciaga Image Resizer - 1200x1200 Generator');
console.log('================================================');
console.log(`📁 Input directory: ${INPUT_IMAGE_DIR}`);
console.log(`📁 Output directory: ${OUTPUT_DIR_1200}`);
console.log(`📏 Target size: ${TARGET_SIZE}x${TARGET_SIZE} pixels`);
console.log('');
console.log('⚠️  RECOMMENDATION: Clear the output directory before running this script');
console.log(`   Command: rm -rf "${OUTPUT_DIR_1200}" && mkdir -p "${OUTPUT_DIR_1200}"`);
console.log('');

/**
 * Recursively get all image files from a directory
 * @param {string} dir - Directory to scan
 * @param {string[]} fileList - Accumulator for file paths
 * @returns {Promise<string[]>} Array of file paths
 */
async function getAllImageFilesRecursive(dir, fileList = []) {
  try {
    const files = await fs.readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      
      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        await getAllImageFilesRecursive(filePath, fileList);
      } else if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        // Process ALL WebP files (including static map images)
        if (ext === '.webp') {
          fileList.push(filePath);
        }
      }
    }
    
    return fileList;
  } catch (error) {
    console.error(`❌ Error scanning directory ${dir}:`, error.message);
    return fileList;
  }
}

/**
 * Create directory recursively if it doesn't exist
 * @param {string} dirPath - Directory path to create
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Process an image: either resize it or copy static maps as-is
 * @param {string} sourceImagePath - Path to source image
 * @param {string} outputImagePath - Path for output image
 */
async function processImage(sourceImagePath, outputImagePath) {
  try {
    const fileName = path.basename(sourceImagePath);
    
    // Check if this is a static map image
    if (fileName.endsWith('_static.webp')) {
      // Ensure output directory exists
      await ensureDirectoryExists(path.dirname(outputImagePath));
      
      // Copy static map as-is
      await fs.copyFile(sourceImagePath, outputImagePath);
      
      console.log(`📋 COPIED (static map): ${path.relative(INPUT_IMAGE_DIR, sourceImagePath)} -> as-is`);
      return 'static_copied';
    }
    
    // For regular images, get metadata and check size
    const metadata = await sharp(sourceImagePath).metadata();
    const sourceWidth = metadata.width;
    const sourceHeight = metadata.height;
    
    // Ensure output directory exists
    await ensureDirectoryExists(path.dirname(outputImagePath));
    
    // Check if source image is large enough for resizing
    if (!sourceWidth || sourceWidth < TARGET_SIZE) {
      // Copy small image as-is
      await fs.copyFile(sourceImagePath, outputImagePath);
      console.log(`📋 COPIED (source too small): ${path.relative(INPUT_IMAGE_DIR, sourceImagePath)} - Source: ${sourceWidth}x${sourceHeight}, Target: ${TARGET_SIZE}x${TARGET_SIZE}`);
      return 'small_copied';
    }
    
    // Generate resized image with lossless WebP compression
    await sharp(sourceImagePath)
      .resize(TARGET_SIZE, TARGET_SIZE, {
        fit: 'cover',
        position: 'center'
      })
      .webp({
        lossless: true,
        quality: 100
      })
      .toFile(outputImagePath);
    
    console.log(`✅ RESIZED: ${path.relative(INPUT_IMAGE_DIR, sourceImagePath)} -> ${TARGET_SIZE}x${TARGET_SIZE}`);
    return 'resized';
    
  } catch (error) {
    console.error(`❌ ERROR processing ${sourceImagePath}:`, error.message);
    return 'error';
  }
}

/**
 * Main processing function
 */
async function main() {
  const startTime = Date.now();
  let resizedCount = 0;
  let smallCopiedCount = 0;
  let staticCopiedCount = 0;
  let errorCount = 0;
  
  try {
    // Check if input directory exists
    try {
      await fs.access(INPUT_IMAGE_DIR);
    } catch (error) {
      console.error(`❌ Input directory does not exist: ${INPUT_IMAGE_DIR}`);
      process.exit(1);
    }
    
    // Ensure output base directory exists
    await ensureDirectoryExists(OUTPUT_BASE_DIR);
    await ensureDirectoryExists(OUTPUT_DIR_1200);
    
    console.log('🔍 Scanning for WebP images (including static maps)...');
    
    // Get all image files recursively
    const imageFiles = await getAllImageFilesRecursive(INPUT_IMAGE_DIR);
    
    if (imageFiles.length === 0) {
      console.log('⚠️  No WebP images found in input directory');
      return;
    }
    
    // Count static maps for reporting
    const staticMapCount = imageFiles.filter(filePath => path.basename(filePath).endsWith('_static.webp')).length;
    const regularImageCount = imageFiles.length - staticMapCount;
    
    console.log(`📊 Found ${imageFiles.length} WebP images to process:`);
    console.log(`   - ${regularImageCount} regular images`);
    console.log(`   - ${staticMapCount} static map images`);
    console.log('🚀 Starting processing...');
    console.log('');
    
    // Process each image
    for (let i = 0; i < imageFiles.length; i++) {
      const sourceImagePath = imageFiles[i];
      
      // Calculate relative path from input directory
      const relativePath = path.relative(INPUT_IMAGE_DIR, sourceImagePath);
      const outputImagePath = path.join(OUTPUT_DIR_1200, relativePath);
      
      console.log(`[${i + 1}/${imageFiles.length}] Processing: ${relativePath}`);
      
      const result = await processImage(sourceImagePath, outputImagePath);
      
      switch (result) {
        case 'resized':
          resizedCount++;
          break;
        case 'small_copied':
          smallCopiedCount++;
          break;
        case 'static_copied':
          staticCopiedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
  
  // Final statistics
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  const totalProcessed = resizedCount + smallCopiedCount + staticCopiedCount + errorCount;
  
  console.log('');
  console.log('📊 FINAL STATISTICS');
  console.log('==================');
  console.log(`⏱️  Total processing time: ${duration} seconds`);
  console.log(`📁 Total images processed: ${totalProcessed}`);
  console.log(`🔧 Resized to 1200x1200: ${resizedCount} images`);
  console.log(`📋 Copied as-is (too small): ${smallCopiedCount} images`);
  console.log(`🗺️  Copied as-is (static maps): ${staticCopiedCount} images`);
  console.log(`❌ Errors: ${errorCount} images`);
  console.log('');
  
  if (resizedCount > 0) {
    console.log(`🎉 Resized images are saved in: ${OUTPUT_DIR_1200}`);
  }
  
  if (smallCopiedCount > 0) {
    console.log(`ℹ️  ${smallCopiedCount} images were copied as-is because their source size was smaller than ${TARGET_SIZE}x${TARGET_SIZE} pixels`);
  }
  
  if (staticCopiedCount > 0) {
    console.log(`🗺️  ${staticCopiedCount} static map images were copied as-is to maintain original quality`);
  }
  
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} images encountered errors during processing`);
  }
  
  console.log('');
  console.log('🏁 Script completed!');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
} 