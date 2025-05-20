/**
 * Baliciaga 咖啡馆API服务 - 核心处理程序
 * 用于获取巴厘岛苍古地区的咖啡馆数据
 * 现在基于从AWS S3读取的JSON文件，包含完整的咖啡馆信息
 */
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

// 导入BaliciagaCafe模型
const BaliciagaCafe = require('./models/BaliciagaCafe');

// 初始化S3客户端
const s3Client = new S3Client({ region: "ap-southeast-1" });

// S3配置
const S3_BUCKET_NAME = 'baliciaga-database';
const S3_OBJECT_KEY = 'data/cafes.json';

// 初始化Express应用
const app = express();
app.use(cors());

// 预缓存的咖啡馆数据
let cafesCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存时间

/**
 * 从S3获取咖啡馆数据
 * @returns {Promise<Array<Object>>} 包含所有咖啡馆数据的JSON数组
 */
async function fetchCafesFromS3() {
  try {
    console.log(`Fetching cafes data from S3: ${S3_BUCKET_NAME}/${S3_OBJECT_KEY}`);
    
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: S3_OBJECT_KEY
    });
    
    const response = await s3Client.send(command);
    
    // 将S3对象内容转换为字符串
    const bodyContents = await streamToString(response.Body);
    
    // 解析JSON
    const cafesData = JSON.parse(bodyContents);
    console.log(`Successfully fetched ${cafesData.length} cafes from S3`);
    
    return cafesData;
  } catch (error) {
    console.error('Error fetching cafes data from S3:', error);
    throw error;
  }
}

/**
 * 将流转换为字符串
 * @param {Stream} stream - 要转换的流
 * @returns {Promise<string>} 流内容的字符串
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/**
 * 计算咖啡馆当前是否营业
 * @param {Array} openingPeriods - 营业时段数组，每个元素包含星期几、开始时间和结束时间
 * @param {Date} currentTimeInBali - 巴厘岛当前时间
 * @returns {boolean} 当前是否营业
 */
function calculateIsOpenNow(openingPeriods, currentTimeInBali) {
  // 如果没有营业时间数据，返回false
  if (!openingPeriods || !Array.isArray(openingPeriods) || openingPeriods.length === 0) {
    return false;
  }

  // 获取当前的星期几 (0=周日, 1=周一, ..., 6=周六)
  const currentDayOfWeek = currentTimeInBali.getDay();
  
  // 获取当前的小时和分钟，计算当前时间的分钟数
  const currentHour = currentTimeInBali.getHours();
  const currentMinute = currentTimeInBali.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  // 检查每个营业时段
  for (const period of openingPeriods) {
    // 确保period包含必要的字段
    if (!period.open || !period.close) continue;

    // 获取开始的星期几
    const openDay = period.open.day;

    // 获取结束的星期几
    const closeDay = period.close.day;

    // 获取开始和结束时间（转换为分钟数）
    const openTimeInMinutes = period.open.hour * 60 + period.open.minute;
    const closeTimeInMinutes = period.close.hour * 60 + period.close.minute;

    // 情况1: 同一天内的营业时段
    if (openDay === closeDay) {
      if (currentDayOfWeek === openDay && 
          currentTimeInMinutes >= openTimeInMinutes && 
          currentTimeInMinutes < closeTimeInMinutes) {
        return true;
      }
    } 
    // 情况2: 跨天的营业时段 (例如: 周一22:00至周二02:00)
    else {
      // 当前是开始营业的那天
      if (currentDayOfWeek === openDay && currentTimeInMinutes >= openTimeInMinutes) {
        return true;
      }
      // 当前是结束营业的那天
      else if (currentDayOfWeek === closeDay && currentTimeInMinutes < closeTimeInMinutes) {
        return true;
      }
    }
  }

  // 如果没有匹配的营业时段，则当前不营业
  return false;
}

/**
 * 获取巴厘岛当前时间
 * @returns {Date} 巴厘岛当前时间
 */
function getCurrentBaliTime() {
  // 巴厘岛时区偏移量为UTC+8 (8小时)
  const BALI_UTC_OFFSET = 8 * 60 * 60 * 1000; // 毫秒
  
  // 获取当前UTC时间戳
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  
  // 将UTC时间转换为巴厘岛时间
  return new Date(utcTime + BALI_UTC_OFFSET);
}

/**
 * 获取巴厘岛苍古区域的咖啡馆列表。
 * 流程：
 * 1. 从S3获取咖啡馆JSON数据
 * 2. 为每个咖啡馆计算当前的isOpenNow状态
 * 3. 将数据封装为BaliciagaCafe实例返回
 * @returns {Promise<Array<BaliciagaCafe>>} BaliciagaCafe实例的数组
 */
async function WorkspaceCangguCafes() {
  const now = Date.now();
  if (cafesCache && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    console.log('Using cached cafes data (BaliciagaCafe instances)');
    return cafesCache;
  }

  console.log('Fetching cafes data from S3 and calculating current open status');
  try {
    // 1. 从S3获取咖啡馆JSON数据
    const cafesData = await fetchCafesFromS3();
    
    // 2. 获取巴厘岛当前时间
    const currentBaliTime = getCurrentBaliTime();
    console.log(`Current Bali time: ${currentBaliTime.toISOString()}`);
    
    // 3. 为每个咖啡馆计算当前的isOpenNow状态并创建BaliciagaCafe实例
    const baliciagaCafes = cafesData.map(cafeData => {
      // 计算当前营业状态
      const isOpenNow = calculateIsOpenNow(cafeData.openingPeriods, currentBaliTime);
      
      // 创建包含计算后的isOpenNow的数据对象
      const processedData = {
        ...cafeData,
        isOpenNow
      };
      
      // 创建BaliciagaCafe实例
      return new BaliciagaCafe({}, processedData);
    });
    
    console.log(`Successfully processed ${baliciagaCafes.length} cafes with real-time open status.`);

    cafesCache = baliciagaCafes; // 缓存BaliciagaCafe实例
    cacheTimestamp = now;
    
    return baliciagaCafes;
  } catch (error) {
    console.error('Error in WorkspaceCangguCafes:', error);
    // 错误时不缓存
    cafesCache = null; 
    cacheTimestamp = null;
    throw error;
  }
}

/**
 * 根据placeId获取单个咖啡馆详情 (BaliciagaCafe 实例)
 * @param {string} placeId - 咖啡馆的Place ID
 * @returns {Promise<BaliciagaCafe|null>} BaliciagaCafe实例或null
 */
async function WorkspaceCafeDetails(placeId) {
  try {
    // 先尝试从缓存获取所有咖啡馆
    let cafes;
    const now = Date.now();
    if (cafesCache && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
      console.log('Using cached cafes data to find specific cafe');
      cafes = cafesCache;
    } else {
      // 如果没有缓存，则调用主函数获取所有咖啡馆
      cafes = await WorkspaceCangguCafes();
    }
    
    // 查找特定placeId的咖啡馆
    const cafe = cafes.find(c => c.placeId === placeId);
    
    if (!cafe) {
      console.warn(`No cafe found with placeId ${placeId}`);
      return null;
    }
    
    return cafe;
  } catch (error) {
    console.error(`Error in WorkspaceCafeDetails for ${placeId}:`, error);
    throw error;
  }
}

// API路由 - 获取所有咖啡馆
app.get('/cafes', async (req, res) => {
  try {
    const cafes = await WorkspaceCangguCafes();
    res.json(cafes.map(cafe => cafe.toJSON()));
  } catch (error) {
    console.error('GET /cafes - Error fetching cafes:', error.message);
    res.status(502).json({ error: 'Failed to fetch cafes', message: error.message });
  }
});

// API路由 - 获取特定咖啡馆详情
app.get('/cafes/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const cafe = await WorkspaceCafeDetails(placeId);
    
    if (!cafe) {
      return res.status(404).json({ error: `Cafe with placeId ${placeId} not found` });
    }
    res.json(cafe.toJSON());
  } catch (error) {
    console.error(`GET /cafes/${req.params.placeId} - Error fetching cafe details:`, error.message);
    res.status(502).json({ error: 'Failed to fetch cafe details', message: error.message });
  }
});

// 独立运行时的端口配置 (非Serverless环境)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3006;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// 导出Serverless处理程序
module.exports.handler = serverless(app); 