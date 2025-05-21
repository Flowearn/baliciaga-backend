/**
 * syncGoogleMapsUri.js
 * 
 * This script synchronizes/merges googleMapsUri values from a source JSON file 
 * into a master cafe data JSON file, preserving all existing data and order.
 * 
 * Usage: 
 *   node syncGoogleMapsUri.js [sourceFile] [masterFile] [outputFile]
 * 
 * Arguments:
 *   sourceFile - Path to the source JSON file with googleMapsUri values (default: canggu_cafe_with_maps_uri.json)
 *   masterFile - Path to the master JSON file to be updated (default: cafes.json)
 *   outputFile - Path to save the updated JSON file (default: cafes_with_maps_uri.json)
 */

const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');

// Parse command-line arguments or use defaults
const args = process.argv.slice(2);
const SOURCE_FILE = path.resolve(__dirname, args[0] || 'canggu_cafe_with_maps_uri.json');
const MASTER_FILE = path.resolve(__dirname, args[1] || 'cafes.json');
const OUTPUT_FILE = path.resolve(__dirname, args[2] || 'cafes_with_maps_uri.json');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompts the user for confirmation
 * @param {string} question - The question to ask
 * @returns {Promise<boolean>} - User's response (true for yes, false for no)
 */
function confirm(question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Checks if a file exists
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether the file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {string} fileType - Type of file (for error messages)
 * @returns {Promise<Array>} - Parsed JSON array
 */
async function validateJsonFile(filePath, fileType) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      throw new Error(`${fileType} is not a JSON array.`);
    }
    
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${fileType} not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${fileType}: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Main function to synchronize googleMapsUri values
 */
async function main() {
  console.log('Starting Google Maps URI synchronization process...');
  
  try {
    // Verify files exist
    if (!(await fileExists(SOURCE_FILE))) {
      throw new Error(`Source file not found: ${SOURCE_FILE}`);
    }
    
    if (!(await fileExists(MASTER_FILE))) {
      throw new Error(`Master file not found: ${MASTER_FILE}`);
    }
    
    // Check if output file exists and confirm overwrite
    if (await fileExists(OUTPUT_FILE)) {
      const shouldOverwrite = await confirm(`Output file already exists: ${OUTPUT_FILE}\nDo you want to overwrite it?`);
      if (!shouldOverwrite) {
        console.log('Operation cancelled by user.');
        process.exit(0);
      }
    }
    
    // Read and validate both JSON files
    console.log(`Reading source file: ${SOURCE_FILE}`);
    const sourceCafes = await validateJsonFile(SOURCE_FILE, 'Source file');
    
    console.log(`Reading master file: ${MASTER_FILE}`);
    const masterCafes = await validateJsonFile(MASTER_FILE, 'Master file');
    
    console.log(`Loaded ${sourceCafes.length} cafes from source file and ${masterCafes.length} cafes from master file.`);
    
    // Create a lookup map from source file
    const uriMap = {};
    let validSourceEntries = 0;
    
    sourceCafes.forEach((cafe, index) => {
      if (!cafe.placeId) {
        console.warn(`WARNING: Cafe at index ${index} in source file has no placeId and will be skipped.`);
        return;
      }
      
      if (!cafe.googleMapsUri) {
        console.warn(`WARNING: Cafe with placeId ${cafe.placeId} in source file has no googleMapsUri and will be skipped.`);
        return;
      }
      
      uriMap[cafe.placeId] = cafe.googleMapsUri;
      validSourceEntries++;
    });
    
    console.log(`Created lookup map with ${validSourceEntries} googleMapsUri entries.`);
    
    // Process each cafe in the master file
    let updatedCount = 0;
    let unchangedCount = 0;
    let missingCount = 0;
    
    const updatedMasterCafes = masterCafes.map((cafe, index) => {
      // Skip cafes without placeId
      if (!cafe.placeId) {
        console.warn(`WARNING: Cafe at index ${index} in master file has no placeId and will be skipped: ${cafe.name || 'Unknown'}`);
        unchangedCount++;
        return cafe;
      }
      
      // Look up the googleMapsUri for this cafe
      const uri = uriMap[cafe.placeId];
      
      if (uri) {
        // If the cafe already has the same URI, don't count it as updated
        if (cafe.googleMapsUri === uri) {
          console.log(`INFO: Cafe ${cafe.name || cafe.placeId} already has the correct googleMapsUri.`);
          unchangedCount++;
          return cafe;
        }
        
        // Update the cafe with the googleMapsUri
        updatedCount++;
        return {
          ...cafe,
          googleMapsUri: uri
        };
      } else {
        // No googleMapsUri found for this cafe
        console.warn(`WARNING: No googleMapsUri found in source file for placeId: ${cafe.placeId} (${cafe.name || 'Unknown'})`);
        missingCount++;
        return cafe;
      }
    });
    
    // Write the updated master file to the output file
    console.log(`Writing updated data to: ${OUTPUT_FILE}`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(updatedMasterCafes, null, 2), 'utf8');
    
    // Log summary
    console.log('\nSynchronization complete!');
    console.log(`Processed ${masterCafes.length} cafes from master file.`);
    console.log(`Updated ${updatedCount} cafes with new googleMapsUri values.`);
    console.log(`${unchangedCount} cafes were unchanged (either had correct URI already or no placeId).`);
    console.log(`${missingCount} cafes had no matching googleMapsUri in the source file.`);
    console.log(`Output saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('Error during synchronization process:', error.message);
    process.exit(1);
  } finally {
    // Always close the readline interface
    rl.close();
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  rl.close();
  process.exit(1);
}); 