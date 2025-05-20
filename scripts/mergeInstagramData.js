// BALICIAGA/backend/scripts/mergeInstagramData.js

// 引入依赖
const fs = require('fs');
const path = require('path');

// 定义文件路径 (均在 scripts 目录下)
const ENRICHED_DATA_PATH = './canggu_cafe_enriched.json';
const INSTA_DATA_PATH = './canggu_cafe_insta.json';
const OUTPUT_MERGED_PATH = './canggu_cafe_final_merged.json';

/**
 * 主执行函数
 * 读取两个JSON文件，合并Instagram数据，并保存结果
 */
async function main() {
  console.log(`开始合并Instagram数据...`);
  console.log(`丰富数据文件: ${ENRICHED_DATA_PATH}`);
  console.log(`Instagram数据文件: ${INSTA_DATA_PATH}`);
  console.log(`输出文件: ${OUTPUT_MERGED_PATH}`);

  let enrichedCafes = [];
  let instaCafes = [];

  // 读取丰富的API数据文件
  try {
    const rawEnrichedData = fs.readFileSync(path.resolve(__dirname, ENRICHED_DATA_PATH), 'utf8');
    enrichedCafes = JSON.parse(rawEnrichedData);
    console.log(`成功读取并解析丰富数据文件。共 ${enrichedCafes.length} 条记录。`);
  } catch (error) {
    console.error(`读取或解析丰富数据文件失败: ${error.message}`);
    process.exit(1); // 退出脚本
  }

  // 读取包含Instagram链接的备份文件
  try {
    const rawInstaData = fs.readFileSync(path.resolve(__dirname, INSTA_DATA_PATH), 'utf8');
    instaCafes = JSON.parse(rawInstaData);
    console.log(`成功读取并解析Instagram数据文件。共 ${instaCafes.length} 条记录。`);
  } catch (error) {
    console.error(`读取或解析Instagram数据文件失败: ${error.message}`);
    process.exit(1); // 退出脚本
  }

  // 创建Instagram数据的映射，以placeId为键
  const instaMap = new Map();
  for (const cafe of instaCafes) {
    if (cafe.placeId && cafe.instagram) {
      instaMap.set(cafe.placeId, cafe.instagram);
    }
  }
  console.log(`从Instagram数据文件中提取了 ${instaMap.size} 个有效的Instagram链接。`);

  // 合并数据
  let updatedCount = 0;
  const finalMergedCafes = enrichedCafes.map(cafe => {
    // 创建一个新的对象副本
    const mergedCafe = { ...cafe };
    
    // 查找对应的Instagram链接
    const instagramLink = instaMap.get(cafe.placeId);
    
    // 如果找到了链接，则更新mergedCafe的instagram字段
    if (instagramLink) {
      mergedCafe.instagram = instagramLink;
      updatedCount++;
    } else {
      // 保持原值，如果为空则设为空字符串
      mergedCafe.instagram = cafe.instagram || "";
    }
    
    return mergedCafe;
  });

  // 保存结果到输出文件
  try {
    fs.writeFileSync(path.resolve(__dirname, OUTPUT_MERGED_PATH), JSON.stringify(finalMergedCafes, null, 2), 'utf8');
    console.log(`\n脚本执行完毕。成功处理 ${finalMergedCafes.length} 条记录，其中 ${updatedCount} 条更新了Instagram链接。`);
    console.log(`结果已保存到 ${OUTPUT_MERGED_PATH}`);
  } catch (error) {
    console.error(`保存输出文件失败: ${error.message}`);
    process.exit(1);
  }
}

// 调用主函数执行脚本
main(); 