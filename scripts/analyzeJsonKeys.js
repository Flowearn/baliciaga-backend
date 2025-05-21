/**
 * analyzeJsonKeys.js
 * 
 * This script analyzes the cafes_fully_enriched.json file and 
 * lists all unique top-level keys present in the cafe objects.
 * 
 * Usage: node analyzeJsonKeys.js
 */

const fs = require('fs/promises');
const path = require('path');

// Input file path
const INPUT_FILE_PATH = path.resolve(__dirname, 'cafes_fully_enriched.json');

/**
 * Main function to analyze JSON keys
 */
async function analyzeJsonKeys() {
  try {
    console.log(`Analyzing file: ${INPUT_FILE_PATH}`);
    
    // Read and parse the JSON file
    const data = await fs.readFile(INPUT_FILE_PATH, 'utf8');
    const cafes = JSON.parse(data);
    
    // Validate that we have an array
    if (!Array.isArray(cafes)) {
      throw new Error('The JSON file does not contain an array.');
    }
    
    console.log(`Found ${cafes.length} cafe objects in the JSON file.`);
    
    // Set to collect unique keys
    const uniqueKeys = new Set();
    
    // Iterate through all cafe objects
    cafes.forEach((cafe, index) => {
      if (typeof cafe === 'object' && cafe !== null) {
        // Get all keys for this cafe object
        const keys = Object.keys(cafe);
        
        // Add each key to the set of unique keys
        keys.forEach(key => uniqueKeys.add(key));
      } else {
        console.warn(`Warning: Item at index ${index} is not an object and will be skipped.`);
      }
    });
    
    // Convert the set to an array and sort alphabetically
    const uniqueKeysArray = Array.from(uniqueKeys).sort();
    
    // Print results
    console.log(`\nFound ${uniqueKeysArray.length} unique top-level keys:\n`);
    
    // Print each key on a new line
    uniqueKeysArray.forEach(key => {
      console.log(`- ${key}`);
    });
    
    // Also print as a comma-separated list
    console.log(`\nComma-separated list:\n${uniqueKeysArray.join(', ')}`);
    
    // Print as a JSON array
    console.log(`\nJSON array representation:\n${JSON.stringify(uniqueKeysArray, null, 2)}`);
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Error: File not found at ${INPUT_FILE_PATH}`);
    } else if (error instanceof SyntaxError) {
      console.error('Error: Invalid JSON format in the input file.');
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Execute the main function
analyzeJsonKeys().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 