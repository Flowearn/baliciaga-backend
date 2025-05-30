#!/usr/bin/env node

/**
 * preprocessLocalImages.js
 * 
 * This script processes images within subfolders of a specified input directory.
 * For each subfolder (representing a cafe):
 * 1. Renames all image files sequentially (e.g., photo_a.ext, photo_b.ext)
 * 2. Converts these renamed images to lossless WebP format (maintaining original dimensions)
 * 3. Replaces the original files with their WebP versions (e.g., photo_a.webp)
 * 
 * Prerequisites:
 * - sharp package installed: npm install sharp
 * - Input directory contains subfolders named by sanitizedNamePart
 * - Subfolders contain original restaurant photos in JPG, PNG, etc. format
 * 
 * Usage: node preprocessLocalImages.js
 */

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// Configuration Constants
const BASE_INPUT_DIR = path.resolve(__dirname, '../../new_photo/');
const NEW_FILENAME_PREFIX = 'photo_';
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif']; // Case-insensitive, excluding WebP as input
const SYSTEM_FILES = ['.DS_Store', 'Thumbs.db', '.gitignore', '.gitkeep'];

// Statistics tracking
const stats = {
  totalFoldersProcessed: 0,
  totalImagesProcessed: 0,
  totalImagesConverted: 0,
  totalErrors: 0,
  foldersWithErrors: 0,
  emptyFolders: 0
};

/**
 * Checks if a file is a valid image file based on extension
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if valid image file
 */
function isValidImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return VALID_IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Checks if a file is a system file that should be ignored
 * @param {string} filename - The filename to check
 * @returns {boolean} - True if system file
 */
function isSystemFile(filename) {
  return SYSTEM_FILES.includes(filename) || filename.startsWith('.');
}

/**
 * Generates sequential filename using letters (a, b, c, etc.)
 * @param {number} index - The index (0-based)
 * @returns {string} - The letter (a, b, c, etc.)
 */
function generateSequentialLetter(index) {
  if (index < 26) {
    return String.fromCharCode(97 + index); // a-z
  } else {
    // For more than 26 files, use aa, ab, ac, etc.
    const firstLetter = String.fromCharCode(97 + Math.floor(index / 26) - 1);
    const secondLetter = String.fromCharCode(97 + (index % 26));
    return firstLetter + secondLetter;
  }
}

/**
 * Processes a single image file: rename and convert to WebP
 * @param {string} cafeSubFolder - Path to the cafe subfolder
 * @param {string} originalFilename - Original filename
 * @param {number} index - Index for sequential naming
 * @returns {Promise<boolean>} - True if successful
 */
async function processImageFile(cafeSubFolder, originalFilename, index) {
  const originalFilePath = path.join(cafeSubFolder, originalFilename);
  const sequentialLetter = generateSequentialLetter(index);
  const newBaseFilename = `${NEW_FILENAME_PREFIX}${sequentialLetter}`;
  const newWebpFilename = `${newBaseFilename}.webp`;
  const newWebpFilePath = path.join(cafeSubFolder, newWebpFilename);
  
  try {
    console.log(`    Processing: ${originalFilename} -> ${newWebpFilename}`);
    
    // Read the original image file
    const imageBuffer = await fs.readFile(originalFilePath);
    
    // Convert to lossless WebP maintaining original dimensions
    const webpBuffer = await sharp(imageBuffer)
      .webp({ lossless: true })
      .toBuffer();
    
    // Save the WebP file
    await fs.writeFile(newWebpFilePath, webpBuffer);
    
    // Delete the original file after successful conversion
    await fs.unlink(originalFilePath);
    
    console.log(`    ✅ Converted: ${originalFilename} -> ${newWebpFilename}`);
    stats.totalImagesConverted++;
    return true;
    
  } catch (error) {
    console.error(`    ❌ Error processing ${originalFilename}: ${error.message}`);
    stats.totalErrors++;
    return false;
  }
}

/**
 * Processes a single cafe subfolder
 * @param {string} cafeSubFolder - Path to the cafe subfolder
 * @param {string} cafeFolderName - Name of the cafe folder
 * @returns {Promise<void>}
 */
async function processCafeFolder(cafeSubFolder, cafeFolderName) {
  console.log(`\n📁 Processing cafe folder: ${cafeFolderName}`);
  
  try {
    // Read all files in the subfolder
    const allFiles = await fs.readdir(cafeSubFolder);
    
    // Filter for valid image files, excluding system files
    const imageFiles = allFiles.filter(file => {
      if (isSystemFile(file)) {
        console.log(`    ℹ️ Skipping system file: ${file}`);
        return false;
      }
      if (!isValidImageFile(file)) {
        console.log(`    ℹ️ Skipping non-image file: ${file}`);
        return false;
      }
      return true;
    });
    
    if (imageFiles.length === 0) {
      console.log(`    ⚠️ No valid image files found in ${cafeFolderName}`);
      stats.emptyFolders++;
      return;
    }
    
    // Sort image files alphabetically for consistent processing order
    imageFiles.sort();
    
    console.log(`    Found ${imageFiles.length} image files to process`);
    stats.totalImagesProcessed += imageFiles.length;
    
    // Process each image file sequentially
    let folderHasErrors = false;
    for (let i = 0; i < imageFiles.length; i++) {
      const success = await processImageFile(cafeSubFolder, imageFiles[i], i);
      if (!success) {
        folderHasErrors = true;
      }
    }
    
    if (folderHasErrors) {
      stats.foldersWithErrors++;
    }
    
    console.log(`    📊 Folder summary: ${imageFiles.length} files processed`);
    
  } catch (error) {
    console.error(`❌ Error processing folder ${cafeFolderName}: ${error.message}`);
    stats.totalErrors++;
    stats.foldersWithErrors++;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting preprocessLocalImages.js');
  console.log(`📂 Input directory: ${BASE_INPUT_DIR}`);
  console.log(`🏷️ Filename prefix: ${NEW_FILENAME_PREFIX}`);
  console.log(`📸 Valid extensions: ${VALID_IMAGE_EXTENSIONS.join(', ')}`);
  
  try {
    // Check if base input directory exists
    try {
      await fs.access(BASE_INPUT_DIR);
    } catch (error) {
      console.error(`❌ Error: Input directory does not exist: ${BASE_INPUT_DIR}`);
      console.error('Please create the directory and add cafe subfolders with images.');
      process.exit(1);
    }
    
    // Read all entries in the base input directory
    const allEntries = await fs.readdir(BASE_INPUT_DIR, { withFileTypes: true });
    
    // Filter for directories only (cafe subfolders)
    const cafeSubfolders = allEntries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
    
    if (cafeSubfolders.length === 0) {
      console.log('⚠️ No subfolders found in the input directory.');
      console.log('Please add cafe subfolders containing images to process.');
      return;
    }
    
    console.log(`📊 Found ${cafeSubfolders.length} cafe subfolders to process`);
    
    // Process each cafe subfolder
    for (const cafeFolderName of cafeSubfolders) {
      const cafeSubFolder = path.join(BASE_INPUT_DIR, cafeFolderName);
      stats.totalFoldersProcessed++;
      await processCafeFolder(cafeSubFolder, cafeFolderName);
    }
    
    // Print final summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 PROCESSING SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total folders processed: ${stats.totalFoldersProcessed}`);
    console.log(`Total images found: ${stats.totalImagesProcessed}`);
    console.log(`Successfully converted: ${stats.totalImagesConverted}`);
    console.log(`Empty folders: ${stats.emptyFolders}`);
    console.log(`Folders with errors: ${stats.foldersWithErrors}`);
    console.log(`Total errors: ${stats.totalErrors}`);
    
    if (stats.totalErrors === 0) {
      console.log('✅ All images processed successfully!');
    } else {
      console.log(`⚠️ Processing completed with ${stats.totalErrors} errors.`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
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

module.exports = { main }; 