/**
 * Test script to verify finding processed names from the cafe_images directory
 */

const fs = require('fs/promises');
const path = require('path');

const CAFE_IMAGES_DIR = path.resolve(__dirname, '../../cafe_images');
const INPUT_FILE = path.resolve(__dirname, 'cafes_map.json');

async function findProcessedNameFromImageDir(placeId) {
  try {
    // Read all subdirectories in cafe_images directory
    const dirs = await fs.readdir(CAFE_IMAGES_DIR);
    
    // Find the directory that ends with _placeId
    const matchingDir = dirs.find(dir => {
      const parts = dir.split('_');
      const dirPlaceId = parts[parts.length - 1]; 
      return dirPlaceId === placeId;
    });
    
    if (!matchingDir) {
      return null;
    }
    
    // Extract the processed name from the directory name
    const processedName = matchingDir.substring(0, matchingDir.length - placeId.length - 1);
    return { processedName, fullDirName: matchingDir };
  } catch (error) {
    console.error(`Error finding processed name for placeId ${placeId}:`, error.message);
    return null;
  }
}

async function main() {
  try {
    // Read the input file
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const cafes = JSON.parse(data);
    
    console.log(`Testing processed name lookup for ${cafes.length} cafes:`);
    console.log('----------------------------------------');
    
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < cafes.length; i++) {
      const cafe = cafes[i];
      const cafeName = cafe.name || 'Unknown';
      const placeId = cafe.placeId;
      
      if (!placeId) {
        console.log(`${i+1}. ${cafeName}: No placeId found`);
        failureCount++;
        continue;
      }
      
      const result = await findProcessedNameFromImageDir(placeId);
      
      if (result) {
        console.log(`${i+1}. ${cafeName} (${placeId}): FOUND - "${result.processedName}" (${result.fullDirName})`);
        successCount++;
      } else {
        console.log(`${i+1}. ${cafeName} (${placeId}): NOT FOUND`);
        failureCount++;
      }
    }
    
    console.log('----------------------------------------');
    console.log(`Results: ${successCount} matches found, ${failureCount} not found.`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error); 