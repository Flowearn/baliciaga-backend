const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 获取配置信息
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'baliciaga-database';
const LOCAL_IMAGE_BASE_DIR = path.resolve(__dirname, '../../cafe_images');
const MASTER_DATA_JSON_PATH = path.resolve(__dirname, './canggu_cafe_final_merged.json');
const OUTPUT_JSON_PATH = path.resolve(__dirname, './canggu_cafe_prod_ready.json');
const S3_IMAGE_BASE_URL = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`;

// 初始化S3客户端 (仅用于验证S3凭证)
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// 辅助函数：清理文件夹名称
function sanitizeFolderName(name) {
  if (!name || typeof name !== 'string') {
    return 'unknown-cafe'; // 如果名称无效，返回默认值
  }
  let sanitized = name.toLowerCase(); // 转为小写
  sanitized = sanitized.replace(/\s+/g, '-'); // 将一个或多个连续空格替换为单个连字符
  sanitized = sanitized.replace(/[^\w-]+/g, ''); // 移除所有非单词字符 (字母、数字、下划线) 和非连字符的字符
                                                  // 注意：\w 包含下划线。如果不想保留下划线，可以用 [^a-z0-9-]
  sanitized = sanitized.replace(/-+/g, '-'); // 将一个或多个连续连字符替换为单个连字符
  sanitized = sanitized.replace(/^-+|-+$/g, ''); // 移除开头和结尾的连字符
  sanitized = sanitized.substring(0, 50); // 限制最大长度

  if (sanitized === '' || sanitized === '-') {
    return 'unknown-cafe'; // 如果处理后为空或只有一个连字符，返回默认值
  }
  return sanitized;
}

// 辅助函数：延迟执行 (仅保留用于日志显示)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 获取文件的Content-Type (保留用于类型检查)
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
    default:
      return 'application/octet-stream';
  }
}

// 辅助函数：提取文件名后缀并排序
function sortImageFiles(imageFiles) {
  return imageFiles.sort((fileA, fileB) => {
    // 尝试从文件名中提取出 photo_ 后缀
    const suffixRegex = /photo_([a-zA-Z0-9]+)\./;
    const matchA = fileA.match(suffixRegex);
    const matchB = fileB.match(suffixRegex);
    
    if (!matchA || !matchB) {
      // 如果一个文件不符合pattern，按原始文件名排序
      return fileA.localeCompare(fileB);
    }
    
    const suffixA = matchA[1];
    const suffixB = matchB[1];
    
    // 规则1: 字母后缀排在数字后缀之前
    const isLetterA = /^[a-zA-Z]+$/.test(suffixA);
    const isLetterB = /^[a-zA-Z]+$/.test(suffixB);
    
    if (isLetterA && !isLetterB) {
      return -1; // 字母排在数字前面
    }
    
    if (!isLetterA && isLetterB) {
      return 1; // 数字排在字母后面
    }
    
    // 规则2: 如果都是字母，按字母顺序排序
    if (isLetterA && isLetterB) {
      return suffixA.localeCompare(suffixB);
    }
    
    // 规则3: 如果都是数字，按数值大小排序
    return parseInt(suffixA, 10) - parseInt(suffixB, 10);
  });
}

// 主执行函数
async function main() {
  try {
    // 读取咖啡馆数据
    console.log(`读取主数据文件: ${MASTER_DATA_JSON_PATH}`);
    const cafeDataRaw = await fsPromises.readFile(MASTER_DATA_JSON_PATH, 'utf8');
    const cafesData = JSON.parse(cafeDataRaw);
    console.log(`共读取了 ${cafesData.length} 个咖啡馆数据`);
    
    // 记录所有源JSON中的placeIds
    const sourcePlaceIds = cafesData.map(cafe => cafe.placeId);
    console.log(`源JSON文件中包含的Place IDs总数: ${sourcePlaceIds.length}`);
    
    // 准备更新后的咖啡馆数据
    const updatedCafesData = [];
    
    // 创建一个映射，用于存储每个placeId对应的图片文件名列表
    const cafeImagesMap = {};
    
    // 遍历本地咖啡馆图片目录
    console.log(`\n遍历本地咖啡馆图片目录: ${LOCAL_IMAGE_BASE_DIR}`);
    let cafeFolders;
    try {
      cafeFolders = await fsPromises.readdir(LOCAL_IMAGE_BASE_DIR);
      console.log(`在 ${LOCAL_IMAGE_BASE_DIR} 下找到了 ${cafeFolders.length} 个文件夹`);
    } catch (error) {
      console.error(`读取目录失败: ${error.message}`);
      return;
    }
    
    // 构建cafeImagesMap (不再上传图片)
    console.log('\n开始构建图片文件映射...');
    let processedCafes = 0;
    
    // 遍历每个咖啡馆文件夹
    for (const cafeFolder of cafeFolders) {
      const cafeFolderPath = path.join(LOCAL_IMAGE_BASE_DIR, cafeFolder);
      
      // 确保是目录
      const stats = await fsPromises.stat(cafeFolderPath);
      if (!stats.isDirectory()) {
        console.log(`跳过非目录项: ${cafeFolder}`);
        continue;
      }
      
      console.log(`\n正在扫描本地文件夹: ${cafeFolderPath}`);
      const originalFolderName = cafeFolder; // 记录原始文件夹名
      
      // 使用基于"ChIJ"标记的方法提取placeId
      let extractedPlaceId = null;
      let extractedSanitizedNamePart = originalFolderName; // 默认为完整文件夹名
      
      const placeIdMarker = "_ChIJ"; // 我们用 "_ChIJ" 作为 placeId 开始的明确标记
      const markerIndex = originalFolderName.lastIndexOf(placeIdMarker);
      
      if (markerIndex !== -1) {
        // 提取从 "ChIJ" (不包括前面的 "_") 开始的部分作为 placeId
        extractedPlaceId = originalFolderName.substring(markerIndex + 1); // +1 是为了去掉分隔符 "_"
        // 提取标记之前的部分作为处理过的名称部分
        extractedSanitizedNamePart = originalFolderName.substring(0, markerIndex);
        console.log(`  - 从文件夹名 "${originalFolderName}" 中提取的 placeId: ${extractedPlaceId}`);
        console.log(`  - 提取的处理后名称部分: ${extractedSanitizedNamePart}`);
      } else {
        // 如果找不到 "_ChIJ"，可能文件夹命名不规范，记录警告
        console.warn(`  警告：文件夹名称 "${originalFolderName}" 不符合预期的 _{placeId} 格式 (未能找到 '_ChIJ' 标记)，将跳过此文件夹。`);
        continue; // 跳过这个文件夹的处理
      }
      
      if (!extractedPlaceId) {
        console.warn(`  警告：无法从文件夹名称 "${originalFolderName}" 中有效提取placeId，跳过此文件夹。`);
        continue; // 跳过这个文件夹的处理
      }
      
      // 检查提取的placeId是否在源JSON中存在
      const existsInSource = sourcePlaceIds.includes(extractedPlaceId);
      console.log(`  - 此placeId ${existsInSource ? '存在于' : '不存在于'}源JSON文件中`);
      
      // 读取该咖啡馆文件夹下的所有图片
      try {
        const allFilesInFolder = await fsPromises.readdir(cafeFolderPath);
        console.log(`    - 文件夹 "${originalFolderName}" 下找到的原始文件列表: ${allFilesInFolder.join(', ')}`);
        
        // 定义有效的图片扩展名
        const validImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        
        // 筛选出有效的图片文件，排除 .DS_Store 等非图片文件
        const imageFiles = allFilesInFolder.filter(fileName => {
          if (fileName.toLowerCase() === '.ds_store' || fileName.startsWith('.')) {
            console.log(`  跳过隐藏文件: ${fileName}`);
            return false; // 排除 .DS_Store 和其他以点开头的隐藏文件
          }
          const ext = path.extname(fileName).toLowerCase();
          const isValidImage = validImageExtensions.includes(ext);
          if (!isValidImage) {
            console.log(`  跳过非图片文件: ${fileName}`);
          }
          return isValidImage;
        });
        
        console.log(`    - 可用的有效图片文件 (${imageFiles.length} 个): ${imageFiles.join(', ')}`);
        
        // 将当前咖啡馆的图片文件名列表存储到映射中
        if (imageFiles.length > 0) {
          cafeImagesMap[extractedPlaceId] = imageFiles;
          processedCafes++;
          console.log(`    - 已为 placeId: ${extractedPlaceId} 在 cafeImagesMap 中记录了 ${imageFiles.length} 张图片`);
        } else {
          console.log(`    - 警告: 未找到有效图片文件，不为 ${extractedPlaceId} 添加cafeImagesMap记录`);
        }
        
      } catch (error) {
        console.error(`  读取咖啡馆图片文件失败 ${cafeFolder}: ${error.message}`);
      }
    }
    
    console.log(`\n图片映射构建完成。共处理了 ${processedCafes} 个咖啡馆文件夹`);
    
    // 打印cafeImagesMap中的所有placeIds
    const mappedPlaceIds = Object.keys(cafeImagesMap);
    console.log(`\ncafeImagesMap中存储的placeIds (${mappedPlaceIds.length} 个)`);
    
    // 更新咖啡馆数据中的图片链接
    console.log('\n开始更新咖啡馆数据中的图片链接...');
    
    // 遍历原始咖啡馆数据，更新图片链接
    for (const originalCafe of cafesData) {
      const { placeId, name } = originalCafe;
      console.log(`\n  正在为JSON中的咖啡馆 "${name}" (ID: ${placeId}) 更新图片链接...`);
      
      // 创建一个新的对象副本，保留所有原始字段
      const updatedCafe = { ...originalCafe };
      
      const sanitizedName = sanitizeFolderName(name);
      const cafeFolderInImages = `${sanitizedName}_${placeId}`;
      const s3ImageFolderPrefix = `image/${cafeFolderInImages}/`;
      
      console.log(`  - 预期本地文件夹名称: ${cafeFolderInImages}`);
      
      // 如果该咖啡馆在cafeImagesMap中有图片记录
      if (cafeImagesMap[placeId] && cafeImagesMap[placeId].length > 0) {
        console.log(`    - 成功在 cafeImagesMap 中为 placeId: ${placeId} 找到了图片记录。`);
        const imageFiles = cafeImagesMap[placeId];
        
        // 对图片文件进行排序：字母后缀优先于数字后缀
        const sortedImageFiles = sortImageFiles(imageFiles);
        
        // 更新photos数组为S3上的图片URL
        updatedCafe.photos = sortedImageFiles.map(imageFile => {
          return `${S3_IMAGE_BASE_URL}${s3ImageFolderPrefix}${imageFile}`;
        });
        
        console.log(`  已更新 ${name} (placeId: ${placeId}) 的 ${updatedCafe.photos.length} 张图片链接，并按字母后缀优先于数字后缀排序`);
      } else {
        // 如果没有找到图片记录，保留原始photos数组
        console.warn(`    - 警告: 在 cafeImagesMap 中未找到 placeId: ${placeId} ("${name}") 的图片记录，将保留原始photos数组。`);
        // 检查是否有本地文件夹匹配
        const matchingFolders = cafeFolders.filter(folder => folder.includes(placeId));
        if (matchingFolders.length > 0) {
          console.log(`    - 提示: 检测到可能匹配此placeId的本地文件夹: ${matchingFolders.join(', ')}`);
        }
      }
      
      updatedCafesData.push(updatedCafe);
    }
    
    // 保存更新后的咖啡馆数据
    console.log(`\n正在保存更新后的咖啡馆数据到: ${OUTPUT_JSON_PATH}`);
    await fsPromises.writeFile(
      OUTPUT_JSON_PATH,
      JSON.stringify(updatedCafesData, null, 2),
      'utf8'
    );
    
    console.log(`\n数据保存完成！更新后的咖啡馆数据包含 ${updatedCafesData.length} 个咖啡馆信息`);
    const updatedWithPhotos = updatedCafesData.filter(cafe => Array.isArray(cafe.photos) && cafe.photos.length > 0).length;
    console.log(`已成功更新 ${updatedWithPhotos} 个咖啡馆的图片链接 (${updatedCafesData.length - updatedWithPhotos} 个未更新)`);
    
    // 检查哪些JSON中的placeId没有被更新
    const notUpdatedPlaceIds = sourcePlaceIds.filter(id => !cafeImagesMap[id]);
    if (notUpdatedPlaceIds.length > 0) {
      console.log(`\n以下 ${notUpdatedPlaceIds.length} 个placeIds在JSON中存在但未被更新图片链接:`);
      notUpdatedPlaceIds.forEach(id => {
        const cafe = cafesData.find(c => c.placeId === id);
        console.log(`  - ${cafe.name} (${id})`);
      });
    }
    
  } catch (error) {
    console.error(`执行过程中出错: ${error.message}`);
    console.error(error.stack);
  }
}

// 执行主函数
main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
}); 