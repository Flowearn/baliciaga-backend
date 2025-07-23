/**
 * Baliciaga 场所API服务 - 核心处理程序
 * 用于获取巴厘岛苍古地区的场所数据（咖啡馆和酒吧）
 * 现在基于DynamoDB数据库，使用高性能Query操作优化查询速度
 */
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const appConfig = require('./utils/appConfig');

// 导入BaliciagaCafe模型
const BaliciagaCafe = require('./models/BaliciagaCafe');

// 预缓存的数据
let cafesCache = {};
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存时间

// 初始化Express应用
const app = express();
app.use(cors());

// DynamoDB客户端
let docClient = null;

// DynamoDB表名和索引名
const TABLE_NAME = process.env.PLACES_TABLE || 'baliciaga-places-dev';
const TYPE_INDEX_NAME = 'TypeIndex';

/**
 * 获取或创建DynamoDB文档客户端
 * @returns {Promise<DynamoDBDocumentClient>} DynamoDB文档客户端实例
 */
async function getDynamoDBDocClient() {
  if (docClient === null) {
    const config = await appConfig.getConfig();
    const dynamoDBClient = new DynamoDBClient({ region: config.AWS_REGION });
    docClient = DynamoDBDocumentClient.from(dynamoDBClient);
    console.log(`DynamoDB client initialized with region: ${config.AWS_REGION}`);
  }
  return docClient;
}

/**
 * 从DynamoDB获取数据 - 性能优化版本
 * @param {string} categoryType - 分类类型 ('cafe', 'bar', 'cowork', 'dining', 'food')
 * @returns {Promise<Array<Object>>} 包含所有数据的JSON数组
 */
async function fetchDataFromDynamoDB(categoryType) {
  try {
    console.log(`Fetching data from DynamoDB for category: ${categoryType}`);
    
    const client = await getDynamoDBDocClient();
    let data = [];
    
    if (categoryType === 'food') {
      // 对于food类型，并行查询cafe和dining
      console.log('Using parallel queries for food category');
      const [cafeResponse, diningResponse] = await Promise.all([
        client.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: TYPE_INDEX_NAME,
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'type'
          },
          ExpressionAttributeValues: {
            ':type': 'cafe'
          }
        })),
        client.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: TYPE_INDEX_NAME,
          KeyConditionExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'type'
          },
          ExpressionAttributeValues: {
            ':type': 'dining'
          }
        }))
      ]);
      
      data = [...(cafeResponse.Items || []), ...(diningResponse.Items || [])];
      console.log(`Parallel query completed: ${cafeResponse.Items?.length || 0} cafes + ${diningResponse.Items?.length || 0} dining = ${data.length} total`);
      
    } else if (categoryType && categoryType !== 'all') {
      // 对于特定类型，使用高效的Query操作
      console.log(`Using Query operation for category: ${categoryType}`);
      
      // 映射categoryType到数据库中的type值
      let dbType = categoryType;
      if (categoryType === 'cowork') {
        dbType = 'coworking';
      }
      
      const response = await client.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: TYPE_INDEX_NAME,
        KeyConditionExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':type': dbType
        }
      }));
      
      data = response.Items || [];
      console.log(`Query completed: ${data.length} items for category ${categoryType}`);
      
    } else {
      // 只有在请求所有数据时才使用Scan操作
      console.log('Using Scan operation for all data (fallback)');
      
      const response = await client.send(new ScanCommand({
        TableName: TABLE_NAME
      }));
      
      data = response.Items || [];
      console.log(`Scan completed: ${data.length} total items`);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching data from DynamoDB:', error);
    throw error;
  }
}

/**
 * 计算咖啡馆当前是否营业
 * @param {Array} openingPeriods - 营业时段数组，每个元素包含星期几、开始时间和结束时间
 * @param {Date} currentTimeInBali - 巴厘岛当前时间
 * @param {string} businessStatus - 商户的营业状态
 * @returns {boolean} 当前是否营业
 */
function calculateIsOpenNow(openingPeriods, currentTimeInBali, businessStatus) {
  // 如果商户临时关闭，直接返回false
  if (businessStatus === 'CLOSED_TEMPORARILY') {
    return false;
  }

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
    // Handle 24/7 case (period has open but no close time)
    if (period.open && !period.close) {
      // This format signifies the business is always open.
      return true;
    }
    
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
 * 获取指定分类的场所列表。
 * 流程：
 * 1. 根据分类类型从DynamoDB获取数据 (使用Query优化性能)
 * 2. 为每个场所计算当前的isOpenNow状态
 * 3. 将数据封装为BaliciagaCafe实例返回
 * @param {string} categoryType - 分类类型 ('cafe', 'bar', 'cowork', 'dining', 'food')
 * @returns {Promise<Array<BaliciagaCafe>>} BaliciagaCafe实例的数组
 */
async function WorkspacePlaces(categoryType) {
  const now = Date.now();
  const cacheKey = categoryType || 'cafe';
  
  if (cafesCache && cafesCache[cacheKey] && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    console.log(`Using cached ${categoryType || 'cafe'} data (BaliciagaCafe instances)`);
    return cafesCache[cacheKey];
  }

  console.log(`Fetching ${categoryType || 'cafe'} data from DynamoDB using optimized queries`);
  try {
    // 1. 从DynamoDB获取数据 (使用优化的Query操作)
    let placesData = await fetchDataFromDynamoDB(categoryType);
    
    // 2. 处理数据，为food类型添加category字段
    if (categoryType === 'food') {
      placesData = placesData.map(place => ({
        ...place,
        category: place.type === 'cafe' ? 'cafe' : place.type === 'dining' ? 'dining' : place.type
      }));
      
      // 处理重复的地点（同时是cafe和dining的）
      const placesMap = new Map();
      placesData.forEach(place => {
        const key = place.placeId;
        if (placesMap.has(key)) {
          // 如果已经存在，标记为混合类型
          const existingPlace = placesMap.get(key);
          placesMap.set(key, {
            ...place,
            category: 'both',
            originalCategories: ['cafe', 'dining']
          });
        } else {
          placesMap.set(key, place);
        }
      });
      placesData = Array.from(placesMap.values());
    } else if (categoryType === 'cafe' || categoryType === 'dining') {
      // 为非food类型的数据添加category字段
      placesData = placesData.map(place => ({
        ...place,
        category: categoryType
      }));
    }

    // 3. 获取巴厘岛当前时间
    const currentBaliTime = getCurrentBaliTime();
    console.log(`Current Bali time: ${currentBaliTime.toISOString()}`);

    // 4. 为每个场所计算当前的isOpenNow状态并创建BaliciagaCafe实例
    const baliciagaPlaces = placesData.map(placeData => {
      // 计算当前营业状态，传入businessStatus参数
      const isOpenNow = calculateIsOpenNow(placeData.openingPeriods, currentBaliTime, placeData.businessStatus);
      
      // 创建包含计算后的isOpenNow的数据对象
      const processedData = {
        ...placeData,
        isOpenNow
      };
      
      // 创建BaliciagaCafe实例
      return new BaliciagaCafe({}, processedData);
    });
    
    console.log(`Successfully processed ${baliciagaPlaces.length} ${categoryType || 'cafe'} places with real-time open status.`);

    // 初始化缓存对象如果不存在
    if (!cafesCache) {
      cafesCache = {};
    }
    cafesCache[cacheKey] = baliciagaPlaces; // 缓存BaliciagaCafe实例
    cacheTimestamp = now;
    
    return baliciagaPlaces;
  } catch (error) {
    console.error(`Error in WorkspacePlaces for ${categoryType}:`, error);
    // 错误时不缓存
    if (cafesCache) {
      delete cafesCache[cacheKey];
    }
    throw error;
  }
}

/**
 * 根据placeId获取单个场所详情 (BaliciagaCafe 实例)
 * @param {string} placeId - 场所的Place ID
 * @param {string} categoryType - 分类类型 ('cafe', 'bar', 'cowork', 'dining', 'food')
 * @returns {Promise<BaliciagaCafe|null>} BaliciagaCafe实例或null
 */
async function WorkspacePlaceDetails(placeId, categoryType) {
  try {
    // 先尝试从缓存获取所有场所
    let places;
    const now = Date.now();
    const cacheKey = categoryType || 'cafe';
    
    if (cafesCache && cafesCache[cacheKey] && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
      console.log(`Using cached ${categoryType || 'cafe'} data to find specific place`);
      places = cafesCache[cacheKey];
    } else {
      // 如果没有缓存，则调用主函数获取所有场所
      places = await WorkspacePlaces(categoryType);
    }
    
    // 查找特定placeId的场所
    const place = places.find(p => p.placeId === placeId);
    
    if (!place) {
      console.warn(`No place found with placeId ${placeId} in category ${categoryType || 'cafe'}`);
      return null;
    }
    
    return place;
  } catch (error) {
    console.error(`Error in WorkspacePlaceDetails for ${placeId} in category ${categoryType}:`, error);
    throw error;
  }
}

// API路由 - 获取所有场所
app.get('/places', async (req, res) => {
  try {
    const categoryType = req.query.type;
    const places = await WorkspacePlaces(categoryType);
    res.json(places.map(place => place.toJSON()));
  } catch (error) {
    console.error('GET /places - Error fetching places:', error.message);
    res.status(502).json({ error: 'Failed to fetch places', message: error.message });
  }
});

// API路由 - 获取特定场所详情
app.get('/places/:placeId', async (req, res) => {
  try {
    const categoryType = req.query.type;
    const place = await WorkspacePlaceDetails(req.params.placeId, categoryType);
    
    if (!place) {
      return res.status(404).json({ error: 'Place not found' });
    }
    
    res.json(place.toJSON());
  } catch (error) {
    console.error(`GET /places/${req.params.placeId} - Error fetching place details:`, error.message);
    res.status(502).json({ error: 'Failed to fetch place details', message: error.message });
  }
});

// 创建serverless处理器
const handler = serverless(app);

// 导出处理函数，供AWS Lambda使用
module.exports.handler = async (event, context) => {
  // 返回serverless处理器的结果
  return await handler(event, context);
};

// 导出工作空间函数，供本地开发和测试使用
module.exports.WorkspacePlaces = WorkspacePlaces;
module.exports.WorkspacePlaceDetails = WorkspacePlaceDetails;