/**
 * updateRegions.js
 * 
 * This script updates the region value from "pererenan_nearby_test" to "canggu"
 * in the cafes_with_maps_uri.json file.
 * 
 * Usage: node updateRegions.js
 */

const fs = require('fs/promises');
const path = require('path');

// File path configuration
const INPUT_FILE = path.resolve(__dirname, 'cafes_with_maps_uri.json');
const OUTPUT_FILE = path.resolve(__dirname, 'cafes_with_maps_uri.json');

async function main() {
  try {
    // Read the input file
    console.log(`Reading file: ${INPUT_FILE}`);
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const cafes = JSON.parse(data);
    
    if (!Array.isArray(cafes)) {
      throw new Error('Input file does not contain a JSON array');
    }
    
    console.log(`Loaded ${cafes.length} cafes from file`);
    
    // Count cafes with pererenan_nearby_test region
    let updateCount = 0;
    
    // Update regions
    const updatedCafes = cafes.map(cafe => {
      if (cafe.region === 'pererenan_nearby_test') {
        updateCount++;
        return {
          ...cafe,
          region: 'canggu'
        };
      }
      return cafe;
    });
    
    // Write the updated data back to the file
    console.log(`Updating ${updateCount} cafes with region "pererenan_nearby_test" to "canggu"`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(updatedCafes, null, 2), 'utf8');
    
    console.log(`Update complete. ${updateCount} cafes updated.`);
    console.log(`Updated file saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 