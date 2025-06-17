const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const STAGE = process.env.STAGE || 'dev';
const BUCKET_NAME = `baliciaga-listing-images-${STAGE}`;
const REGION = 'ap-southeast-1';

// Initialize S3 client
const s3Client = new S3Client({
  region: REGION,
});

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const { fileName, fileType } = body;

    // Validate input
    if (!fileName || !fileType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'fileName and fileType are required',
          },
        }),
      };
    }

    // Validate file type (only allow image types)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(fileType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'Only JPEG, PNG, and WebP images are allowed',
          },
        }),
      };
    }

    // Generate unique file key
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const imageKey = `listings/${uniqueFileName}`;

    // Create PutObject command
    const putObjectCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey,
      ContentType: fileType,
    });

    // Generate presigned URL (valid for 5 minutes)
    const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, { 
      expiresIn: 300 
    });

    // Generate the final public URL (without query parameters)
    const publicUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${imageKey}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          uploadUrl,
          imageUrl: publicUrl,
          imageKey,
        },
      }),
    };

  } catch (error) {
    console.error('Error generating upload URL:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: {
          message: 'Failed to generate upload URL',
          details: error.message,
        },
      }),
    };
  }
};

module.exports = { handler }; 