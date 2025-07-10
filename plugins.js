// backend/plugins.js
'use strict';

// 基础插件，在所有环境中都需要
const basePlugins = [
  'serverless-prune-plugin',
  // 在这里可以添加其他所有环境都需要的插件
];

// 仅在本地开发 (offline命令) 时加载的插件
const offlinePlugins = [
  'serverless-offline',
  'serverless-dotenv-plugin',
  'serverless-dynamodb', // 注意：如果serverless-dynamodb也不用于部署，则放在这里
];

// 通过检查Serverless执行的命令来判断是否为本地开发模式
const isOffline = process.argv.includes('offline');

module.exports = isOffline ? [...basePlugins, ...offlinePlugins] : basePlugins;