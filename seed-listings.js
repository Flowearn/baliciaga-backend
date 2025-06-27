#!/usr/bin/env node

/**
 * 数据清理脚本包装器
 * 
 * 用途：清除DynamoDB中的所有房源和申请记录，以及S3中的相关图片
 * 使用方法：从项目根目录运行 `node scripts/reset-listings-data.js`
 * 
 * 注意：此脚本会永久删除所有数据，请谨慎使用！
 */

const { spawn } = require('child_process');
const path = require('path');

console.log("⚠️  警告：此操作将永久删除所有房源数据！");
console.log("包括：房源记录、申请记录、S3中的图片文件");
console.log("");

// 切换到backend目录并运行脚本
const backendDir = path.join(__dirname, '..', 'backend');
const scriptPath = path.join(backendDir, 'reset-listings-data.js');

const child = spawn('node', ['reset-listings-data.js'], {
    cwd: backendDir,
    stdio: 'inherit'
});

child.on('close', (code) => {
    process.exit(code);
});

child.on('error', (error) => {
    console.error('执行脚本时出错:', error);
    process.exit(1);
}); 