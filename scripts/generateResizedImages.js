/**
 * 图片批量缩放脚本
 * 
 * 此脚本用于将正方形图片（已由 cropImagesToSquare.js 处理过）生成多种指定尺寸的缩放版本。
 * 缩放后的图片使用无损WebP压缩保存，以保证最高画质。
 * 
 * 输入: photo_webp/ 目录中的正方形图片
 * 输出: photo_webp_resized/ 目录，按尺寸组织子文件夹 (1080/, 1200/)
 * 
 * WebP输出设置: { lossless: true, quality: 100 } - 无损压缩，最高质量
 */

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

// ==================== 配置常量 ====================
const INPUT_IMAGE_DIR = path.resolve(__dirname, '../../photo_webp');
const OUTPUT_BASE_DIR = path.resolve(__dirname, '../../photo_webp_resized');
const TARGET_SIZES = [1080, 1200];
const VALID_IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'];
const STATIC_MAP_SUFFIX = '_static.webp';

// 🔸 关键配置: WebP无损压缩设置，确保最高画质
const WEBP_OUTPUT_OPTIONS = {
  lossless: true,  // 启用无损压缩
  quality: 100     // 最高质量
};

// 统计信息
let stats = {
  totalScanned: 0,
  totalSkippedStaticMaps: 0,
  totalSourceImages: 0,
  totalGenerated: 0,
  totalSkippedExisting: 0,
  totalSkippedSmallSource: 0,  // 🔸 新增: 因源图尺寸不足而跳过的计数
  totalErrors: 0,
  errors: [],
  generatedBySize: {},
  skippedSmallBySize: {}  // 🔸 新增: 按尺寸记录跳过的小图片数量
};

/**
 * 递归扫描目录获取所有有效图片文件
 * @param {string} directory - 要扫描的目录路径
 * @returns {Promise<string[]>} 有效图片文件路径数组
 */
async function getAllImageFilesRecursive(directory) {
  let imageFiles = [];
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // 递归扫描子目录
        const subDirImages = await getAllImageFilesRecursive(fullPath);
        imageFiles = imageFiles.concat(subDirImages);
      } else if (entry.isFile()) {
        // 跳过静态地图文件
        if (entry.name.endsWith(STATIC_MAP_SUFFIX)) {
          console.log(`  ➡️  Skipping static map: ${entry.name}`);
          stats.totalSkippedStaticMaps++;
          continue; 
        }
        
        // 检查是否为有效图片扩展名
        const ext = path.extname(entry.name).toLowerCase();
        if (VALID_IMAGE_EXTENSIONS.includes(ext)) {
          imageFiles.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directory}:`, error.message);
  }
  
  return imageFiles;
}

/**
 * 检查文件是否已存在
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 文件是否存在
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 为单张图片生成指定尺寸的缩放版本
 * @param {string} sourceImagePath - 源图片路径
 * @param {string} relativePath - 相对路径
 * @param {number} targetSize - 目标尺寸 (如1080表示1080x1080)
 */
async function generateResizedImage(sourceImagePath, relativePath, targetSize) {
  const fileName = path.basename(sourceImagePath);
  
  try {
    // 🔸 关键新增: 获取源图片尺寸信息
    const metadata = await sharp(sourceImagePath).metadata();
    const sourceWidth = metadata.width;
    
    if (!sourceWidth) {
      console.error(`    ❌ Cannot determine source image width for ${fileName}`);
      stats.totalErrors++;
      stats.errors.push({ 
        file: fileName, 
        size: targetSize, 
        error: 'Cannot determine source image width' 
      });
      return;
    }
    
    // 🔸 关键新增: 检查源图片尺寸是否满足缩放要求
    if (sourceWidth < targetSize) {
      console.log(`    ⏭️  源图片 ${fileName} (宽度 ${sourceWidth}px) 小于目标尺寸 ${targetSize}px，跳过生成此版本。`);
      stats.totalSkippedSmallSource++;
      if (!stats.skippedSmallBySize[targetSize]) {
        stats.skippedSmallBySize[targetSize] = 0;
      }
      stats.skippedSmallBySize[targetSize]++;
      return;
    }
    
    // 🔸 关键: 构造目标输出文件路径，保持目录结构
    const outputFilePath = path.join(OUTPUT_BASE_DIR, String(targetSize), relativePath);
    
    // 检查文件是否已存在，如果存在则跳过
    if (await fileExists(outputFilePath)) {
      console.log(`    ⏭️  Already exists: ${targetSize}x${targetSize} version of ${fileName}`);
      stats.totalSkippedExisting++;
      return;
    }
    
    // 🔸 关键: 创建目标目录结构
    const outputDir = path.dirname(outputFilePath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // 🔸 关键: 使用 Sharp 进行缩放并保存为无损WebP
    await sharp(sourceImagePath)
      .resize(targetSize, targetSize)  // 因为源图已是正方形，直接指定宽高
      .webp(WEBP_OUTPUT_OPTIONS)       // 使用无损WebP压缩设置
      .toFile(outputFilePath);
    
    console.log(`    ✅ Generated: ${targetSize}x${targetSize} -> ${outputFilePath} (from ${sourceWidth}x${sourceWidth})`);
    
    // 更新统计
    stats.totalGenerated++;
    if (!stats.generatedBySize[targetSize]) {
      stats.generatedBySize[targetSize] = 0;
    }
    stats.generatedBySize[targetSize]++;
    
  } catch (error) {
    console.error(`    ❌ Error generating ${targetSize}x${targetSize} for ${fileName}:`, error.message);
    stats.totalErrors++;
    stats.errors.push({ 
      file: fileName, 
      size: targetSize, 
      error: error.message 
    });
  }
}

/**
 * 处理单张源图片，为所有目标尺寸生成缩放版本
 * @param {string} sourceImagePath - 源图片完整路径
 * @param {number} index - 当前处理的图片索引
 * @param {number} total - 总图片数量
 */
async function processSourceImage(sourceImagePath, index, total) {
  const fileName = path.basename(sourceImagePath);
  const relativePath = path.relative(INPUT_IMAGE_DIR, sourceImagePath);
  
  console.log(`\n[${index + 1}/${total}] Processing: ${relativePath}`);
  
  // 🔸 关键: 为每个目标尺寸生成缩放版本
  for (const targetSize of TARGET_SIZES) {
    await generateResizedImage(sourceImagePath, relativePath, targetSize);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🖼️  Image Batch Resizing Script Started');
  console.log('====================================');
  console.log(`📁 Input directory: ${INPUT_IMAGE_DIR}`);
  console.log(`📁 Output base directory: ${OUTPUT_BASE_DIR}`);
  console.log(`📏 Target sizes: ${TARGET_SIZES.map(s => `${s}x${s}`).join(', ')}`);
  console.log(`🎯 Valid extensions: ${VALID_IMAGE_EXTENSIONS.join(', ')}`);
  console.log(`🚫 Will skip files ending with: ${STATIC_MAP_SUFFIX}`);
  console.log(`📐 Will skip generating versions if source image is smaller than target size`);
  console.log(`🔸 WebP output options: lossless=${WEBP_OUTPUT_OPTIONS.lossless}, quality=${WEBP_OUTPUT_OPTIONS.quality}`);
  console.log('');
  
  // 检查输入目录是否存在
  try {
    await fs.access(INPUT_IMAGE_DIR);
  } catch (error) {
    console.error(`❌ Input directory does not exist: ${INPUT_IMAGE_DIR}`);
    console.error('Please ensure the directory exists and try again.');
    console.error('Expected location: BALICIAGA/photo_webp/');
    process.exit(1);
  }
  
  // 创建输出基础目录
  try {
    await fs.mkdir(OUTPUT_BASE_DIR, { recursive: true });
    console.log(`📁 Created output base directory: ${OUTPUT_BASE_DIR}`);
  } catch (error) {
    console.error(`❌ Failed to create output directory: ${error.message}`);
    process.exit(1);
  }
  
  // 为每个目标尺寸创建子目录
  for (const size of TARGET_SIZES) {
    const sizeDir = path.join(OUTPUT_BASE_DIR, String(size));
    try {
      await fs.mkdir(sizeDir, { recursive: true });
      console.log(`📁 Created size directory: ${sizeDir}`);
      stats.generatedBySize[size] = 0; // 初始化统计
      stats.skippedSmallBySize[size] = 0; // 🔸 新增: 初始化小图片跳过统计
    } catch (error) {
      console.error(`❌ Failed to create size directory ${sizeDir}: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n🔍 Scanning for source image files...');
  
  // 重置统计信息
  stats = {
    totalScanned: 0,
    totalSkippedStaticMaps: 0,
    totalSourceImages: 0,
    totalGenerated: 0,
    totalSkippedExisting: 0,
    totalSkippedSmallSource: 0,  // 🔸 新增
    totalErrors: 0,
    errors: [],
    generatedBySize: {},
    skippedSmallBySize: {}  // 🔸 新增
  };
  
  // 初始化各尺寸统计
  TARGET_SIZES.forEach(size => {
    stats.generatedBySize[size] = 0;
    stats.skippedSmallBySize[size] = 0;  // 🔸 新增
  });
  
  // 获取所有源图片文件
  const sourceImageFiles = await getAllImageFilesRecursive(INPUT_IMAGE_DIR);
  stats.totalScanned = sourceImageFiles.length + stats.totalSkippedStaticMaps;
  stats.totalSourceImages = sourceImageFiles.length;
  
  if (sourceImageFiles.length === 0) {
    if (stats.totalSkippedStaticMaps > 0) {
      console.log(`📭 No processable image files found, but ${stats.totalSkippedStaticMaps} static map(s) were identified and skipped.`);
    } else {
      console.log('📭 No image files found in the specified directory.');
    }
    console.log('Please check the path and ensure there are images with valid extensions (excluding static maps).');
    console.log(`Searched in: ${INPUT_IMAGE_DIR}`);
    return;
  }
  
  console.log(`📋 Found ${sourceImageFiles.length} source image(s) to process (after skipping ${stats.totalSkippedStaticMaps} static map(s))`);
  console.log(`🎯 Will generate ${TARGET_SIZES.length} size variants for each image (${TARGET_SIZES.join(', ')} pixels)`);
  console.log(`📊 Expected maximum output images: ${sourceImageFiles.length * TARGET_SIZES.length} (actual may be less due to size restrictions)`);
  
  // 处理每张源图片
  for (let i = 0; i < sourceImageFiles.length; i++) {
    await processSourceImage(sourceImageFiles[i], i, sourceImageFiles.length);
  }
  
  // 打印处理总结
  console.log('\n📊 Processing Summary');
  console.log('===================');
  console.log(`Total files encountered (incl. static maps): ${stats.totalScanned}`);
  console.log(`Static maps skipped: ${stats.totalSkippedStaticMaps}`);
  console.log(`Source images processed: ${stats.totalSourceImages}`);
  console.log(`New images generated: ${stats.totalGenerated}`);
  console.log(`Already existing images skipped: ${stats.totalSkippedExisting}`);
  console.log(`Source images too small for target size: ${stats.totalSkippedSmallSource}`);  // 🔸 新增
  console.log(`Errors encountered: ${stats.totalErrors}`);
  
  console.log('\n📏 Generated Images by Size:');
  TARGET_SIZES.forEach(size => {
    console.log(`  ${size}x${size}: ${stats.generatedBySize[size]} images`);
  });
  
  // 🔸 新增: 显示因尺寸不足而跳过的统计
  console.log('\n📐 Skipped Images (Source Too Small) by Size:');
  TARGET_SIZES.forEach(size => {
    console.log(`  ${size}x${size}: ${stats.skippedSmallBySize[size]} images`);
  });
  
  if (stats.totalErrors > 0) {
    console.log('\n❌ Error Details:');
    stats.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file} (${error.size}x${error.size}): ${error.error}`);
    });
  }
  
  if (stats.totalGenerated > 0) {
    console.log(`\n✅ Successfully generated ${stats.totalGenerated} resized images!`);
    console.log(`📁 Output directory: ${OUTPUT_BASE_DIR}`);
    console.log(`📏 Available sizes: ${TARGET_SIZES.map(s => `${s}x${s}`).join(', ')}`);
  }
  
  console.log('\n🎉 Script completed!');
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { 
  getAllImageFilesRecursive, 
  generateResizedImage, 
  processSourceImage, 
  main 
}; 