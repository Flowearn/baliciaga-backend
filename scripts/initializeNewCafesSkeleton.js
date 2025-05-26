/**
 * initializeNewCafesSkeleton.js
 * 
 * Interactive script to add multiple new cafes with skeleton data.
 * For each new cafe, it will:
 * 1. Take user input for sanitizedNamePart and searchable name/area
 * 2. Use Google Places API searchText to fetch placeId and displayName
 * 3. Rename local folder from new_photo/{sanitizedNamePart}/ to new_photo/{sanitizedNamePart}_{placeId}/
 * 4. Create skeleton JSON object with fetched data plus placeholder values
 * 5. Append all new cafes to existing data and save/upload to S3
 * 
 * Usage: node initializeNewCafesSkeleton.js
 */

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const inquirer = require('inquirer');

// Import app configuration and API services
const appConfig = require('../src/utils/appConfig');
const placesApiService = require('../src/api/placesApiService');

// Configuration Constants
const LOCAL_NEW_PHOTO_BASE_DIR = path.resolve(__dirname, '../new_photo/');
const MASTER_JSON_BLUEPRINT_PATH = path.join(__dirname, 'cafes-dev.json');
const OUTPUT_JSON_FILENAME = 'cafes_dev_image_v2_test.json';
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_REGION = 'ap-southeast-1';
const S3_TARGET_DATA_KEY = 'data/cafes_dev_image_v2_test.json';
const DEFAULT_REGION_FALLBACK = 'canggu';

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
 * Validate that a directory exists
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<boolean>} - True if directory exists
 */
async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Search for a cafe using Google Places API searchText
 * @param {string} cafeName - Name of the cafe to search for
 * @param {string} area - Optional area in Bali to help narrow search
 * @returns {Promise<Array>} - Array of found places
 */
async function searchCafe(cafeName, area = '') {
  try {
    console.log(`Searching for "${cafeName}"${area ? ` in ${area}` : ''}...`);
    
    // Create search text by combining cafe name and area
    const textQuery = area ? `${cafeName} ${area}` : cafeName;
    
    // Call Google Places API textSearch with limited field mask
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
 * Display search results and let user select one
 * @param {Array} places - Array of places from search
 * @returns {Promise<Object|null>} - Selected place or null if cancelled
 */
async function selectPlaceFromResults(places) {
  if (!places || places.length === 0) {
    console.log('No results found.');
    return null;
  }

  console.log(`Found ${places.length} results:`);
  
  const choices = places.map((place, index) => ({
    name: `${index + 1}. ${place.displayName?.text || 'Unknown'} - ${place.formattedAddress || 'No address'}`,
    value: place
  }));
  
  choices.push({
    name: 'Cancel - Skip this cafe',
    value: null
  });

  const { selectedPlace } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedPlace',
      message: 'Select the correct cafe:',
      choices: choices
    }
  ]);

  return selectedPlace;
}

/**
 * Rename local folder to include placeId
 * @param {string} oldPath - Current folder path
 * @param {string} newPath - New folder path with placeId
 * @returns {Promise<void>}
 */
async function renameFolder(oldPath, newPath) {
  try {
    await fs.rename(oldPath, newPath);
    console.log(`✓ Renamed folder: ${path.basename(oldPath)} → ${path.basename(newPath)}`);
  } catch (error) {
    console.error(`Error renaming folder from ${oldPath} to ${newPath}:`, error.message);
    throw error;
  }
}

/**
 * Get region from area input or use default
 * @param {string} area - User-provided area input
 * @returns {string} - Region name
 */
function getRegionFromArea(area) {
  if (!area) return DEFAULT_REGION_FALLBACK;
  
  const lowerArea = area.toLowerCase();
  
  // Map common area names to regions
  const regionMap = {
    'canggu': 'canggu',
    'seminyak': 'seminyak',
    'ubud': 'ubud',
    'denpasar': 'denpasar',
    'sanur': 'sanur',
    'kuta': 'kuta',
    'uluwatu': 'uluwatu',
    'jimbaran': 'jimbaran',
    'nusa dua': 'nusa_dua',
    'mengwi': 'canggu', // Mengwi is close to Canggu area
    'badung': 'canggu'
  };
  
  for (const [key, region] of Object.entries(regionMap)) {
    if (lowerArea.includes(key)) {
      return region;
    }
  }
  
  return DEFAULT_REGION_FALLBACK;
}

/**
 * Create skeleton cafe object with all required fields
 * @param {Object} placeData - Data from Google Places API
 * @param {string} instagramUrl - Instagram URL from user input
 * @param {string} region - Region derived from area
 * @returns {Object} - Complete skeleton cafe object
 */
function createSkeletonCafeObject(placeData, instagramUrl, region) {
  return {
    placeId: placeData.id,
    name: placeData.displayName?.text || '',
    latitude: 0,
    longitude: 0,
    businessStatus: '',
    photos: [],
    phoneNumber: '',
    rating: 0,
    userRatingsTotal: 0,
    website: '',
    openingHours: [],
    isOpenNow: false,
    openingPeriods: [],
    instagram: instagramUrl || '',
    region: region,
    googleMapsUri: '',
    staticMapS3Url: '',
    instagramUrl: instagramUrl || ''
  };
}

/**
 * Load and parse the master JSON blueprint
 * @returns {Promise<Array>} - Array of existing cafe objects
 */
async function loadMasterBlueprint() {
  try {
    const fileContent = await fs.readFile(MASTER_JSON_BLUEPRINT_PATH, 'utf8');
    const data = JSON.parse(fileContent);
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Master blueprint must be a non-empty array');
    }
    
    console.log(`✓ Loaded master blueprint with ${data.length} existing cafes`);
    return data;
  } catch (error) {
    console.error('Error loading master blueprint:', error.message);
    throw error;
  }
}

/**
 * Save JSON data to local file
 * @param {Array} data - Cafe data array
 * @param {string} filename - Output filename
 * @returns {Promise<string>} - Full path to saved file
 */
async function saveJsonToFile(data, filename) {
  const outputPath = path.join(__dirname, filename);
  try {
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✓ Saved combined data to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error saving JSON file:', error.message);
    throw error;
  }
}

/**
 * Upload file to S3
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key
 * @param {S3Client} s3Client - S3 client instance
 * @returns {Promise<void>}
 */
async function uploadToS3(filePath, s3Key, s3Client) {
  try {
    const fileContent = await fs.readFile(filePath);
    
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/json'
    };
    
    console.log(`Uploading to S3: s3://${S3_BUCKET_NAME}/${s3Key}`);
    await s3Client.send(new PutObjectCommand(params));
    console.log(`✓ Successfully uploaded to S3`);
  } catch (error) {
    console.error('Error uploading to S3:', error.message);
    throw error;
  }
}

/**
 * Main script execution
 */
async function main() {
  console.log('🚀 Baliciaga New Cafes Skeleton Initializer');
  console.log('This script will help you add multiple new cafes with basic information.\n');

  try {
    // Initialize configuration and S3 client
    console.log('Initializing configuration...');
    const config = await appConfig.getConfig();
    
    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        ...(config.AWS_SESSION_TOKEN && { sessionToken: config.AWS_SESSION_TOKEN })
      }
    });

    // Load master blueprint to understand structure
    const masterCafes = await loadMasterBlueprint();
    
    // Array to store newly initialized cafes
    const newlyInitializedCafes = [];

    // Main loop for adding cafes
    let addMoreCafes = true;
    while (addMoreCafes) {
      console.log('\n' + '='.repeat(50));
      console.log('Adding a new cafe...\n');

      // Step 1: Get sanitized folder name from user
      const { sanitizedNamePartFolderName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'sanitizedNamePartFolderName',
          message: 'Enter the sanitized folder name in new_photo/ (e.g., "home-cafe-mengwi"):',
          validate: async (input) => {
            if (!input.trim()) {
              return 'Folder name cannot be empty';
            }
            
            const folderPath = path.join(LOCAL_NEW_PHOTO_BASE_DIR, input.trim());
            const exists = await directoryExists(folderPath);
            if (!exists) {
              return `Folder does not exist: ${folderPath}`;
            }
            
            return true;
          }
        }
      ]);

      const sanitizedName = sanitizedNamePartFolderName.trim();
      const currentFolderPath = path.join(LOCAL_NEW_PHOTO_BASE_DIR, sanitizedName);

      // Step 2: Get cafe search information
      const { actualCafeName, areaInBali } = await inquirer.prompt([
        {
          type: 'input',
          name: 'actualCafeName',
          message: 'Enter the actual cafe name for Google Search:',
          validate: (input) => input.trim() ? true : 'Cafe name cannot be empty'
        },
        {
          type: 'input',
          name: 'areaInBali',
          message: 'Enter the area in Bali (optional, e.g., "Canggu", "Seminyak"):',
          default: ''
        }
      ]);

      // Step 3: Search for cafe using Google Places API
      try {
        const searchResults = await searchCafe(actualCafeName.trim(), areaInBali.trim());
        const selectedPlace = await selectPlaceFromResults(searchResults);

        if (!selectedPlace) {
          console.log('Skipping this cafe...\n');
          
          const { continueAdding } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueAdding',
              message: 'Add another cafe?',
              default: false
            }
          ]);
          
          addMoreCafes = continueAdding;
          continue;
        }

        // Step 4: Rename local folder to include placeId
        const placeId = selectedPlace.id;
        const newFolderName = `${sanitizedName}_${placeId}`;
        const newFolderPath = path.join(LOCAL_NEW_PHOTO_BASE_DIR, newFolderName);
        
        await renameFolder(currentFolderPath, newFolderPath);

        // Step 5: Get Instagram URL
        const { instagramUrl } = await inquirer.prompt([
          {
            type: 'input',
            name: 'instagramUrl',
            message: 'Enter Instagram URL (optional):',
            default: ''
          }
        ]);

        // Step 6: Determine region
        const region = getRegionFromArea(areaInBali.trim());

        // Step 7: Create skeleton cafe object
        const newCafeObject = createSkeletonCafeObject(selectedPlace, instagramUrl.trim(), region);
        
        console.log(`✓ Created skeleton for: ${newCafeObject.name} (${placeId})`);
        console.log(`  Region: ${region}`);
        console.log(`  Instagram: ${instagramUrl || 'None'}`);
        
        // Add to newly initialized cafes array
        newlyInitializedCafes.push(newCafeObject);

      } catch (error) {
        console.error('Error processing cafe:', error.message);
        console.log('Skipping this cafe due to error...\n');
      }

      // Ask if user wants to add more cafes
      const { continueAdding } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another cafe?',
          default: true
        }
      ]);
      
      addMoreCafes = continueAdding;
    }

    // Process results
    if (newlyInitializedCafes.length === 0) {
      console.log('\n❌ No new cafes added. Exiting...');
      return;
    }

    console.log(`\n✅ Finished adding cafes. Total new cafes: ${newlyInitializedCafes.length}`);
    
    // Combine with existing data
    const combinedData = [...masterCafes, ...newlyInitializedCafes];
    console.log(`Total cafes in combined data: ${combinedData.length}`);

    // Save locally
    const localFilePath = await saveJsonToFile(combinedData, OUTPUT_JSON_FILENAME);

    // Upload to S3
    await uploadToS3(localFilePath, S3_TARGET_DATA_KEY, s3Client);

    // Summary
    console.log('\n🎉 Summary:');
    console.log(`  • Added ${newlyInitializedCafes.length} new skeleton cafe(s)`);
    console.log(`  • Combined with ${masterCafes.length} existing cafes`);
    console.log(`  • Saved locally: ${OUTPUT_JSON_FILENAME}`);
    console.log(`  • Uploaded to S3: s3://${S3_BUCKET_NAME}/${S3_TARGET_DATA_KEY}`);
    
    console.log('\n📝 New cafes added:');
    newlyInitializedCafes.forEach((cafe, index) => {
      console.log(`  ${index + 1}. ${cafe.name} (${cafe.placeId}) - Region: ${cafe.region}`);
    });

    console.log('\n✨ Done! You can now proceed with image uploads and static map generation.');

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
  searchCafe,
  createSkeletonCafeObject,
  getRegionFromArea
}; 