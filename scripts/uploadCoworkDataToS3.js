const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getConfig } = require('../src/utils/appConfig');

async function uploadCoworkDataToS3() {
  try {
    // Get configuration
    const config = await getConfig();
    const S3_BUCKET_NAME = config.S3_BUCKET_NAME;
    const S3_REGION = config.AWS_REGION;

    // Initialize S3 client
    const s3Client = new S3Client({ region: S3_REGION });

    // Read the cowork-dev.json file
    const coworkDataPath = path.join(__dirname, 'cowork-dev.json');
    const coworkData = await fs.readFile(coworkDataPath, 'utf-8');
    
    console.log('📖 Read cowork-dev.json file successfully');

    // Upload to S3
    const uploadParams = {
      Bucket: S3_BUCKET_NAME,
      Key: 'data/cowork-dev.json',
      Body: coworkData,
      ContentType: 'application/json'
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    console.log('✅ Successfully uploaded cowork-dev.json to S3');
    console.log(`📍 S3 location: s3://${S3_BUCKET_NAME}/data/cowork-dev.json`);

  } catch (error) {
    console.error('❌ Error uploading cowork data to S3:', error);
    process.exit(1);
  }
}

// Run the upload
uploadCoworkDataToS3();