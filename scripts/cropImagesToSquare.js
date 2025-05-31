const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// Configuration Constants
const INPUT_IMAGE_DIR = path.resolve(__dirname, '../../photo_webp');
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];

// Statistics tracking
let stats = {
  totalScanned: 0,
  totalProcessed: 0,
  totalSkippedStaticMaps: 0,
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
        // Skip files ending with _static.webp
        if (entry.name.endsWith('_static.webp')) {
          console.log(`  ➡️  Skipping static map: ${entry.name}`);
          stats.totalSkippedStaticMaps++;
          continue; 
        }
        
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
 * Crop a single image to a square and overwrite the original, with specific logic for portrait images.
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
    
    let cropLeft, cropTop, cropWidth, cropHeight;

    if (height > width) { // Portrait image (竖向长方形)
      cropWidth = width;    // 使用完整宽度
      cropHeight = width;   // 高度等于宽度，形成正方形
      cropLeft = 0;
      cropTop = height - width; // 从底部向上取景 (height - cropHeight)
      console.log(`  Portrait: ${width}x${height}, Cropping bottom square: ${cropWidth}x${cropHeight} from top: ${cropTop}`);
    } else { // Landscape image (横向长方形)
      cropWidth = height;   // 宽度等于高度，形成正方形
      cropHeight = height;  // 使用完整高度
      cropTop = 0;
      cropLeft = Math.floor((width - height) / 2); // 水平居中裁剪
      console.log(`  Landscape: ${width}x${height}, Cropping centered square: ${cropWidth}x${cropHeight} from left: ${cropLeft}`);
    }
    
    // Create temporary file path with proper extension
    const tempFilePath = imagePath + '.tmp_crop' + fileExt;
    
    // Create sharp instance with crop operation
    let sharpInstance = sharp(imagePath).extract({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
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
        // GIFs will be converted to PNG to preserve animation frames if multi-frame, or first frame if not.
        // Sharp's behavior with animated GIFs in extract can be tricky.
        // For simplicity, this converts to static PNG. If animation needs to be preserved, more complex handling is needed.
        sharpInstance = sharpInstance.png({ compressionLevel: 9, quality: 100 });
        console.log(`  ⚠️  Note: GIF ${fileName} will be converted to PNG after cropping.`);
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
    
    console.log(`  ✅ Success: ${fileName} (New dimensions: ${cropWidth}x${cropHeight})`);
    stats.totalProcessed++;
    
  } catch (error) {
    console.error(`  ❌ Error processing ${fileName}:`, error.message);
    stats.totalErrors++;
    stats.errors.push({ file: fileName, error: error.message });
    
    // Clean up temp file if it exists
    try {
      const tempFilePath = imagePath + '.tmp_crop' + fileExt;
      // Check if temp file exists before unlinking
      if (await fs.stat(tempFilePath).then(() => true).catch(() => false)) {
        await fs.unlink(tempFilePath);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors - file might not exist
    }
  }
}

/**
 * Main script execution
 */
async function main() {
  console.log('🖼️  Image Square Cropping Script Started (with custom portrait crop)');
  console.log('================================================================');
  console.log(`Input directory: ${INPUT_IMAGE_DIR}`);
  console.log(`Valid extensions: ${VALID_IMAGE_EXTENSIONS.join(', ')}`);
  console.log(`Will skip files ending with: _static.webp`);
  console.log(`Portrait images will be cropped from the bottom.`);
  console.log('');
  
  try {
    // Check if input directory exists
    await fs.access(INPUT_IMAGE_DIR);
  } catch (error) {
    console.error(`❌ Input directory does not exist: ${INPUT_IMAGE_DIR}`);
    console.error('Please ensure the directory exists and try again.');
    console.error('Expected location: BALICIAGA/photo_webp/');
    process.exit(1);
  }
  
  // Get all image files recursively
  console.log('🔍 Scanning for image files...');
  // Reset stats in case module is called multiple times
  stats = {
    totalScanned: 0,
    totalProcessed: 0,
    totalSkippedStaticMaps: 0,
    totalErrors: 0,
    errors: []
  };
  
  const imageFiles = await getAllImageFilesRecursive(INPUT_IMAGE_DIR);
  stats.totalScanned = imageFiles.length + stats.totalSkippedStaticMaps;
  
  if (imageFiles.length === 0) {
    if (stats.totalSkippedStaticMaps > 0) {
      console.log(`📭 No processable image files found, but ${stats.totalSkippedStaticMaps} static map(s) were identified and skipped.`);
    } else {
      console.log('📭 No image files found in the specified directory.');
    }
    console.log('Please check the path and ensure there are images with valid extensions (excluding static maps).');
    console.log(`Searched in: ${INPUT_IMAGE_DIR}`);
    return;
  }
  
  console.log(`📋 Found ${imageFiles.length} image file(s) to process (after skipping ${stats.totalSkippedStaticMaps} static map(s))\n`);
  
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
  console.log(`Total files encountered (incl. static maps): ${stats.totalScanned}`);
  console.log(`Static maps skipped: ${stats.totalSkippedStaticMaps}`);
  console.log(`Files attempted for processing: ${imageFiles.length}`);
  console.log(`Successfully processed (cropped or already square): ${stats.totalProcessed}`);
  console.log(`Errors encountered: ${stats.totalErrors}`);
  
  if (stats.totalErrors > 0) {
    console.log('\n❌ Error Details:');
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file}: ${error.error}`);
    });
  }
  
  if (stats.totalProcessed > 0 && imageFiles.length > 0) {
    console.log(`\n✅ Successfully processed ${stats.totalProcessed} images!`);
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