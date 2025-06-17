// backend/src/features/users/getProfilePictureUploadUrl.js

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require('uuid');
const { getAuthenticatedUser } = require('../../utils/authUtils'); // <-- 关键修复：导入认证工具

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.PROFILE_PICTURES_BUCKET_NAME;

exports.handler = async (event) => {
    // --- 关键修复：使用统一的工具来获取用户身份 ---
    const claims = getAuthenticatedUser(event);
    if (!claims || !claims.sub) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "Unauthorized" }),
        };
    }
    const userId = claims.sub; // Use the Cognito sub as the unique identifier
    // ----------------------------------------------------

    try {
        const { fileName, fileType } = JSON.parse(event.body);
        if (!fileName || !fileType) {
            return { statusCode: 400, body: JSON.stringify({ message: "fileName and fileType are required." })};
        }

        const fileExtension = fileName.split('.').pop();
        const uniqueKey = `avatars/${userId}/${uuidv4()}.${fileExtension}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: uniqueKey,
            ContentType: fileType
            // 移除ACL设置，因为bucket不支持ACL，依赖bucket policy实现public read
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // URL expires in 5 minutes

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                data: {
                    uploadUrl,
                    finalUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/${uniqueKey}`
                }
            })
        };
    } catch (error) {
        console.error("Error generating profile picture upload URL:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" })
        };
    }
}; 