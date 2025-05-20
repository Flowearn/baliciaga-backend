// BALICIAGA/backend/scripts/enrichCafeData.js

// 引入依赖
const fs = require('fs');
const path = require('path');

// 加载 backend 目录的 .env 文件
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 导入 placesApiService 和 BaliciagaCafe 模型
const { getPlaceDetails } = require('../src/api/placesApiService');
const BaliciagaCafe = require('../src/models/BaliciagaCafe');

// 定义常量和配置
// 假设 canggu_cafe.json 在项目根目录 (与 backend 文件夹同级)
const INPUT_FILE_PATH = path.resolve(__dirname, '../../canggu_cafe.json');
const OUTPUT_FILE_PATH = path.resolve(__dirname, './canggu_cafe_enriched.json');

// 控制本次运行处理的条目数量 (0 表示处理所有)
const ITEMS_TO_PROCESS = 0; // 初始值设为 1

// API 调用之间的延迟 (毫秒)
const DELAY_BETWEEN_CALLS_MS = 200;

/**
 * 主执行函数
 * 读取原始咖啡馆数据，获取详细信息，处理并保存。
 */
async function main() {
  console.log(`开始执行 enrichCafeData.js 脚本...`);
  console.log(`输入文件: ${INPUT_FILE_PATH}`);
  console.log(`输出文件: ${OUTPUT_FILE_PATH}`);
  console.log(`本次处理条目数限制: ${ITEMS_TO_PROCESS === 0 ? '全部' : ITEMS_TO_PROCESS}`);

  let originalCafes = [];
  try {
    const rawData = fs.readFileSync(INPUT_FILE_PATH, 'utf8');
    originalCafes = JSON.parse(rawData);
    console.log(`成功读取并解析输入文件。共 ${originalCafes.length} 条原始记录。`);
  } catch (error) {
    console.error(`读取或解析输入文件失败: ${error.message}`);
    process.exit(1); // 退出脚本
  }

  // 根据 ITEMS_TO_PROCESS 选取要处理的条目
  const cafesToProcess = ITEMS_TO_PROCESS === 0 ? originalCafes : originalCafes.slice(0, ITEMS_TO_PROCESS);
  console.log(`实际将处理 ${cafesToProcess.length} 条记录。`);

  const enrichedCafes = [];

  for (let i = 0; i < cafesToProcess.length; i++) {
    const originalCafe = cafesToProcess[i];
    const placeId = originalCafe.placeId;
    const name = originalCafe.name || '未知名称';

    if (!placeId) {
      console.warn(`警告: 跳过索引 ${i} 的记录，因为它没有 placeId。`);
      continue;
    }

    console.log(`\n正在处理 (${i + 1}/${cafesToProcess.length}): ${name} (ID: ${placeId})...`);

    try {
      // 调用 placesApiService.getPlaceDetails 获取详细信息
      // getPlaceDetails 内部已包含 fieldMask 逻辑，这里无需传递 fields 参数
      const detailedInfo = await getPlaceDetails(placeId);

      // 使用详细信息创建仅包含API数据的BaliciagaCafe实例
      const apiBasedCafeInstance = new BaliciagaCafe(detailedInfo, {});

      // 显式构建mergedCafe对象，只包含我们明确需要的字段
      const mergedCafe = {
        placeId: originalCafe.placeId, // 确保 placeId 的来源和稳定性
        name: apiBasedCafeInstance.name, // 从API获取的名称
        
        // 从API获取并由模型处理的字段
        latitude: apiBasedCafeInstance.latitude,
        longitude: apiBasedCafeInstance.longitude,
        businessStatus: apiBasedCafeInstance.businessStatus,
        photos: apiBasedCafeInstance.photos, // 已经是S3链接或getPhotoUrl处理后的链接
        phoneNumber: apiBasedCafeInstance.phoneNumber,
        rating: apiBasedCafeInstance.rating,
        userRatingsTotal: apiBasedCafeInstance.userRatingsTotal,
        website: apiBasedCafeInstance.website,
        openingHours: apiBasedCafeInstance.openingHours, // 文本描述
        isOpenNow: apiBasedCafeInstance.isOpenNow,       // Google提供的布尔值
        openingPeriods: apiBasedCafeInstance.openingPeriods, // 新增的结构化时间
        
        // 用户手动维护的字段
        instagram: originalCafe.instagram || "", // 保留用户输入
        region: originalCafe.region || 'canggu', // 保留或设置默认

        // 不包含: address, types, priceLevel
      };

      // 将合并后的对象添加到结果数组
      enrichedCafes.push(mergedCafe);

      console.log(`成功获取并处理 ${name} 的详细信息。`);

    } catch (error) {
      console.error(`处理 ${name} (ID: ${placeId}) 时发生错误:`, error.message);
      // 可以选择在这里记录失败的 placeId 或其他信息
    }

    // 在每次API调用后添加延迟，除了最后一次
    if (i < cafesToProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
    }
  }

  // 保存结果到输出文件
  try {
    fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(enrichedCafes, null, 2), 'utf8');
    console.log(`\n脚本执行完毕。成功处理 ${enrichedCafes.length} 条记录，结果已保存到 ${OUTPUT_FILE_PATH}`);
  } catch (error) {
    console.error(`保存输出文件失败: ${error.message}`);
  }
}

// 调用主函数执行脚本
main(); 