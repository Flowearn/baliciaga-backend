/**
 * addBusinessStatus.js
 * 
 * This script processes a JSON file containing cafe data and adds/updates
 * the businessStatus field for each cafe by fetching it from the Google Places API.
 * 
 * Usage: node addBusinessStatus.js
 */

const fs = require('fs/promises');
const path = require('path');
const { getPlaceDetails } = require('../src/api/placesApiService');

// Configure input and output file paths
const INPUT_FILE = path.resolve(__dirname, 'cafes_map.json');
const OUTPUT_FILE = path.resolve(__dirname, 'cafes_map_with_status.json');

// Small delay between API calls to avoid rate limiting
const API_CALL_DELAY_MS = 150;

/**
 * Sleep function to add delay between API calls
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} - Promise that resolves after specified time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a single cafe by fetching its businessStatus
 * @param {Object} cafe - Cafe object to process
 * @param {number} index - Current index in the array
 * @param {number} total - Total cafes to process
 * @returns {Promise<Object>} - Updated cafe object with businessStatus
 */
async function processCafe(cafe, index, total) {
  // Skip cafes without placeId
  if (!cafe.placeId) {
    console.warn(`WARNING: Cafe at index ${index} has no placeId and will be skipped: ${cafe.name || 'Unknown'}`);
    return cafe;
  }

  const cafeName = cafe.name || cafe.displayName || cafe.placeId;
  console.log(`Processing cafe ${index + 1}/${total}: ${cafeName} (${cafe.placeId})`);

  try {
    // Fetch place details from Google Places API
    const placeDetails = await getPlaceDetails(cafe.placeId);
    
    // Check if businessStatus was returned
    if (placeDetails && placeDetails.businessStatus) {
      // Create a new object with all existing properties plus the businessStatus
      return {
        ...cafe,
        businessStatus: placeDetails.businessStatus
      };
    } else {
      console.warn(`WARNING: No businessStatus returned for cafe: ${cafeName} (${cafe.placeId})`);
      return cafe;
    }
  } catch (error) {
    console.error(`ERROR: Failed to fetch details for cafe: ${cafeName} (${cafe.placeId})`);
    console.error(`Error details: ${error.message}`);
    return cafe;
  }
}

/**
 * Main function to process all cafes in the input file
 */
async function main() {
  console.log(`Starting business status update process...`);
  
  try {
    // Read the input file
    console.log(`Reading cafe data from ${INPUT_FILE}...`);
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const cafes = JSON.parse(data);
    
    if (!Array.isArray(cafes)) {
      throw new Error('Input file does not contain a JSON array');
    }
    
    console.log(`Loaded ${cafes.length} cafes from input file.`);
    
    // Process each cafe sequentially
    const updatedCafes = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < cafes.length; i++) {
      const updatedCafe = await processCafe(cafes[i], i, cafes.length);
      
      // Check if businessStatus was added/updated
      if (updatedCafe.businessStatus) {
        successCount++;
      } else if (updatedCafe.placeId) {
        errorCount++;
      }
      
      updatedCafes.push(updatedCafe);
      
      // Add a small delay between API calls
      if (i < cafes.length - 1) {
        await sleep(API_CALL_DELAY_MS);
      }
    }
    
    // Write the updated cafes to the output file
    console.log(`Writing updated cafe data to ${OUTPUT_FILE}...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(updatedCafes, null, 2), 'utf8');
    
    // Log summary
    console.log(`\nProcess completed!`);
    console.log(`Processed ${cafes.length} cafes.`);
    console.log(`${successCount} cafes updated with businessStatus.`);
    console.log(`${errorCount} cafes encountered issues.`);
    console.log(`Output saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 