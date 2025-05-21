/**
 * addNewCafe.js
 * 
 * An interactive script to add a new cafe to the master JSON database.
 * The script handles finding the cafe on Google Places, processing user-provided images,
 * generating a static map, prompting for Instagram URL, and saving to a new JSON file.
 * 
 * Usage: node addNewCafe.js
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const inquirer = require('inquirer');
const { v4: uuidv4 } = require('uuid');

// Import app configuration and API services
const appConfig = require('../src/utils/appConfig');
const placesApiService = require('../src/api/placesApiService');

// Constants
const CAFE_IMAGES_DIR = path.resolve(__dirname, '../../cafe_images/');
const MASTER_JSON_PATH = path.resolve(__dirname, 'cafes_fully_enriched.json');

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

// Bali location bias for Google Places API
const BALI_LOCATION_BIAS = {
  circle: {
    center: { 
      latitude: -8.3405, 
      longitude: 115.0917 
    },
    radius: 50000.0 // 50km radius
  }
};

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
 * Search for a cafe using the Google Places API
 * @param {string} cafeName - Name of the cafe to search for
 * @param {string} area - Optional area in Bali to help narrow search
 * @returns {Promise<Array>} - Array of found places
 */
async function searchCafe(cafeName, area = '') {
  try {
    console.log(`Searching for "${cafeName}"${area ? ` in ${area}` : ''}...`);
    
    // Create search text by combining cafe name and area
    const textQuery = area ? `${cafeName} ${area}` : cafeName;
    
    // Call Google Places API textSearch
    const searchParams = {
      textQuery,
      locationBias: BALI_LOCATION_BIAS
    };
    
    const result = await placesApiService.searchTextPlaces(searchParams);
    return result.places || [];
  } catch (error) {
    console.error('Error searching for cafe:', error.message);
    throw error;
  }
}

/**
 * Fetches the static map image data from Google Maps API
 * @param {number} latitude - Latitude of the location
 * @param {number} longitude - Longitude of the location
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<Buffer>} - Image data as Buffer
 */
async function fetchStaticMap(latitude, longitude, apiKey) {
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
    
    console.log('Fetching static map...');
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error('Error fetching static map:', error.message);
    throw new Error(`Failed to fetch static map: ${error.message}`);
  }
}

/**
 * Creates a directory if it doesn't exist
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Creating directory: ${dirPath}`);
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

/**
 * Upload an image to AWS S3
 * @param {Buffer|string} imageData - Image data as Buffer or file path
 * @param {string} objectKey - S3 object key (path and filename)
 * @param {string} contentType - MIME type of the image
 * @param {S3Client} s3Client - Initialized S3 client
 * @returns {Promise<string>} - Public URL of the uploaded image
 */
async function uploadToS3(imageData, objectKey, contentType, s3Client) {
  // If imageData is a file path, read the file
  let imageBuffer = imageData;
  if (typeof imageData === 'string') {
    imageBuffer = await fs.readFile(imageData);
  }
  
  const params = {
    Bucket: S3_CONFIG.bucketName,
    Key: objectKey,
    Body: imageBuffer,
    ContentType: contentType
  };
  
  try {
    console.log(`Uploading to S3: ${objectKey}`);
    await s3Client.send(new PutObjectCommand(params));
    
    // Construct the public S3 URL
    const s3Url = `https://${S3_CONFIG.bucketName}.s3.${S3_CONFIG.region}.amazonaws.com/${objectKey}`;
    return s3Url;
  } catch (error) {
    console.error('Error uploading to S3:', error.message);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Process and upload all images in a directory to S3
 * @param {string} imageDir - Directory containing images
 * @param {string} s3Subfolder - S3 subfolder name (cafeName_placeId)
 * @param {S3Client} s3Client - Initialized S3 client
 * @returns {Promise<string[]>} - Array of S3 URLs for uploaded images
 */
async function processAndUploadImages(imageDir, s3Subfolder, s3Client) {
  try {
    console.log(`Scanning for images in ${imageDir}...`);
    
    // Check if directory exists
    try {
      await fs.access(imageDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Image directory does not exist: ${imageDir}`);
      }
      throw error;
    }
    
    // Get list of files in directory
    const files = await fs.readdir(imageDir);
    
    // Filter for image files (case insensitive)
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });
    
    if (imageFiles.length === 0) {
      throw new Error(`No image files found in ${imageDir}`);
    }
    
    console.log(`Found ${imageFiles.length} image files. Uploading to S3...`);
    
    // Sort alphabetically
    imageFiles.sort();
    
    // Process each image
    const s3Urls = [];
    for (const file of imageFiles) {
      const filePath = path.join(imageDir, file);
      const ext = path.extname(file).toLowerCase();
      let contentType;
      
      // Determine content type based on extension
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.webp':
          contentType = 'image/webp';
          break;
        default:
          contentType = 'application/octet-stream';
      }
      
      // Construct S3 object key
      const objectKey = `${S3_CONFIG.imagePathPrefix}${s3Subfolder}/${file}`;
      
      // Upload to S3
      const s3Url = await uploadToS3(filePath, objectKey, contentType, s3Client);
      s3Urls.push(s3Url);
    }
    
    return s3Urls;
  } catch (error) {
    console.error('Error processing images:', error.message);
    throw error;
  }
}

/**
 * Generate a static map image and upload it to S3
 * @param {number} latitude - Latitude of the location
 * @param {number} longitude - Longitude of the location
 * @param {string} sanitizedNamePart - Sanitized cafe name
 * @param {string} placeId - Google Place ID
 * @param {string} apiKey - Google Maps API key
 * @param {S3Client} s3Client - Initialized S3 client
 * @returns {Promise<string>} - S3 URL of the static map
 */
async function generateAndUploadStaticMap(latitude, longitude, sanitizedNamePart, placeId, apiKey, s3Client) {
  try {
    console.log('Generating static map...');
    
    // Fetch static map image
    const imageData = await fetchStaticMap(latitude, longitude, apiKey);
    
    // Determine content type based on format
    const contentType = STATIC_MAP_CONFIG.format === 'png' ? 'image/png' : 'image/jpeg';
    
    // Construct S3 subfolder and object key
    const s3Subfolder = `${sanitizedNamePart}_${placeId}`;
    const staticMapFilename = `${sanitizedNamePart}_static.${STATIC_MAP_CONFIG.format}`;
    const s3ObjectKey = `${S3_CONFIG.imagePathPrefix}${s3Subfolder}/${staticMapFilename}`;
    
    // Upload to S3
    const s3Url = await uploadToS3(imageData, s3ObjectKey, contentType, s3Client);
    
    return s3Url;
  } catch (error) {
    console.error('Error generating static map:', error.message);
    throw error;
  }
}

/**
 * Get timestamp string for filename
 * @returns {string} - Timestamp string (YYYYMMDDHHMMSS)
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '')
    .replace(/\..+/, '');
}

/**
 * Main function to add a new cafe interactively
 */
async function main() {
  try {
    console.log('============================================');
    console.log('  BALICIAGA - Interactive Add New Cafe Tool  ');
    console.log('============================================\n');
    
    // Load app configuration
    const config = await appConfig.getConfig();
    
    // Initialize S3 client
    const s3Client = new S3Client({
      region: S3_CONFIG.region,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Step 1: Get user input for cafe name and area
    const { cafeName, areaName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'cafeName',
        message: 'Enter the name of the new cafe:',
        validate: input => input.trim() !== '' ? true : 'Cafe name is required'
      },
      {
        type: 'input',
        name: 'areaName',
        message: 'Enter the area in Bali (e.g., Canggu, Seminyak, Ubud) or press Enter to skip:'
      }
    ]);
    
    // Search for the cafe
    const places = await searchCafe(cafeName, areaName);
    
    if (places.length === 0) {
      console.error('No places found matching your search criteria.');
      process.exit(1);
    }
    
    // Display search results to user
    console.log('\nFound the following cafes:');
    const choices = places.map((place, index) => {
      const displayName = place.displayName?.text || 'Unknown name';
      const address = place.formattedAddress || 'No address available';
      return {
        name: `${index + 1}. ${displayName} - ${address}`,
        value: index
      };
    });
    
    choices.push({ name: 'None of these - abort', value: -1 });
    
    // Let user select the correct cafe
    const { placeIndex } = await inquirer.prompt([
      {
        type: 'list',
        name: 'placeIndex',
        message: 'Select the correct cafe:',
        choices
      }
    ]);
    
    if (placeIndex === -1) {
      console.log('Operation aborted by user.');
      process.exit(0);
    }
    
    const selectedPlace = places[placeIndex];
    const placeId = selectedPlace.id;
    
    console.log(`\nSelected cafe: ${selectedPlace.displayName?.text || 'Unknown'} (${placeId})`);
    
    // Step 2: Get full place details
    console.log('\nFetching detailed information...');
    const placeDetails = await placesApiService.getPlaceDetails(placeId);
    
    if (!placeDetails) {
      console.error('Failed to fetch place details.');
      process.exit(1);
    }
    
    // Extract relevant details
    const nameToSanitize = placeDetails.displayName?.text || placeDetails.name || 'unknown-cafe';
    const sanitizedNamePart = sanitizeFolderName(nameToSanitize);
    
    // Parse location from placeDetails
    let latitude = 0;
    let longitude = 0;
    
    if (placeDetails.location) {
      latitude = placeDetails.location.latitude;
      longitude = placeDetails.location.longitude;
    }
    
    // Store other relevant details
    const googleMapsUriValue = placeDetails.googleMapsUri || '';
    const businessStatusValue = placeDetails.businessStatus || 'OPERATIONAL';
    
    // Step 4: Handle user-prepared local photos
    const localImageDir = path.join(CAFE_IMAGES_DIR, `${sanitizedNamePart}_${placeId}`);
    
    console.log(`\nFor cafe '${nameToSanitize}', the standard image folder is expected at:`);
    console.log(`${localImageDir}`);
    console.log('\nPlease ensure your high-quality photos are placed in this local directory.');
    console.log('It is recommended to name them in alphabetical order if sequence matters');
    console.log('(e.g., photo_a.jpg, photo_b.jpg, etc.).');
    
    // Ask user to confirm when images are ready
    const { imagesReady } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'imagesReady',
        message: 'Are your images ready in the directory? If not, the directory will be created but you need to add images later manually.',
        default: false
      }
    ]);
    
    // Ensure the image directory exists
    await ensureDirectoryExists(localImageDir);
    
    // Initialize photos array
    let photos = [];
    
    // Process and upload images if they're ready
    if (imagesReady) {
      try {
        photos = await processAndUploadImages(localImageDir, `${sanitizedNamePart}_${placeId}`, s3Client);
        console.log(`Successfully uploaded ${photos.length} images to S3.`);
      } catch (error) {
        console.error('Error processing photos:', error.message);
        const { continueWithoutPhotos } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueWithoutPhotos',
            message: 'Do you want to continue without photos?',
            default: true
          }
        ]);
        
        if (!continueWithoutPhotos) {
          console.log('Operation aborted by user.');
          process.exit(0);
        }
      }
    }
    
    // Step 5: Generate static map and upload to S3
    let staticMapS3Url = '';
    if (latitude && longitude) {
      try {
        staticMapS3Url = await generateAndUploadStaticMap(
          latitude, 
          longitude, 
          sanitizedNamePart, 
          placeId, 
          config.MAPS_API_KEY, 
          s3Client
        );
        console.log('Successfully generated and uploaded static map to S3.');
      } catch (error) {
        console.error('Error generating static map:', error.message);
      }
    } else {
      console.warn('Warning: No valid coordinates available for static map generation.');
    }
    
    // Step 6: Manual Instagram Input
    const { instagramUrl } = await inquirer.prompt([
      {
        type: 'input',
        name: 'instagramUrl',
        message: `Please enter the Instagram URL for '${nameToSanitize}' (e.g., https://www.instagram.com/cafename/) or press Enter to skip:`
      }
    ]);
    
    // Step 7: Update Master JSON File
    console.log('\nReading existing cafe data...');
    
    // Read the master JSON file
    let masterCafes = [];
    try {
      const masterData = await fs.readFile(MASTER_JSON_PATH, 'utf8');
      masterCafes = JSON.parse(masterData);
      
      if (!Array.isArray(masterCafes)) {
        throw new Error('Master file does not contain a JSON array');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Warning: Master file not found at ${MASTER_JSON_PATH}. Creating a new one.`);
      } else {
        console.error('Error reading master file:', error.message);
        const { continueAnyway } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Do you want to continue and create a new master file?',
            default: true
          }
        ]);
        
        if (!continueAnyway) {
          console.log('Operation aborted by user.');
          process.exit(0);
        }
      }
    }
    
      // Construct the new cafe object
  const newCafe = {
    placeId,
    name: nameToSanitize,
    latitude,
    longitude,
    photos,
    openingPeriods: placeDetails.regularOpeningHours?.periods || [],
    openingHours: placeDetails.regularOpeningHours?.weekdayDescriptions || [],
    isOpenNow: placeDetails.regularOpeningHours?.openNow === undefined ? false : placeDetails.regularOpeningHours.openNow,
    website: placeDetails.websiteUri || '',
    phoneNumber: placeDetails.internationalPhoneNumber || '',
    rating: placeDetails.rating || 0,
    userRatingsTotal: placeDetails.userRatingCount || 0,
    region: areaName.toLowerCase() || 'canggu', // Default to canggu or use area provided
    businessStatus: businessStatusValue,
    googleMapsUri: googleMapsUriValue,
    staticMapS3Url,
    instagramUrl: instagramUrl || ''
  };
    
    // Add the new cafe to the array
    masterCafes.push(newCafe);
    
    // Generate output filename
    const timestamp = getTimestamp();
    const outputFilename = `cafes_fully_enriched_plus_${sanitizedNamePart}_${timestamp}.json`;
    const outputPath = path.resolve(__dirname, outputFilename);
    
    // Write the updated array to the output file
    await fs.writeFile(outputPath, JSON.stringify(masterCafes, null, 2), 'utf8');
    
    console.log('\n============================================');
    console.log('  Success! New cafe added to the database  ');
    console.log('============================================');
    console.log(`Cafe Name: ${nameToSanitize}`);
    console.log(`Place ID: ${placeId}`);
    console.log(`Photos: ${photos.length} uploaded`);
    console.log(`Static Map: ${staticMapS3Url ? 'Generated' : 'Not available'}`);
    console.log(`Instagram: ${instagramUrl || 'Not provided'}`);
    console.log(`\nOutput saved to: ${outputFilename}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 