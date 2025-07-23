// fix-metology-typo.js
// 修正MEATOLOGY商家的拼写错误相册名称

const { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

// S3配置
const BUCKET_NAME = "baliciaga-database";
const s3Client = new S3Client({ region: "ap-southeast-1" });

// 相册配置
const SOURCE_PATH = "dining-image-dev/metology/"; // 错误的拼写
const TARGET_PATH = "dining-image-dev/meatology-by-seventeen_ChIJwfbGMwA50i0RQOGKs3eock4/"; // 正确的官方相册

async function fixMetologyTypo() {
    console.log("\n===== 开始修正MEATOLOGY相册拼写错误 =====");
    console.log(`- 源路径: ${SOURCE_PATH}`);
    console.log(`- 目标路径: ${TARGET_PATH}\n`);

    try {
        // 1. 列出源相册中的所有文件
        console.log("1. 检查源相册中的文件...");
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: SOURCE_PATH
        });
        const response = await s3Client.send(listCommand);

        if (!response.Contents || response.Contents.length === 0) {
            console.log("   ⚠️  源相册为空，没有文件需要移动。");
            return;
        }

        console.log(`   ✓ 找到 ${response.Contents.length} 个文件\n`);

        // 2. 移动每个文件
        console.log("2. 开始移动文件...");
        for (const file of response.Contents) {
            const sourceKey = file.Key;
            
            // 跳过目录本身
            if (sourceKey.endsWith('/')) continue;

            const fileName = path.basename(sourceKey);
            const destKey = `${TARGET_PATH}${fileName}`;

            console.log(`   移动: ${fileName}`);
            console.log(`   从: ${sourceKey}`);
            console.log(`   到: ${destKey}`);

            try {
                // 复制文件到新位置
                await s3Client.send(new CopyObjectCommand({
                    Bucket: BUCKET_NAME,
                    CopySource: `/${BUCKET_NAME}/${sourceKey}`,
                    Key: destKey
                }));

                // 删除原文件
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: sourceKey
                }));

                console.log(`   ✓ 成功\n`);
            } catch (error) {
                console.error(`   ✗ 移动失败: ${error.message}\n`);
            }
        }

        // 3. 删除空的源文件夹
        console.log("3. 删除空的源文件夹...");
        try {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: SOURCE_PATH
            }));
            console.log(`   ✓ 已删除: ${SOURCE_PATH}`);
        } catch (error) {
            console.log(`   ⚠️  删除文件夹失败（可能已经不存在）: ${error.message}`);
        }

        console.log("\n✅ 修正完成！所有文件已从 'metology' 移动到正确的官方相册。");

    } catch (error) {
        console.error("\n❌ 执行过程中出错:", error.message);
    }
}

// 执行修正
fixMetologyTypo();