const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

// 常量定义
const BASE_IMAGE_DIR = path.resolve(__dirname, '../../cafe_images');
const SCREENSHOT_KEYWORD = "截屏";
const NEW_FILENAME_PREFIX = "photo_";

async function main() {
  console.log(`开始扫描并重命名包含"${SCREENSHOT_KEYWORD}"的图片文件...`);
  
  try {
    // 读取所有咖啡馆子文件夹
    const cafeFolders = await fsPromises.readdir(BASE_IMAGE_DIR);
    
    // 遍历每个咖啡馆文件夹
    for (const cafeSubFolder of cafeFolders) {
      const cafeFolderPath = path.join(BASE_IMAGE_DIR, cafeSubFolder);
      
      // 确保是文件夹而非文件
      const stat = await fsPromises.stat(cafeFolderPath);
      if (!stat.isDirectory()) continue;
      
      console.log(`\n正在检查文件夹: ${cafeSubFolder}`);
      
      try {
        // 读取子文件夹中的所有文件
        const allFiles = await fsPromises.readdir(cafeFolderPath);
        
        // 筛选包含"截屏"关键字的文件
        const screenshotFiles = allFiles.filter(file => file.includes(SCREENSHOT_KEYWORD));
        
        if (screenshotFiles.length === 0) {
          console.log(`  没有找到包含"${SCREENSHOT_KEYWORD}"的文件`);
          continue;
        }
        
        console.log(`  找到 ${screenshotFiles.length} 个包含"${SCREENSHOT_KEYWORD}"的文件`);
        
        // 对文件名排序以确保重命名顺序一致
        screenshotFiles.sort();
        
        // 重命名文件
        for (let i = 0; i < screenshotFiles.length; i++) {
          const originalFileName = screenshotFiles[i];
          const originalFilePath = path.join(cafeFolderPath, originalFileName);
          
          // 获取原始文件扩展名
          const fileExt = path.extname(originalFileName);
          
          // 生成新的字母后缀 (a, b, c, ...)
          const newLetterSuffix = String.fromCharCode(97 + i);
          
          // 构建新文件名
          const newFileName = `${NEW_FILENAME_PREFIX}${newLetterSuffix}${fileExt}`;
          const newFilePath = path.join(cafeFolderPath, newFileName);
          
          // 执行重命名
          if (originalFilePath !== newFilePath) {
            try {
              await fsPromises.rename(originalFilePath, newFilePath);
              console.log(`  已重命名: "${originalFileName}" -> "${newFileName}"`);
            } catch (renameError) {
              console.error(`  重命名文件时出错: ${originalFileName}`, renameError);
            }
          } else {
            console.log(`  文件 "${originalFileName}" 无需重命名，名称已符合格式。`);
          }
        }
      } catch (folderError) {
        console.error(`处理文件夹 ${cafeSubFolder} 时出错:`, folderError);
      }
    }
    
    console.log('\n重命名操作完成！');
  } catch (error) {
    console.error('执行脚本时出错:', error);
  }
}

// 执行主函数
main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
}); 