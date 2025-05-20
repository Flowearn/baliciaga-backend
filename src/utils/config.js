/**
 * 配置工具
 * 管理API密钥和搜索参数
 */
require('dotenv').config();

/**
 * 获取Google Maps API密钥
 * @returns {string} - API密钥
 */
function getApiKey() {
  const apiKey = process.env.MAPS_API_KEY;
  
  if (!apiKey) {
    console.warn('警告: 未设置MAPS_API_KEY环境变量');
  }
  
  return apiKey;
}

// --- 预定义子区域配置 ---
const CANGGU_CENTER_1KM_CONFIG = {
  location: "-8.657,115.130",
  radius: 1000,
  includedTypes: ["coffee_shop", "cafe"]
};

const BATU_BOLONG_1_5KM_CONFIG = {
  location: "-8.6590,115.1300",
  radius: 1500,
  includedTypes: ["coffee_shop", "cafe"]
};

const BERAWA_1_5KM_CONFIG = {
  location: "-8.6650,115.1390",
  radius: 1500,
  includedTypes: ["coffee_shop", "cafe"]
};

const PERERENAN_2KM_CONFIG = {
  location: "-8.6470,115.1200",
  radius: 2000,
  includedTypes: ["coffee_shop", "cafe"]
};
// --- 预定义子区域配置结束 ---

// 现有其他区域中心点坐标 (保留，可能用于其他配置或参考)
const CANGGU_GENERAL_CENTER = { // Renamed from CANGGU_CENTER to avoid conflict if used elsewhere
  lat: -8.6478175,
  lng: 115.1385192
};
const UBUD_CENTER = {
  lat: -8.5069,
  lng: 115.2624
};
const ULUWATU_CENTER = {
  lat: -8.8291,
  lng: 115.0849
};

// 现有其他区域搜索半径(米) (保留，可能用于其他配置或参考)
const REGION_GENERAL_RADIUS = { // Renamed from REGION_RADIUS
  canggu: 5000,
  ubud: 5000,
  uluwatu: 8000
};

// 搜索参数配置
const SEARCH_CONFIG = {
  // --- 用户手动切换苍古子区域 ---
  // 要测试不同的预定义苍古子区域，请将下面的 CANGGU_CENTER_1KM_CONFIG
  // 替换为其他配置名称，例如 BATU_BOLONG_1_5KM_CONFIG, BERAWA_1_5KM_CONFIG, 或 PERERENAN_2KM_CONFIG。
  // 保存文件后，可能需要重启本地后端服务 (例如 serverless-offline)。
  canggu: {
    textQuery: "bali canggu cafe",
    location: "-8.657,115.130",
    radius: 3000,
    // includedTypes is removed as it's not directly used for Text Search API body
  },
  pererenanNearbyTest: {
    location: "-8.654991037555913, 115.14157388425855", // 用户提供的最新精确中心点
    radius: 2000,
    includedTypes: ["brunch_restaurant"],
    excludedTypes: ["gym"]
  },
  // --- 用户手动切换苍古子区域结束 ---

  // 乌布区搜索参数 (保留现有配置)
  ubud: {
    query: 'coffee shop ubud bali',
    location: `${UBUD_CENTER.lat},${UBUD_CENTER.lng}`,
    radius: REGION_GENERAL_RADIUS.ubud, // using renamed general radius
    type: 'cafe'
  },
  // 乌鲁瓦图区搜索参数 (保留现有配置)
  uluwatu: {
    query: 'coffee shop uluwatu bali',
    location: `${ULUWATU_CENTER.lat},${ULUWATU_CENTER.lng}`,
    radius: REGION_GENERAL_RADIUS.uluwatu, // using renamed general radius
    type: 'cafe'
  }
  // 您可以在此添加或修改其他区域的配置
};

module.exports = {
  getApiKey,
  // 导出预定义的苍古子区域配置，方便在其他地方直接引用（如果需要）
  CANGGU_CENTER_1KM_CONFIG,
  BATU_BOLONG_1_5KM_CONFIG,
  BERAWA_1_5KM_CONFIG,
  PERERENAN_2KM_CONFIG,
  // 保留现有其他导出，以防其他模块依赖
  CANGGU_GENERAL_CENTER, // Exporting renamed general center
  UBUD_CENTER,
  ULUWATU_CENTER,
  REGION_GENERAL_RADIUS, // Exporting renamed general radius
  SEARCH_CONFIG
}; 