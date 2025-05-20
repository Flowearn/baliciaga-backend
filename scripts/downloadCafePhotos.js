const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Load .env file from project root
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const INPUT_JSON_PATH = path.join(__dirname, './canggu_cafe_enriched.json');
const BASE_OUTPUT_IMAGE_DIR = path.resolve(__dirname, '../../cafe_images'); // Resolves to project_root/cafe_images
const DELAY_BETWEEN_PHOTO_DOWNLOADS_MS = 200;
const MAX_PHOTOS_PER_CAFE = 0; // Set to 0 to download all photos

/**
 * Sanitizes a cafe name to be suitable for a folder name.
 * - Converts to lowercase.
 * - Replaces spaces and multiple hyphens with a single hyphen.
 * - Removes non-alphanumeric characters (except hyphens).
 * - Limits length.
 * - Returns a default name if the result is empty.
 * @param {string} name The original cafe name.
 * @returns {string} The sanitized folder name.
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
 * Delays execution for a specified number of milliseconds.
 * @param {number} ms The number of milliseconds to delay.
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function to process cafes and download photos.
 */
async function main() {
  console.log('Starting photo download script...');

  // 1. Read and parse the JSON file
  let cafes;
  try {
    const jsonData = await fsp.readFile(INPUT_JSON_PATH, 'utf8');
    cafes = JSON.parse(jsonData);
    if (!Array.isArray(cafes)) {
      console.error('Error: Input JSON is not an array. Exiting.');
      return;
    }
    console.log(`Successfully read and parsed ${cafes.length} cafe entries from ${INPUT_JSON_PATH}`);
  } catch (error) {
    console.error(`Error reading or parsing ${INPUT_JSON_PATH}: ${error.message}`);
    return;
  }

  // 2. Ensure base output directory exists
  try {
    await fsp.mkdir(BASE_OUTPUT_IMAGE_DIR, { recursive: true });
    console.log(`Base image directory ensured at: ${BASE_OUTPUT_IMAGE_DIR}`);
  } catch (error) {
    console.error(`Error creating base image directory ${BASE_OUTPUT_IMAGE_DIR}: ${error.message}`);
    return;
  }

  // 3. Iterate through cafes
  for (const cafe of cafes) {
    const placeId = cafe.placeId;
    const cafeName = cafe.name || 'Unknown Cafe';
    const photos = cafe.photos;

    if (!placeId || typeof placeId !== 'string' || placeId.trim() === '') {
      console.warn(`Skipping cafe with invalid or missing placeId: ${JSON.stringify(cafe)}`);
      continue;
    }
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      console.warn(`Skipping cafe [ID: ${placeId}] (${cafeName}) due to missing or empty photos array.`);
      continue;
    }

    // Create subdirectory for this cafe
    const sanitizedName = sanitizeFolderName(cafeName);
    const cafeFolderName = `${sanitizedName}_${placeId}`;
    const cafeImageDir = path.join(BASE_OUTPUT_IMAGE_DIR, cafeFolderName);

    try {
      await fsp.mkdir(cafeImageDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating directory ${cafeImageDir} for cafe [ID: ${placeId}]: ${error.message}`);
      continue; // Skip to next cafe if directory creation fails
    }

    console.log(`\nProcessing cafe [ID: ${placeId}] (Name: ${cafeName})`);
    console.log(`Output directory: ${cafeImageDir}`);

    const photosToDownload = MAX_PHOTOS_PER_CAFE > 0 ? photos.slice(0, MAX_PHOTOS_PER_CAFE) : photos;

    for (let i = 0; i < photosToDownload.length; i++) {
      const photoUrl = photosToDownload[i];
      const photoIndex = i;
      const photoFileName = `photo_${photoIndex + 1}.jpg`;
      const outputPhotoPath = path.join(cafeImageDir, photoFileName);

      // Check if photo already exists
      if (fs.existsSync(outputPhotoPath)) {
        console.log(`  Photo ${photoFileName} already exists. Skipping download.`);
        continue;
      }
      
      console.log(`  Downloading photo ${photoIndex + 1}/${photosToDownload.length} from ${photoUrl} ...`);

      try {
        const response = await axios({
          method: 'get',
          url: photoUrl,
          responseType: 'stream',
        });

        const writer = fs.createWriteStream(outputPhotoPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log(`    Successfully saved ${photoFileName}`);
        
        if (DELAY_BETWEEN_PHOTO_DOWNLOADS_MS > 0) {
          await delay(DELAY_BETWEEN_PHOTO_DOWNLOADS_MS);
        }

      } catch (downloadError) {
        console.error(`    Error downloading photo ${photoUrl} for cafe [ID: ${placeId}]: ${downloadError.message}`);
        // Optionally, clean up partially downloaded file if any
        if (fs.existsSync(outputPhotoPath)) {
          try {
            await fsp.unlink(outputPhotoPath);
          } catch (cleanupError) {
            console.error(`    Error cleaning up partially downloaded file ${outputPhotoPath}: ${cleanupError.message}`);
          }
        }
      }
    }
  }

  console.log('\n------------------------------------');
  console.log('Photo download script finished.');
  console.log('------------------------------------');
}

// Execute the main function
main().catch(error => {
  console.error("An unexpected error occurred in the main execution:", error);
}); 