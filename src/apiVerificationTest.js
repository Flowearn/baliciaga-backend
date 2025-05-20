/**
 * API 验证测试脚本
 * 用于测试Google Places API连接和功能
 */
require('dotenv').config();
const axios = require('axios');
const { getApiKey, SEARCH_CONFIG } = require('./utils/config');
const { getAllTextSearchResults, getPlaceDetails } = require('./api/placesApiService');
const BaliciagaCafe = require('./models/BaliciagaCafe');

// API密钥有效性检查
async function verifyApiKey() {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.error('错误: 缺少API密钥。请在.env文件中设置MAPS_API_KEY');
    return false;
  }
  
  try {
    // 使用Places API进行简单的测试请求 (新版API)
    const requestBody = {
      textQuery: 'coffee',
      maxResultCount: 1 // 我们只需要知道API是否工作，不需要很多结果
    };
    const fieldMask = 'places.id'; // 同样，只需要最少字段

    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask
        }
      }
    );
    
    // 新版API没有status字段，而是直接返回places数组或错误对象
    // 如果响应成功并且包含places (即使是空数组)，则认为API密钥有效
    if (response.data && (response.data.places || response.status === 200)) {
      console.log('✅ API密钥验证成功!');
      return true;
    } else {
      console.error(`❌ API密钥验证失败.`);
      if (response.data && response.data.error) {
        console.error(`错误详情: ${response.data.error.message}`);
      }
      return false;
    }
  } catch (error) {
    console.error('❌ API密钥验证过程中出错:', error.message);
    return false;
  }
}

// 测试文本搜索API
async function testTextSearch() {
  try {
    console.log('测试文本搜索API...');
    const results = await getAllTextSearchResults(SEARCH_CONFIG.canggu);
    
    console.log(`✅ 成功获取${results.length}个结果`);
    if (results.length > 0) {
      console.log('第一个结果示例:');
      console.log(JSON.stringify(results[0], null, 2));
    }
    
    return results;
  } catch (error) {
    console.error('❌ 文本搜索测试失败:', error.message);
    return [];
  }
}

// 测试地点详情API
async function testPlaceDetails(placeId) {
  if (!placeId) {
    console.error('❌ 无法测试地点详情: 缺少placeId');
    return null;
  }
  
  try {
    console.log(`测试地点详情API (placeId: ${placeId})...`);
    const details = await getPlaceDetails(placeId);
    
    console.log('✅ 成功获取地点详情:');
    console.log(JSON.stringify(details, null, 2));
    
    return details;
  } catch (error) {
    console.error('❌ 地点详情测试失败:', error.message);
    return null;
  }
}

// 测试BaliciagaCafe模型
function testBaliciagaCafeModel(placeData, details) {
  if (!placeData) {
    console.error('❌ 无法测试BaliciagaCafe模型: 缺少placeData');
    return null;
  }
  
  try {
    console.log('测试BaliciagaCafe模型...');
    const cafe = new BaliciagaCafe(placeData, details);
    
    console.log('✅ 成功创建BaliciagaCafe实例:');
    console.log(JSON.stringify(cafe, null, 2));
    
    return cafe;
  } catch (error) {
    console.error('❌ BaliciagaCafe模型测试失败:', error.message);
    return null;
  }
}

// 主测试函数
async function runTests() {
  console.log('===== API 验证测试开始 =====');
  
  // 验证API密钥
  const isApiKeyValid = await verifyApiKey();
  if (!isApiKeyValid) {
    console.error('⛔ API密钥无效，中止测试');
    return;
  }
  
  // 测试文本搜索
  const searchResults = await testTextSearch();
  
  // 如果有搜索结果，测试地点详情
  let placeDetails = null;
  if (searchResults.length > 0) {
    const firstResult = searchResults[0];
    placeDetails = await testPlaceDetails(firstResult.place_id);
    
    // 测试BaliciagaCafe模型
    const cafeModel = testBaliciagaCafeModel(firstResult, placeDetails);
  }
  
  console.log('===== API 验证测试完成 =====');
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('测试过程中出现未捕获错误:', error);
    process.exit(1);
  });
}

module.exports = {
  verifyApiKey,
  testTextSearch,
  testPlaceDetails,
  testBaliciagaCafeModel,
  runTests
}; 