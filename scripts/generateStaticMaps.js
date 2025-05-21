/**
 * generateStaticMaps.js
 * 
 * This script enriches cafe data by generating a static map image for each cafe,
 * uploading it to AWS S3, and adding the S3 URL back to the cafe's data.
 * 
 * Usage: 
 *   - Normal mode: node generateStaticMaps.js
 *   - Dry run mode: node generateStaticMaps.js --dry-run
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const appConfig = require('../src/utils/appConfig');

// Check for --dry-run command line argument
const IS_DRY_RUN = process.argv.includes('--dry-run');

// Configuration constants
const STATIC_MAP_CONFIG = {
  size: '600x350',
  zoom: '16',
  maptype: 'roadmap',
  format: 'png'
};

const S3_CONFIG = {
  bucketName: 'baliciaga-database',
  region: 'ap-southeast-1',
  imagePathPrefix: 'image/'
};

// Input/output file paths
const INPUT_FILE_PATH = path.resolve(__dirname, 'cafes_map.json');
const OUTPUT_FILE_PATH_NORMAL_RUN = path.resolve(__dirname, 'cafes_fully_enriched.json');

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
 * Finds the processed name for a cafe by scanning the cafe_images directory
 * @param {string} placeId - Google Place ID for the cafe
 * @returns {Promise<string|null>} - Processed name or null if not found
 */
async function findProcessedNameFromImageDir(placeId) {
  try {
    const dirs = await fs.readdir(CAFE_IMAGES_DIR);
    const expectedSuffix = '_' + placeId;

    const matchingDir = dirs.find(dir => dir.endsWith(expectedSuffix));

    if (!matchingDir) {
      // It's possible the folder name *is* just the placeId if no processed name was prepended,
      // or if the naming convention in cafe_images sometimes varies.
      // For now, we strictly look for the {name}_{placeId} pattern.
      // If not found, return null, and the main loop should handle skipping.
      return null;
    }

    // Extract processedName: everything before the expectedSuffix in the matchingDir string
    const processedName = matchingDir.substring(0, matchingDir.length - expectedSuffix.length);
    
    // Basic validation: ensure processedName is not empty if a suffix was found.
    // If matchingDir was just "_ChIJxxxx" (unlikely but possible if processedName was empty string), 
    // processedName would be empty. This is probably an edge case to consider if folder names can be just "_placeId".
    // For now, if processedName is empty after stripping the suffix, it might indicate an issue or an unexpected folder name.
    if (processedName === '') {
        console.warn(`WARNING: Extracted an empty processedName for directory '${matchingDir}' with placeId '${placeId}'. This might indicate an unexpected folder naming. Skipping.`);
        return null;
    }
    
    return processedName;
  } catch (error) {
    console.error(`Error scanning CAFE_IMAGES_DIR for placeId ${placeId}:`, error.message);
    return null; // Ensure errors in this function also lead to null, handled by main loop
  }
}

/**
 * Constructs the Google Static Maps API URL for a cafe
 * @param {Object} cafe - Cafe object with location data
 * @param {string} apiKey - Google Maps API key
 * @returns {string} - Complete URL for the static map image
 */
function constructStaticMapUrl(cafe, apiKey) {
  const { latitude, longitude } = cafe;
  
  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: STATIC_MAP_CONFIG.zoom,
    size: STATIC_MAP_CONFIG.size,
    maptype: STATIC_MAP_CONFIG.maptype,
    markers: `color:red|${latitude},${longitude}`,
    format: STATIC_MAP_CONFIG.format,
    key: apiKey
  });
  
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Fetches the static map image data from Google Maps API
 * @param {string} url - Complete Static Maps API URL
 * @returns {Promise<Buffer>} - Image data as Buffer
 */
async function fetchStaticMap(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    throw new Error(`Failed to fetch static map: ${error.message}`);
  }
}

/**
 * Uploads an image to AWS S3
 * @param {Buffer} imageData - Image data as Buffer
 * @param {string} objectKey - S3 object key (path and filename)
 * @param {S3Client} s3Client - Initialized S3 client
 * @returns {Promise<string>} - Public URL of the uploaded image
 */
async function uploadToS3(imageData, objectKey, s3Client) {
  const contentType = STATIC_MAP_CONFIG.format === 'png' ? 'image/png' : 'image/jpeg';
  
  const params = {
    Bucket: S3_CONFIG.bucketName,
    Key: objectKey,
    Body: imageData,
    ContentType: contentType
  };
  
  try {
    await s3Client.send(new PutObjectCommand(params));
    
    // Construct the public S3 URL
    const s3Url = `https://${S3_CONFIG.bucketName}.s3.${S3_CONFIG.region}.amazonaws.com/${objectKey}`;
    return s3Url;
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Constructs the expected S3 URL without actually uploading
 * @param {string} objectKey - S3 object key (path and filename)
 * @returns {string} - Expected public S3 URL
 */
function constructExpectedS3Url(objectKey) {
  return `https://${S3_CONFIG.bucketName}.s3.${S3_CONFIG.region}.amazonaws.com/${objectKey}`;
}

/**
 * Main function to process all cafes
 */
async function main() {
  console.log(`Starting static map generation process in ${IS_DRY_RUN ? 'DRY RUN' : 'NORMAL'} mode...`);
  
  try {
    // Load configuration (for API keys and AWS credentials)
    const config = await appConfig.getConfig();
    
    // Initialize S3 client (only if not in dry run mode)
    let s3Client = null;
    if (!IS_DRY_RUN) {
      s3Client = new S3Client({
        region: S3_CONFIG.region,
        credentials: {
          accessKeyId: config.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.AWS_SECRET_ACCESS_KEY
        }
      });
    }
    
    // Read the input file
    console.log(`Reading cafe data from ${INPUT_FILE_PATH}...`);
    const data = await fs.readFile(INPUT_FILE_PATH, 'utf8');
    const cafes = JSON.parse(data);
    
    if (!Array.isArray(cafes)) {
      throw new Error('Input file does not contain a JSON array');
    }
    
    console.log(`Loaded ${cafes.length} cafes from input file.`);
    
    // Process each cafe
    const updatedCafes = [];
    let successCount = 0;
    let skipCount = 0;
    let unknownNameCount = 0;
    
    for (let i = 0; i < cafes.length; i++) {
      const cafe = cafes[i];
      const cafeName = cafe.name || 'Unknown';
      const placeId = cafe.placeId;
      
      console.log(`Processing cafe ${i + 1}/${cafes.length}: ${cafeName} (${placeId})`);
      
      // Skip cafes without placeId or location
      if (!placeId) {
        console.warn(`WARNING: Cafe at index ${i} has no placeId and will be skipped.`);
        updatedCafes.push(cafe);
        skipCount++;
        continue;
      }
      
      if (!cafe.latitude || !cafe.longitude) {
        console.warn(`WARNING: Cafe ${cafeName} (${placeId}) has no valid location and will be skipped.`);
        updatedCafes.push(cafe);
        skipCount++;
        continue;
      }
      
      try {
        // Derive sanitizedNamePart using the sanitizeFolderName function
        const sanitizedNamePart = sanitizeFolderName(cafeName);
        
        // Check if sanitization resulted in 'unknown-cafe'
        if (sanitizedNamePart === 'unknown-cafe') {
          console.warn(`WARNING: Cafe "${cafeName}" (${placeId}) resulted in 'unknown-cafe' after sanitization.`);
          unknownNameCount++;
          // Continue with 'unknown-cafe' as the sanitizedNamePart (not skipping)
        }
        
        // Construct S3 path and filename
        const s3Subfolder = `${sanitizedNamePart}_${placeId}`;
        const staticMapFilename = `${sanitizedNamePart}_static.${STATIC_MAP_CONFIG.format}`;
        const s3ObjectKey = `${S3_CONFIG.imagePathPrefix}${s3Subfolder}/${staticMapFilename}`;
        
        // Construct Google Static Maps API URL
        const staticMapUrl = constructStaticMapUrl(cafe, config.MAPS_API_KEY);
        
        // Construct expected S3 URL
        const expectedS3Url = constructExpectedS3Url(s3ObjectKey);
        
        if (IS_DRY_RUN) {
          // In dry run mode, just log what would happen
          console.log(`DRY RUN - Cafe: "${cafeName}"`);
          console.log(`  - Sanitized name: "${sanitizedNamePart}"`);
          console.log(`  - Place ID: "${placeId}"`);
          console.log(`  - Google Static Maps API URL would be: "${staticMapUrl}"`);
          console.log(`  - S3 Object Key would be: "${s3ObjectKey}"`);
          console.log(`  - Expected S3 URL would be: "${expectedS3Url}"`);
          
          // Add the cafe to the output array without modification (in dry run)
          updatedCafes.push(cafe);
          successCount++;
        } else {
          // In normal mode, fetch image and upload to S3
          console.log(`Fetching static map for ${cafeName} (${placeId})...`);
          const imageData = await fetchStaticMap(staticMapUrl);
          
          console.log(`Uploading static map to S3 at ${s3ObjectKey}...`);
          const s3Url = await uploadToS3(imageData, s3ObjectKey, s3Client);
          
          // Update cafe object with S3 URL
          const updatedCafe = {
            ...cafe,
            staticMapS3Url: s3Url
          };
          
          updatedCafes.push(updatedCafe);
          successCount++;
          
          console.log(`SUCCESS: Generated and uploaded static map for ${cafeName} (${placeId})`);
        }
      } catch (error) {
        console.error(`ERROR: Failed to process cafe ${cafeName} (${placeId}):`, error.message);
        updatedCafes.push(cafe);
        skipCount++;
      }
    }
    
    // Only write output file in normal mode
    if (!IS_DRY_RUN) {
      console.log(`Writing enriched cafe data to ${OUTPUT_FILE_PATH_NORMAL_RUN}...`);
      await fs.writeFile(OUTPUT_FILE_PATH_NORMAL_RUN, JSON.stringify(updatedCafes, null, 2), 'utf8');
    }
    
    // Log summary
    console.log('\nSummary:');
    console.log(`Total cafes processed: ${cafes.length}`);
    console.log(`Successful operations: ${successCount}`);
    console.log(`Cafes with 'unknown-cafe' name: ${unknownNameCount}`);
    console.log(`Cafes skipped due to errors: ${skipCount}`);
    
    if (IS_DRY_RUN) {
      console.log('\nDRY RUN COMPLETED. No actual files written or APIs called.');
    } else {
      console.log(`\nProcess completed! Output saved to: ${OUTPUT_FILE_PATH_NORMAL_RUN}`);
    }
    
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