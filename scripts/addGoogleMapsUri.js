/**
 * addGoogleMapsUri.js
 * 
 * This script processes a JSON file containing cafe data and adds/updates
 * the googleMapsUri field for each cafe by fetching it from the Google Places API.
 * 
 * Usage: node addGoogleMapsUri.js
 */

const fs = require('fs/promises');
const path = require('path');
const { getPlaceDetails } = require('../src/api/placesApiService');
const axios = require('axios');
const appConfig = require('../src/utils/appConfig');

// Configure input and output file paths
const INPUT_FILE = path.resolve(__dirname, 'canggu_cafe_prod_ready.json');
const OUTPUT_FILE = path.resolve(__dirname, 'canggu_cafe_with_maps_uri.json');

// TEST PLACE ID - using the first cafe from the JSON file
const TEST_PLACE_ID = 'ChIJ9UCFSPE50i0RVVADcFGCGXI';

// Add a delay between API calls to avoid rate limiting
const DELAY_BETWEEN_CALLS_MS = 500;

// Helper function to wait for a specified time
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * DIAGNOSTIC TEST FUNCTION
 * Makes a direct API call to Google Places API with a specified field mask
 * @param {string} placeId - The placeId to test
 * @param {string} fieldMask - The field mask to use (comma-separated list of fields)
 */
async function testSinglePlace(placeId, fieldMask) {
  console.log(`\n=== DIAGNOSTIC TEST ===`);
  console.log(`Testing placeId: ${placeId}`);
  console.log(`Using field mask: ${fieldMask}`);
  
  try {
    // Get API key from appConfig
    const config = await appConfig.getConfig();
    const apiKey = config.MAPS_API_KEY;
    
    if (!apiKey) {
      throw new Error('MAPS_API_KEY not found in configuration');
    }
    
    // Log the request details
    const apiUrl = `https://places.googleapis.com/v1/places/${placeId}`;
    console.log(`\nRequest URL: ${apiUrl}`);
    console.log(`Request Headers:`);
    console.log(`- Content-Type: application/json`);
    console.log(`- X-Goog-Api-Key: ${apiKey ? apiKey.substring(0, 4) + '***' : 'undefined'}`);
    console.log(`- X-Goog-FieldMask: ${fieldMask}`);
    
    // Make the API call
    const response = await axios.get(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask
      }
    });
    
    // Log the response details
    console.log(`\nResponse Status: ${response.status}`);
    console.log(`Response Headers:`, JSON.stringify(response.headers, null, 2));
    console.log(`Response Data:`, JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error(`\nAPI Call Failed!`);
    console.error(`Error: ${error.message}`);
    
    if (error.response) {
      console.error(`Response Status: ${error.response.status}`);
      console.error(`Response Headers:`, JSON.stringify(error.response.headers, null, 2));
      console.error(`Response Data:`, JSON.stringify(error.response.data, null, 2));
      
      // Try to extract and log the details array if it exists
      if (error.response.data && error.response.data.details && Array.isArray(error.response.data.details)) {
        console.error(`\nError Details:`, JSON.stringify(error.response.data.details, null, 2));
      }
    }
    
    throw error;
  }
}

/**
 * Process a single cafe to add/update its googleMapsUri field
 * @param {Object} cafe - The cafe object to process
 * @param {number} index - The index of the cafe in the array
 * @param {number} total - The total number of cafes
 * @returns {Promise<Object>} The processed cafe object
 */
async function processCafe(cafe, index, total) {
  if (!cafe.placeId) {
    console.error(`Error: Cafe at index ${index} is missing placeId. Skipping...`);
    return cafe;
  }

  try {
    console.log(`Processing cafe ${index + 1}/${total}: ${cafe.name || cafe.placeId}`);
    
    // Fetch place details from Google Places API
    const placeDetails = await getPlaceDetails(cafe.placeId);
    
    if (placeDetails && placeDetails.googleMapsUri) {
      // Add/update the googleMapsUri field while preserving all other fields
      return {
        ...cafe,
        googleMapsUri: placeDetails.googleMapsUri
      };
    } else {
      console.warn(`Warning: No googleMapsUri found for place ${cafe.placeId}`);
      return cafe;
    }
  } catch (error) {
    console.error(`Error processing cafe ${cafe.placeId}:`, error.message);
    return cafe; // Return original cafe object on error
  }
}

/**
 * Main function to process all cafes in the input file
 */
async function main() {
  try {
    // Run diagnostic test first
    console.log(`Running diagnostic test with correct field mask...`);
    await testSinglePlace(TEST_PLACE_ID, 'id,displayName,googleMapsUri');
    console.log(`\nDiagnostic test complete.`);
    
    // Read the input file
    console.log(`Reading cafe data from ${INPUT_FILE}...`);
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const cafes = JSON.parse(data);
    console.log(`Loaded ${cafes.length} cafes from input file.`);
    
    // Process each cafe sequentially
    const updatedCafes = [];
    for (let i = 0; i < cafes.length; i++) {
      const updatedCafe = await processCafe(cafes[i], i, cafes.length);
      updatedCafes.push(updatedCafe);
      
      // Add delay between API calls to avoid rate limiting
      if (i < cafes.length - 1) {
        await delay(DELAY_BETWEEN_CALLS_MS);
      }
    }
    
    // Write the updated cafes to the output file
    console.log(`\nWriting ${updatedCafes.length} updated cafes to ${OUTPUT_FILE}...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(updatedCafes, null, 2), 'utf8');
    console.log(`Successfully updated cafe data and saved to ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 