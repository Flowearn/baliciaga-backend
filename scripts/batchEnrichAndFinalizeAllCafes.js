/**
 * batchEnrichAndFinalizeAllCafes.js
 * 
 * Batch processes all cafes from cafes-dev.json to:
 * 1. Find missing placeIds through interactive Google Places text search
 * 2. Fetch detailed information from Google Places API (13-field mask)
 * 3. Intelligently merge API data with existing JSON data
 * 4. Generate static maps for new cafes (4 skeleton entries)
 * 5. Output final comprehensive JSON file with all 38 cafes
 * 
 * Usage: node batchEnrichAndFinalizeAllCafes.js
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const inquirer = require('inquirer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Import app configuration and API services
const appConfig = require('../src/utils/appConfig');
const placesApiService = require('../src/api/placesApiService');

// Configuration Constants
const INPUT_JSON_PATH = path.join(__dirname, 'new-dining-ske.json');
const OUTPUT_JSON_PATH = path.join(__dirname, 'new-dining-dev.json');
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_UPLOAD_IMAGE_PATH_PREFIX = 'dining-image-dev/';
const CDN_URL_BASE = 'https://d2cmxnft4myi1k.cloudfront.net/';

// Static Map Configuration
const STATIC_MAP_CONFIG = {
  size: '600x350',
  zoom: '16',
  maptype: 'roadmap',
  format: 'png',
  // Sharp processing: Convert to lossless WebP at original dimensions
  sharpOptions: {
    webp: {
      lossless: true,
      quality: 100
    }
  }
};

// Processing delay to respect API rate limits
const API_DELAY_MS = 1000; // 1 second between API calls

/**
 * Sanitizes a cafe name to create a valid folder name
 * @param {string} name - Original cafe name
 * @returns {string} - Sanitized name suitable for folder/file names
 */
function sanitizeFolderName(name) {
  if (!name || typeof name !== 'string') {
    return 'unknown-cafe';
  }
  let sanitized = name.toLowerCase();
  sanitized = sanitized.replace(/\s+/g, '-'); // Replace spaces with hyphens
  sanitized = sanitized.replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric (allowing hyphens)
  sanitized = sanitized.replace(/-+/g, '-'); // Replace multiple hyphens with single
  sanitized = sanitized.substring(0, 50); // Limit length

  if (sanitized === '' || sanitized === '-') {
    return 'unknown-cafe';
  }
  return sanitized;
}

/**
 * Fetches static map image data from Google Maps API
 * @param {number} latitude - Latitude of the location
 * @param {number} longitude - Longitude of the location
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Buffer>} - Image data as Buffer
 */
async function fetchStaticMapImage(latitude, longitude, apiKey) {
  try {
    const params = new URLSearchParams({
      center: `${latitude},${longitude}`,
      zoom: STATIC_MAP_CONFIG.zoom,
      size: STATIC_MAP_CONFIG.size,
      maptype: STATIC_MAP_CONFIG.maptype,
      markers: `color:red|${latitude},${longitude}`,
      format: STATIC_MAP_CONFIG.format,
      key: apiKey
    });
    
    const url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
    
    console.log(`  → Fetching static map from Google Maps API...`);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error('  ✗ Error fetching static map:', error.message);
    throw new Error(`Failed to fetch static map: ${error.message}`);
  }
}

/**
 * Converts image buffer to optimized WebP format using Sharp
 * @param {Buffer} imageBuffer - Original image buffer
 * @returns {Promise<Buffer>} - Optimized WebP buffer
 */
async function convertToOptimizedWebP(imageBuffer) {
  try {
    console.log(`  → Converting to lossless WebP format...`);
    
    const webpBuffer = await sharp(imageBuffer)
      .webp(STATIC_MAP_CONFIG.sharpOptions.webp)
      .toBuffer();
    
    console.log(`  ✓ WebP conversion complete`);
    return webpBuffer;
  } catch (error) {
    console.error('  ✗ Error converting to WebP:', error.message);
    throw new Error(`Failed to convert to WebP: ${error.message}`);
  }
}

/**
 * Uploads buffer to S3 and returns CDN URL
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} s3Key - S3 object key (path and filename)
 * @param {string} contentType - MIME type
 * @param {S3Client} s3Client - S3 client instance
 * @returns {Promise<string>} - Public CDN URL
 */
async function uploadBufferToS3(fileBuffer, s3Key, contentType, s3Client) {
  try {
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
    };
    
    console.log(`  → Uploading to S3: ${s3Key}`);
    await s3Client.send(new PutObjectCommand(params));
    
    const finalUrl = `${CDN_URL_BASE}${s3Key}`;
    console.log(`  ✓ Uploaded successfully`);
    return finalUrl;
  } catch (error) {
    console.error('  ✗ Error uploading to S3:', error.message);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Generates and uploads optimized static map for a cafe
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @param {string} sanitizedNamePart - Sanitized cafe name
 * @param {string} placeId - Google Places ID
 * @param {string} googleApiKey - Google Maps API key
 * @param {S3Client} s3Client - S3 client instance
 * @returns {Promise<string>} - CDN URL of the uploaded static map
 */
async function generateAndUploadOptimizedStaticMap(latitude, longitude, sanitizedNamePart, placeId, googleApiKey, s3Client) {
  try {
    console.log(`  → Generating static map for coordinates: ${latitude}, ${longitude}`);
    
    // Step 1: Fetch static map image from Google
    const originalImageBuffer = await fetchStaticMapImage(latitude, longitude, googleApiKey);
    
    // Step 2: Convert to optimized WebP
    const webpBuffer = await convertToOptimizedWebP(originalImageBuffer);
    
    // Step 3: Upload to S3 and get CDN URL
    const s3Key = `${S3_UPLOAD_IMAGE_PATH_PREFIX}${sanitizedNamePart}_${placeId}/${sanitizedNamePart}_static.webp`;
    const cdnUrl = await uploadBufferToS3(webpBuffer, s3Key, 'image/webp', s3Client);
    
    return cdnUrl;
  } catch (error) {
    console.error(`  ✗ Failed to generate static map: ${error.message}`);
    throw error;
  }
}

/**
 * Delays execution for the specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



/**
 * Searches for places using Google Places "Text Search" API
 * @param {string} query - Search query (cafe name + location)
 * @param {string} googleApiKey - Google API key
 * @returns {Promise<Array>} - Array of place candidates or empty array if none found
 */
async function searchPlacesFromText(query, googleApiKey) {
  try {
    console.log(`  → Searching Google Places for: "${query}"`);
    
    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
    const params = {
      query: `${query}, Bali, Indonesia`,
      fields: 'place_id,name,formatted_address,business_status,rating',
      key: googleApiKey
    };
    
    const response = await axios.get(url, { 
      params,
      timeout: 10000 
    });
    
    if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
      // Return up to 5 candidates for user selection
      return response.data.results.slice(0, 5);
    } else {
      console.log(`  ⚠️  No places found for query: "${query}"`);
      return [];
    }
  } catch (error) {
    console.error(`  ✗ Error searching for places: ${error.message}`);
    return [];
  }
}

/**
 * Displays place candidates and gets user selection using inquirer
 * @param {Array} candidates - Array of place candidates
 * @param {string} cafeName - Original cafe name
 * @returns {Promise<Object|null>} - Selected place or null if skipped
 */
async function selectPlaceFromCandidates(candidates, cafeName) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  console.log(`\n  📍 Found ${candidates.length} candidate place(s) for "${cafeName}"`);
  
  // Format candidates for inquirer
  const formattedCandidates = candidates.map((place, index) => {
    const address = place.formatted_address || 'N/A';
    const rating = place.rating ? `★${place.rating}` : 'No rating';
    const status = place.business_status || 'Unknown';
    
    return {
      name: `${place.name} - ${address} (${rating}, ${status})`,
      value: place.place_id,
      short: place.name
    };
  });
  
  // Add skip option
  formattedCandidates.push({
    name: '--- SKIP THIS ONE ---',
    value: 'skip',
    short: 'Skip'
  });
  
  const { placeId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'placeId',
      message: `请为 "${cafeName}" 选择正确的商家:`,
      choices: formattedCandidates,
      pageSize: 10
    }
  ]);
  
  if (placeId === 'skip') {
    console.log(`  → Skipping ${cafeName} (user choice: skip)`);
    return null;
  }
  
  // Find the selected place object
  const selectedPlace = candidates.find(place => place.place_id === placeId);
  if (selectedPlace) {
    console.log(`  ✓ Selected: ${selectedPlace.name}`);
    return selectedPlace;
  } else {
    console.log(`  ⚠️  Selection error, skipping ${cafeName}`);
    return null;
  }
}

/**
 * Loads and parses the input JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Array>} - Array of cafe objects
 */
async function loadCafeData(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    if (!Array.isArray(data)) {
      throw new Error('Input JSON must be an array');
    }
    
    console.log(`✓ Loaded ${data.length} cafes from ${filePath}`);
    return data;
  } catch (error) {
    console.error('Error loading cafe data:', error.message);
    throw error;
  }
}

/**
 * Saves cafe data to output JSON file
 * @param {Array} cafeData - Array of cafe objects
 * @param {string} filePath - Output file path
 * @returns {Promise<void>}
 */
async function saveCafeData(cafeData, filePath) {
  try {
    const jsonContent = JSON.stringify(cafeData, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf8');
    console.log(`✓ Saved ${cafeData.length} cafes to ${filePath}`);
  } catch (error) {
    console.error('Error saving cafe data:', error.message);
    throw error;
  }
}

/**
 * Processes a single cafe: fetch API details and merge with existing data
 * @param {Object} currentCafeData - Existing cafe data
 * @param {string} googleApiKey - Google API key
 * @param {S3Client} s3Client - S3 client instance
 * @param {number} index - Cafe index for logging
 * @param {number} total - Total number of cafes
 * @returns {Promise<Object>} - Merged and updated cafe object
 */
async function processSingleCafe(currentCafeData, googleApiKey, s3Client, index, total) {
  const cafeName = currentCafeData.name || 'Unknown Cafe';
  let placeId = currentCafeData.placeId;
  
  console.log(`\n[${index + 1}/${total}] Processing: ${cafeName}`);
  console.log(`  Place ID: ${placeId || 'NOT SET'}`);
  
  // Step 1: Interactive placeId finding if missing
  if (!placeId || placeId.trim() === '') {
    console.log(`  ⚠️  No placeId found for ${cafeName}`);
    console.log(`  → Finding placeId for ${cafeName}...`);
    
    // Search for places using Text Search API
    const placeCandidates = await searchPlacesFromText(cafeName, googleApiKey);
    
    if (placeCandidates.length > 0) {
      // Let user select from candidates
      const selectedPlace = await selectPlaceFromCandidates(placeCandidates, cafeName);
      
      if (selectedPlace) {
        placeId = selectedPlace.place_id;
        console.log(`  ✓ Using placeId: ${placeId}`);
        
        // Update the current cafe data with the found placeId
        currentCafeData.placeId = placeId;
      } else {
        console.log(`  → Skipping ${cafeName} (no selection made)`);
        // Ensure instagram field exists before returning
        if (!currentCafeData.instagram) {
          currentCafeData.instagram = '';
        }
        return currentCafeData; // Return original data without changes
      }
    } else {
      console.log(`  ✗ No places found for "${cafeName}", skipping API enrichment`);
      // Ensure instagram field exists before returning
      if (!currentCafeData.instagram) {
        currentCafeData.instagram = '';
      }
      return currentCafeData;
    }
  }

  // Step 2: Proceed with existing API processing logic
  if (!placeId) {
    console.log('  ⚠️  No placeId available, skipping API fetch');
    // Ensure instagram field exists before returning
    if (!currentCafeData.instagram) {
      currentCafeData.instagram = '';
    }
    return currentCafeData;
  }

  try {
    // Step 3: Fetch API details using the 13-field mask
    console.log(`  → Fetching details from Google Places API...`);
    const apiDetails = await placesApiService.getPlaceDetails(placeId);
    console.log(`  ✓ API details fetched successfully`);
    
    // Step 4: Derive sanitized name
    const sanitizedNamePart = sanitizeFolderName(apiDetails.displayName?.text || cafeName);
    
    // Step 5: Start with current data and merge with API data
    let mergedCafe = { ...currentCafeData };
    
    // Update with API Data (overwrite if exists, add if new)
    mergedCafe.name = apiDetails.displayName?.text || currentCafeData.name;
    mergedCafe.latitude = apiDetails.location?.latitude || currentCafeData.latitude || 0;
    mergedCafe.longitude = apiDetails.location?.longitude || currentCafeData.longitude || 0;
    mergedCafe.googleMapsUri = apiDetails.googleMapsUri || currentCafeData.googleMapsUri || "";
    mergedCafe.businessStatus = apiDetails.businessStatus || currentCafeData.businessStatus || "";
    mergedCafe.openingHours = apiDetails.regularOpeningHours?.weekdayDescriptions || currentCafeData.openingHours || [];
    mergedCafe.openingPeriods = apiDetails.regularOpeningHours?.periods || currentCafeData.openingPeriods || [];
    mergedCafe.isOpenNow = apiDetails.regularOpeningHours?.openNow ?? currentCafeData.isOpenNow ?? false;
    mergedCafe.website = apiDetails.websiteUri || currentCafeData.website || "";
    mergedCafe.phoneNumber = apiDetails.nationalPhoneNumber || currentCafeData.phoneNumber || "";
    mergedCafe.rating = apiDetails.rating || currentCafeData.rating || 0;
    mergedCafe.userRatingsTotal = apiDetails.userRatingCount || currentCafeData.userRatingsTotal || 0;
    mergedCafe.allowsDogs = apiDetails.allowsDogs ?? currentCafeData.allowsDogs ?? null;
    mergedCafe.outdoorSeating = apiDetails.outdoorSeating ?? currentCafeData.outdoorSeating ?? null;
    mergedCafe.servesVegetarianFood = apiDetails.servesVegetarianFood ?? currentCafeData.servesVegetarianFood ?? null;
    
    // Preserve specific fields from currentCafeData (do NOT overwrite with apiDetails)
    // These fields are already set correctly and should not be modified:
    // - photos (S3 WebP links from user curation)
    // - instagram
    // - gofoodUrl  
    // - region
    // - staticMapS3Url (for existing cafes)
    
    // Ensure instagram field exists (add empty string if missing)
    if (!mergedCafe.instagram) {
      mergedCafe.instagram = '';
    }
    
    console.log(`  → Updated with API data. Lat/Lng: ${mergedCafe.latitude}, ${mergedCafe.longitude}`);
    
    // Step 6: Generate Static Map for New Cafes
    const needsStaticMap = (!mergedCafe.staticMapS3Url || mergedCafe.staticMapS3Url === "") 
                          && mergedCafe.latitude !== 0 
                          && mergedCafe.longitude !== 0;
    
    if (needsStaticMap) {
      console.log(`  → Cafe needs static map generation`);
      try {
        const staticMapUrl = await generateAndUploadOptimizedStaticMap(
          mergedCafe.latitude,
          mergedCafe.longitude,
          sanitizedNamePart,
          placeId,
          googleApiKey,
          s3Client
        );
        mergedCafe.staticMapS3Url = staticMapUrl;
        console.log(`  ✓ Static map generated: ${staticMapUrl}`);
      } catch (error) {
        console.error(`  ✗ Failed to generate static map: ${error.message}`);
        // Continue processing even if static map generation fails
      }
    } else {
      console.log(`  → Static map already exists or coordinates unavailable`);
    }
    
    console.log(`  ✓ Processing complete for ${cafeName}`);
    return mergedCafe;
    
  } catch (error) {
    console.error(`  ✗ Error processing ${cafeName}: ${error.message}`);
    console.log(`  → Returning original data for ${cafeName}`);
    // Ensure instagram field exists before returning
    if (!currentCafeData.instagram) {
      currentCafeData.instagram = '';
    }
    return currentCafeData;
  }
}

/**
 * Main script execution
 */
async function main() {
  console.log('🚀 Batch Enrichment and Finalization of All Cafes');
  console.log('This script will process all cafes with Google Places API data and generate missing static maps.\n');

  try {
    // Step 1: Initialize configuration and clients
    console.log('Initializing configuration...');
    const config = await appConfig.getConfig();
    const googleApiKey = config.MAPS_API_KEY;
    
    if (!googleApiKey) {
      throw new Error('Google Maps API key not found in configuration');
    }
    
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        ...(config.AWS_SESSION_TOKEN && { sessionToken: config.AWS_SESSION_TOKEN })
      }
    });
    
    console.log('✓ Configuration and S3 client initialized');

    // Step 2: Load input cafe data
    console.log(`\nLoading cafe data from ${INPUT_JSON_PATH}...`);
    const allCafes = await loadCafeData(INPUT_JSON_PATH);

    // Step 3: Process each cafe
    console.log(`\n📍 Processing ${allCafes.length} cafes...`);
    const updatedAllCafes = [];
    
    for (let i = 0; i < allCafes.length; i++) {
      const currentCafeData = allCafes[i];
      
      try {
        // Process single cafe
        const updatedCafe = await processSingleCafe(currentCafeData, googleApiKey, s3Client, i, allCafes.length);
        updatedAllCafes.push(updatedCafe);
        
        // Add delay between API calls to respect rate limits
        if (i < allCafes.length - 1) { // Don't delay after the last cafe
          console.log(`  → Waiting ${API_DELAY_MS}ms before next cafe...`);
          await delay(API_DELAY_MS);
        }
      } catch (error) {
        console.error(`\n❌ Error processing cafe ${i + 1}/${allCafes.length}: ${error.message}`);
        console.log(`  → Adding original data for this cafe and continuing...`);
        // Ensure instagram field exists before adding to results
        if (!currentCafeData.instagram) {
          currentCafeData.instagram = '';
        }
        updatedAllCafes.push(currentCafeData); // Add original data if processing fails
      }
    }

    // Step 4: Save final results
    console.log(`\n💾 Saving final results to ${OUTPUT_JSON_PATH}...`);
    await saveCafeData(updatedAllCafes, OUTPUT_JSON_PATH);

    // Step 5: Summary
    console.log('\n🎉 Batch processing complete!');
    console.log(`  • Total cafes processed: ${updatedAllCafes.length}`);
    console.log(`  • Input file: ${INPUT_JSON_PATH}`);
    console.log(`  • Output file: ${OUTPUT_JSON_PATH}`);
    
    // Count cafes that got new static maps
    const newStaticMaps = updatedAllCafes.filter(cafe => 
      cafe.staticMapS3Url && cafe.staticMapS3Url.includes('_static.webp')
    ).length;
    
    console.log(`  • Cafes with static maps: ${newStaticMaps}`);
    console.log('\n✨ All cafes are now enriched with the latest Google Places API data!');

  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  processSingleCafe,
  generateAndUploadOptimizedStaticMap,
  sanitizeFolderName,
  searchPlacesFromText,
  selectPlaceFromCandidates
}; 