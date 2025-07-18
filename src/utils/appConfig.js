/**
 * 配置管理模块
 * 根据环境自动从不同源加载配置
 * - 本地开发环境: 从 .env 文件加载
 * - AWS Lambda 环境: 从 AWS SSM Parameter Store 加载
 */
const path = require('path');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// 配置缓存
let configCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存有效期

/**
 * 从 SSM Parameter Store 获取参数
 * @param {string} parameterName - 参数名称
 * @param {boolean} withDecryption - 是否解密 (默认为 true)
 * @returns {Promise<string>} 参数值
 */
async function getSsmParameter(parameterName, withDecryption = true) {
  const region = process.env.AWS_REGION || 'ap-southeast-1';
  const client = new SSMClient({ region });
  
  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: withDecryption
    });
    
    const response = await client.send(command);
    return response.Parameter.Value;
  } catch (error) {
    console.error(`Error fetching parameter ${parameterName} from SSM:`, error);
    throw new Error(`Failed to load parameter ${parameterName} from SSM: ${error.message}`);
  }
}

/**
 * 加载配置
 * 根据环境从不同来源加载配置
 * @returns {Promise<Object>} 配置对象
 */
async function loadConfig() {
  // 判断当前环境
  const isOffline = process.env.IS_OFFLINE === 'true';
  const isActualLambdaEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_NAME && !isOffline;
  
  let config = {};
  
  if (isActualLambdaEnvironment) {
    console.log("Running in ACTUAL AWS Lambda environment. Fetching config from SSM.");
    
    // 从环境变量读取SSM参数路径
    const s3BucketNamePath = process.env.S3_BUCKET_NAME_SSM_PATH;
    const s3CafeDataFileKeyPath = process.env.S3_CAFE_DATA_FILE_KEY_SSM_PATH;
    const s3BarDataFileKeyPath = process.env.S3_BAR_DATA_FILE_KEY_SSM_PATH;
    
    if (!s3BucketNamePath || !s3CafeDataFileKeyPath || !s3BarDataFileKeyPath) {
      throw new Error('Required SSM path environment variables are not set: S3_BUCKET_NAME_SSM_PATH, S3_CAFE_DATA_FILE_KEY_SSM_PATH, S3_BAR_DATA_FILE_KEY_SSM_PATH');
    }
    
    try {
      // 并行获取所有SSM参数 (移除了 MAPS_API_KEY 的获取)
      const [s3BucketName, s3CafeDataFileKey, s3BarDataFileKey] = await Promise.all([
        getSsmParameter(s3BucketNamePath),
        getSsmParameter(s3CafeDataFileKeyPath),
        getSsmParameter(s3BarDataFileKeyPath)
      ]);
      
      config = {
        // MAPS_API_KEY 在 AWS 环境中不再获取，Lambda API 处理程序不需要此密钥
        S3_BUCKET_NAME: s3BucketName,
        S3_DATA_FILE_KEYS: {
          cafe: s3CafeDataFileKey,
          bar: s3BarDataFileKey
        },
        AWS_REGION: process.env.AWS_REGION || 'ap-southeast-1'
      };
      
      console.log("Successfully loaded config parameters from SSM (excluding MAPS_API_KEY).");
    } catch (error) {
      console.error("Failed to load required parameters from SSM:", error);
      throw new Error(`Critical configuration error: ${error.message}`);
    }
  } else {
    if (isOffline) {
      console.log("Running in local serverless-offline environment. Loading config from .env file.");
    } else {
      console.log("Running in local Node.js script environment. Loading config from .env file.");
    }
    
    // 从 .env 文件加载配置 (保留本地环境的 MAPS_API_KEY 逻辑)
    config = {
      MAPS_API_KEY: process.env.MAPS_API_KEY,
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || 'baliciaga-database',
      S3_DATA_FILE_KEYS: {
        cafe: process.env.LOCAL_S3_CAFE_DATA_FILE_KEY || 'data/cafes.json',
        bar: process.env.LOCAL_S3_BAR_DATA_FILE_KEY || 'data/bars.json'
      },
      AWS_REGION: process.env.AWS_REGION || 'ap-southeast-1',
      // Add AWS credentials for local environment
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN || undefined
    };
    
    // 验证关键配置项
    if (!config.MAPS_API_KEY) {
      console.warn('警告: 未设置 MAPS_API_KEY 环境变量，API调用可能会失败。');
    }
    
    if (!config.S3_BUCKET_NAME) {
      console.warn('警告: 未设置 S3_BUCKET_NAME 环境变量，使用默认值 "baliciaga-database"。');
    }
    
    if (!config.S3_DATA_FILE_KEYS.cafe) {
      console.warn('警告: 未设置 LOCAL_S3_CAFE_DATA_FILE_KEY 环境变量，使用默认值 "data/cafes.json"。');
    }
    
    if (!config.S3_DATA_FILE_KEYS.bar) {
      console.warn('警告: 未设置 LOCAL_S3_BAR_DATA_FILE_KEY 环境变量，使用默认值 "data/bars.json"。');
    }
    
    if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
      console.warn('警告: 未设置 AWS_ACCESS_KEY_ID 或 AWS_SECRET_ACCESS_KEY 环境变量，AWS SDK调用可能会失败。');
    }
  }
  
  return config;
}

/**
 * 获取配置对象
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig() {
  const now = Date.now();
  
  // 如果缓存有效，则直接返回缓存的配置
  if (configCache && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    return configCache;
  }
  
  // 加载新的配置
  const config = await loadConfig();
  
  // 更新缓存
  configCache = config;
  cacheTimestamp = now;
  
  return config;
}

module.exports = {
  getConfig,
  getSsmParameter // 导出此函数以便其他模块可能需要直接使用它
}; 