const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');

// Load environment variables from .env file located in the parent directory (backend/.env)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- USER CONFIGURATION ---
// Please fill in this array with the details of the photos you want to upload.
// For each photo, specify:
// - localFilePath: The full absolute path to the image file on your computer.
// - s3CafeSubFolder: The name of the subfolder within the S3 bucket\'s \'image/\' directory 
//                    where this photo should be uploaded. This usually follows the
//                    pattern \'cafe-name_placeId\'.
// - s3FileName: The desired filename for the image once it\'s on S3 (e.g., \'photo_a.jpg\').
// 
// Example:
// { 
//   localFilePath: "/Users/yourusername/Desktop/my_images/cool_cafe_pic.jpg", 
//   s3CafeSubFolder: "cool-cafe-name_ChIJ12345ABCDEF", 
//   s3FileName: "photo_main.jpg" 
// },
// { 
//   localFilePath: "/Users/yourusername/Downloads/another_view.png", 
//   s3CafeSubFolder: "another-great-spot_ChIJ67890GHIJKL",
//   s3FileName: "view_from_window.png"
// }
// 
// Add your 2-4 images for 2 restaurants here:
const PHOTOS_TO_UPLOAD = [
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_1.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_1.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_2.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_2.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_6.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_6.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_9.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_9.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_10.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_10.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_a.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_a.jpg" 
      },
      { 
        localFilePath: "/Users/troy/开发文档/Baliciaga/cafe_images/desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI/photo_b.jpg", 
        s3CafeSubFolder: "desa-kitsun_ChIJ9UCFSPE50i0RVVADcFGCGXI", 
        s3FileName: "photo_b.jpg" 
      },
];
// --- END OF USER CONFIGURATION ---

// AWS and S3 Configuration
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'baliciaga-database';

// Validate essential S3 configuration
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("Error: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in the .env file.");
  process.exit(1);
}
if (!S3_BUCKET_NAME) {
  console.error("Error: S3_BUCKET_NAME must be set in the .env file or in the script.");
  process.exit(1);
}

// Initialize S3 Client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Determines the Content-Type of a file based on its extension.
 * @param {string} filePath - The path to the file.
 * @returns {string} The MIME content type.
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    default:
      console.warn(`    [Warning] Unknown extension ${ext} for file ${filePath}. Defaulting to application/octet-stream.`);
      return 'application/octet-stream';
  }
}

/**
 * Delays execution for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main function to upload photos.
 */
async function main() {
  console.log(`Starting upload of user-specified photos to S3 bucket: ${S3_BUCKET_NAME}...`);

  if (PHOTOS_TO_UPLOAD.length === 0) {
    console.error("Error: The PHOTOS_TO_UPLOAD array is empty. Please configure it with the images you want to upload.");
    console.log("Script will now exit. Please edit the PHOTOS_TO_UPLOAD array in the script.");
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const photo of PHOTOS_TO_UPLOAD) {
    const { localFilePath, s3CafeSubFolder, s3FileName } = photo;

    if (!localFilePath || !s3CafeSubFolder || !s3FileName) {
      console.error(`  [Skipped] Invalid configuration for an entry: ${JSON.stringify(photo)}. Please ensure localFilePath, s3CafeSubFolder, and s3FileName are provided.`);
      errorCount++;
      continue;
    }

    console.log(`  Preparing to upload: "${localFilePath}" to S3 path: image/${s3CafeSubFolder}/${s3FileName}`);

    try {
      // Check if local file exists
      await fsPromises.access(localFilePath, fs.constants.F_OK);
    } catch (err) {
      console.error(`    [Error] Local file not found: ${localFilePath}. Skipping this file.`);
      errorCount++;
      continue;
    }

    const s3Key = `image/${s3CafeSubFolder}/${s3FileName}`;

    try {
      const fileContent = await fsPromises.readFile(localFilePath);
      const contentType = getContentType(localFilePath);

      const uploadParams = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
        // ACL: 'public-read' // ACL is explicitly NOT set, as per bucket policy.
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      console.log(`    [Success] Successfully uploaded: s3://${S3_BUCKET_NAME}/${s3Key}`);
      successCount++;

      // Optional delay to avoid overwhelming S3 or network, especially for many files.
      // await delay(150); // e.g., 150ms delay

    } catch (uploadError) {
      console.error(`    [Error] Failed to upload ${localFilePath} to ${s3Key}: ${uploadError.message}`);
      console.error("      Full error details:", uploadError);
      errorCount++;
    }
  }

  console.log(`\n--- Upload Summary ---`);
  console.log(`Successfully uploaded: ${successCount} file(s).`);
  console.log(`Failed or skipped: ${errorCount} file(s).`);
  console.log("Script execution finished.");
}

// Execute the main function
main().catch(err => {
  console.error("An unexpected error occurred during script execution:", err);
  process.exit(1);
}); 