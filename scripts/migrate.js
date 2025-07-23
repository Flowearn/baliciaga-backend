// migrate.js

const { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs").promises;
const path = require("path");

// =======================================================================
// --- ⚙️ 配置区 (用户每次仅需修改这里) ---
// =======================================================================

// 1. 设置演习模式
//    true:  只打印日志，不修改任何文件。
//    false: 真实执行S3文件移动和本地JSON文件写入。
const DRY_RUN = false;

// 2. 输入要处理的【本地JSON文件名】
//    请确保此文件与本脚本位于同一目录下。
const LOCAL_JSON_FILENAME = 'dining-v3-dev.json'; // <--- 变量1：修改为您要处理的文件名

// 3. 输入本次迁移的【S3总分类相册前缀】
//    这个前缀将同时用于解析临时相册和官方相册的路径。
const S3_CATEGORY_PREFIX = 'dining-image-dev/'; // <--- 变量2：修改为对应的S3图片前缀

// 4. S3存储桶信息
const BUCKET_NAME = "baliciaga-database"; // S3存储桶固定名称
const s3Client = new S3Client({ region: "ap-southeast-1" }); // S3存储桶区域

// =======================================================================
// --- 脚本核心逻辑 (无需修改) ---
// =======================================================================

const LOCAL_JSON_FILE_PATH = path.join(__dirname, LOCAL_JSON_FILENAME);

/**
 * 从完整的S3 URL中提取相册名称
 */
function extractAlbumFromUrl(url, prefix) {
    try {
        const urlPath = new URL(url).pathname;
        const relevantPart = urlPath.substring(urlPath.indexOf(prefix));
        const parts = relevantPart.replace(prefix, '').split('/');
        return parts[0] || null;
    } catch (e) {
        return null;
    }
}

/**
 * 主执行函数
 */
async function main() {
    console.log(`\n===== 开始执行相册迁移脚本 =====`);
    console.log(`!!! 当前模式: ${DRY_RUN ? '演习 (DRY RUN) ⛑️' : '正式执行 (LIVE RUN) 🔥'} !!!`);
    console.log(`- 目标文件: ${LOCAL_JSON_FILENAME}`);
    console.log(`- S3前缀:  ${S3_CATEGORY_PREFIX}\n`);

    if (DRY_RUN) {
        console.log("提示: 当前为演习模式，S3和本地文件都不会被实际修改。\n");
    }

    let data;
    try {
        const fileContent = await fs.readFile(LOCAL_JSON_FILE_PATH, "utf-8");
        data = JSON.parse(fileContent);
    } catch (e) {
        console.error(`❌ 读取或解析本地JSON文件失败: ${LOCAL_JSON_FILE_PATH}`, e);
        return;
    }

    const pairsToMigrate = new Map();
    for (const place of data) {
        const hasPhotos = place.photos && Array.isArray(place.photos) && place.photos.length > 0;
        const hasStaticMap = place.staticMapS3Url;

        if (hasPhotos && hasStaticMap) {
            const unofficialAlbum = extractAlbumFromUrl(place.photos[0], S3_CATEGORY_PREFIX);
            const officialAlbum = extractAlbumFromUrl(place.staticMapS3Url, S3_CATEGORY_PREFIX);

            if (unofficialAlbum && officialAlbum && unofficialAlbum !== officialAlbum) {
                if (!pairsToMigrate.has(unofficialAlbum)) {
                    pairsToMigrate.set(unofficialAlbum, officialAlbum);
                    console.log(`[配对成功] 商户: "${place.name}"`);
                    console.log(`  - 临时相册: ${unofficialAlbum}`);
                    console.log(`  - 官方相册: ${officialAlbum}\n`);
                }
            }
        }
    }
    
    if (pairsToMigrate.size === 0) {
        console.log("在此文件中没有找到需要迁移的相册。\n===== 脚本执行完毕 =====\n");
        return;
    }

    for (const [unofficial, official] of pairsToMigrate.entries()) {
        await migrateS3Files(unofficial, official);
    }

    let wasModified = false;
    for (const place of data) {
         if (place.photos && Array.isArray(place.photos) && place.photos.length > 0) {
            const albumName = extractAlbumFromUrl(place.photos[0], S3_CATEGORY_PREFIX);
            if (pairsToMigrate.has(albumName)) {
                const officialAlbum = pairsToMigrate.get(albumName);
                console.log(`  [JSON更新] 正在更新商户 "${place.name}" 的图片路径...`);
                place.photos = place.photos.map(url => url.replace(`/${albumName}/`, `/${officialAlbum}/`));
                wasModified = true;
            }
        }
    }
    
    if (wasModified) {
        console.log(`\n  -> JSON对象已更新，准备写回本地文件...`);
        if (!DRY_RUN) {
            try {
                const newContent = JSON.stringify(data, null, 2);
                await fs.writeFile(LOCAL_JSON_FILE_PATH, newContent, 'utf-8');
                console.log(`  ✅ 本地JSON文件写入成功: ${LOCAL_JSON_FILE_PATH}`);
            } catch (e) {
                console.error(`  ❌ 本地JSON文件写入失败:`, e);
            }
        }
    } else {
         console.log("\n  -> JSON数据无需修改。");
    }

    console.log(`\n===== 脚本执行完毕 =====\n`);
}

/**
 * S3文件迁移函数
 */
async function migrateS3Files(unofficialAlbum, officialAlbum) {
    console.log(`    [S3操作] 准备将 "${unofficialAlbum}" 中的文件移动到 "${officialAlbum}"...`);
    const sourcePrefix = `${S3_CATEGORY_PREFIX}${unofficialAlbum}/`;
    const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: sourcePrefix });
    const filesToMove = await s3Client.send(listCommand);

    if (!filesToMove.Contents || filesToMove.Contents.length === 0) {
        console.log("      -> 临时相册为空，无需移动。");
        return;
    }
    
    for (const file of filesToMove.Contents) {
        const sourceKey = file.Key;
        if(sourceKey.endsWith('/')) continue;

        const fileName = path.basename(sourceKey);
        const destKey = `${S3_CATEGORY_PREFIX}${officialAlbum}/${fileName}`;
        
        console.log(`      - 计划移动: ${sourceKey} -> ${destKey}`);

        if (!DRY_RUN) {
            try {
                await s3Client.send(new CopyObjectCommand({ Bucket: BUCKET_NAME, CopySource: `/${BUCKET_NAME}/${sourceKey}`, Key: destKey }));
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: sourceKey }));
            } catch(e) { console.error(`        ❌ 移动失败:`, e); }
        }
    }
    
    if(!DRY_RUN && filesToMove.Contents.length > 0){
        try {
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: sourcePrefix }));
            console.log(`      ✅ 已删除空的临时文件夹: ${sourcePrefix}`);
        } catch(e) { console.error(`      ❌ 删除空的临时文件夹失败:`, e); }
    }
}

// 启动脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    main,
    migrateS3Files,
    extractAlbumFromUrl
};