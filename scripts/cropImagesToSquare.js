const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// Configuration Constants
const INPUT_IMAGE_DIR = path.resolve(__dirname, '../../new_photo');
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];

// Statistics tracking
let stats = {
  totalScanned: 0,
  totalProcessed: 0,
  totalErrors: 0,
  errors: []
};

/**
 * Recursively scan directory for all image files
 * @param {string} directory - Directory path to scan
 * @returns {Promise<string[]>} Array of full file paths for images
 */
async function getAllImageFilesRecursive(directory) {
  let imageFiles = [];
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subDirImages = await getAllImageFilesRecursive(fullPath);
        imageFiles = imageFiles.concat(subDirImages);
      } else if (entry.isFile()) {
        // Check if file has valid image extension
        const ext = path.extname(entry.name).toLowerCase();
        if (VALID_IMAGE_EXTENSIONS.includes(ext)) {
          imageFiles.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directory}:`, error.message);
  }
  
  return imageFiles;
}

/**
 * Crop a single image to a square and overwrite the original
 * @param {string} imagePath - Path to the image file
 */
async function cropImageToSquare(imagePath) {
  const fileName = path.basename(imagePath);
  const fileExt = path.extname(imagePath);
  
  try {
    console.log(`Processing: ${fileName}`);
    
    // Get image metadata
    const metadata = await sharp(imagePath).metadata();
    const { width, height, format } = metadata;
    
    if (!width || !height) {
      throw new Error(`Could not determine image dimensions for ${fileName}`);
    }
    
    // Check if image is already square
    if (width === height) {
      console.log(`  ℹ️  Already square: ${width}x${height}, skipping ${fileName}`);
      stats.totalProcessed++;
      return;
    }
    
    // Calculate crop parameters for centered square
    const shortestSide = Math.min(width, height);
    const cropLeft = Math.floor((width - shortestSide) / 2);
    const cropTop = Math.floor((height - shortestSide) / 2);
    
    console.log(`  Original: ${width}x${height}, Cropping to: ${shortestSide}x${shortestSide}`);
    
    // Create temporary file path with proper extension
    const tempFilePath = imagePath + '.tmp_crop' + fileExt;
    
    // Create sharp instance with crop operation
    let sharpInstance = sharp(imagePath).extract({
      left: cropLeft,
      top: cropTop,
      width: shortestSide,
      height: shortestSide
    });
    
    // Preserve original format with high quality settings
    switch (format) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality: 95, mozjpeg: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ compressionLevel: 9, quality: 100 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ lossless: true, quality: 100 });
        break;
      case 'gif':
        // For GIF, we'll convert to PNG to maintain quality
        sharpInstance = sharpInstance.png({ compressionLevel: 9, quality: 100 });
        break;
      default:
        // Default to PNG for other formats
        sharpInstance = sharpInstance.png({ compressionLevel: 9, quality: 100 });
        break;
    }
    
    // Save cropped image to temporary file
    await sharpInstance.toFile(tempFilePath);
    
    // Safely replace original with cropped version
    await fs.unlink(imagePath); // Delete original
    await fs.rename(tempFilePath, imagePath); // Rename temp to original
    
    console.log(`  ✅ Success: ${fileName} (New dimensions: ${shortestSide}x${shortestSide})`);
    stats.totalProcessed++;
    
  } catch (error) {
    console.error(`  ❌ Error processing ${fileName}:`, error.message);
    stats.totalErrors++;
    stats.errors.push({ file: fileName, error: error.message });
    
    // Clean up temp file if it exists
    try {
      const tempFilePath = imagePath + '.tmp_crop' + fileExt;
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      // Ignore cleanup errors - file might not exist
    }
  }
}

/**
 * Main script execution
 */
async function main() {
  console.log('🖼️  Image Square Cropping Script Started');
  console.log('=====================================');
  console.log(`Input directory: ${INPUT_IMAGE_DIR}`);
  console.log(`Valid extensions: ${VALID_IMAGE_EXTENSIONS.join(', ')}`);
  console.log('');
  
  try {
    // Check if input directory exists
    await fs.access(INPUT_IMAGE_DIR);
  } catch (error) {
    console.error(`❌ Input directory does not exist: ${INPUT_IMAGE_DIR}`);
    console.error('Please ensure the directory exists and try again.');
    console.error('Expected location: BALICIAGA/new_photo/');
    process.exit(1);
  }
  
  // Get all image files recursively
  console.log('🔍 Scanning for image files...');
  const imageFiles = await getAllImageFilesRecursive(INPUT_IMAGE_DIR);
  stats.totalScanned = imageFiles.length;
  
  if (imageFiles.length === 0) {
    console.log('📭 No image files found in the specified directory.');
    console.log('Please check the path and ensure there are images with valid extensions.');
    console.log(`Searched in: ${INPUT_IMAGE_DIR}`);
    return;
  }
  
  console.log(`📋 Found ${imageFiles.length} image file(s) to process\n`);
  
  // Process each image
  for (let i = 0; i < imageFiles.length; i++) {
    const imagePath = imageFiles[i];
    const relativePath = path.relative(INPUT_IMAGE_DIR, imagePath);
    console.log(`[${i + 1}/${imageFiles.length}] ${relativePath}`);
    await cropImageToSquare(imagePath);
    console.log(''); // Empty line for readability
  }
  
  // Print summary
  console.log('📊 Processing Summary');
  console.log('===================');
  console.log(`Total files scanned: ${stats.totalScanned}`);
  console.log(`Successfully processed: ${stats.totalProcessed}`);
  console.log(`Errors encountered: ${stats.totalErrors}`);
  
  if (stats.totalErrors > 0) {
    console.log('\n❌ Error Details:');
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file}: ${error.error}`);
    });
  }
  
  if (stats.totalProcessed > 0) {
    console.log(`\n✅ Successfully cropped ${stats.totalProcessed} images to squares!`);
  }
  
  console.log('\n🎉 Script completed!');
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

module.exports = { getAllImageFilesRecursive, cropImageToSquare, main }; 