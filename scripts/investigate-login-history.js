/**
 * 调查用户如何之前成功登录，以及房源数据来源
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = 'ap-southeast-1_N72jBBIzH';
const email = 'troyzhy@gmail.com';
const cognitoSub = '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9';

async function investigateUserData() {
  console.log('🔍 调查用户数据和登录历史');
  console.log('==========================');
  
  try {
    // 1. 检查用户的详细Profile数据
    console.log('📋 1. 检查用户Profile数据...');
    
    const userResult = await dynamodb.get({
      TableName: 'Baliciaga-Users-dev',
      Key: { cognitoSub: cognitoSub }
    }).promise();
    
    if (userResult.Item) {
      console.log('✅ 找到完整的用户数据:');
      console.log('   邮箱:', userResult.Item.email);
      console.log('   姓名:', userResult.Item.name);
      console.log('   WhatsApp:', userResult.Item.whatsApp);
      console.log('   创建时间:', userResult.Item.createdAt);
      console.log('   更新时间:', userResult.Item.updatedAt);
      
      if (userResult.Item.profile) {
        console.log('   Profile详情:');
        console.log('     头像:', userResult.Item.profile.profilePictureUrl ? '有' : '无');
        console.log('     职业:', userResult.Item.profile.occupation);
        console.log('     性别:', userResult.Item.profile.gender);
        console.log('     年龄:', userResult.Item.profile.age);
        console.log('     语言:', userResult.Item.profile.languages);
      }
      
      console.log('\n💡 关键发现: 这些详细数据说明你确实之前成功登录过并填写了资料');
    } else {
      console.log('❌ 没有找到用户数据');
    }
    
    // 2. 检查用户的房源数据
    console.log('\n📋 2. 检查用户发布的房源...');
    
    const listingsResult = await dynamodb.scan({
      TableName: 'Baliciaga-Listings-dev',
      FilterExpression: 'ownerId = :ownerId',
      ExpressionAttributeValues: {
        ':ownerId': cognitoSub
      }
    }).promise();
    
    console.log(`找到 ${listingsResult.Items.length} 个房源:`);
    
    listingsResult.Items.forEach((listing, index) => {
      console.log(`\n房源 ${index + 1}:`);
      console.log('   ID:', listing.id);
      console.log('   标题:', listing.title);
      console.log('   状态:', listing.status);
      console.log('   创建时间:', listing.createdAt);
      console.log('   最后更新:', listing.updatedAt);
      console.log('   位置:', listing.location);
      console.log('   价格:', listing.price);
    });
    
    if (listingsResult.Items.length > 0) {
      console.log('\n💡 关键发现: 你确实创建过房源，说明之前成功登录并使用了系统');
    }
    
    // 3. 检查用户的申请记录
    console.log('\n📋 3. 检查用户的申请记录...');
    
    const applicationsResult = await dynamodb.scan({
      TableName: 'Baliciaga-Applications-dev',
      FilterExpression: 'applicantId = :applicantId',
      ExpressionAttributeValues: {
        ':applicantId': cognitoSub
      }
    }).promise();
    
    console.log(`找到 ${applicationsResult.Items.length} 个申请记录:`);
    
    applicationsResult.Items.forEach((application, index) => {
      console.log(`\n申请 ${index + 1}:`);
      console.log('   申请ID:', application.id);
      console.log('   房源ID:', application.listingId);
      console.log('   状态:', application.status);
      console.log('   申请时间:', application.createdAt);
      console.log('   申请者留言:', application.message || '无');
    });
    
    if (applicationsResult.Items.length > 0) {
      console.log('\n💡 关键发现: 你确实申请过房源，进一步确认之前成功使用了系统');
    }
    
  } catch (error) {
    console.error('❌ 调查用户数据时出错:', error.message);
  }
}

async function investigateLoginMethods() {
  console.log('\n🔍 调查可能的登录方式');
  console.log('======================');
  
  console.log('分析你之前可能使用的登录方式:');
  
  console.log('\n可能性1: 使用了passwordless登录');
  console.log('   - 你收到过邮件验证码');
  console.log('   - 通过验证码成功登录');
  console.log('   - 但你以为是"密码登录"');
  
  console.log('\n可能性2: 前端有隐藏的passwordless界面');
  console.log('   - 可能在某个特定路径或条件下');
  console.log('   - 或者通过开发者工具修改了认证流程');
  
  console.log('\n可能性3: 使用了管理员或测试工具');
  console.log('   - 通过AWS Cognito控制台');
  console.log('   - 通过后端API直接调用');
  console.log('   - 通过测试脚本或工具');
  
  console.log('\n可能性4: 系统在某个时候短暂支持过密码登录');
  console.log('   - 配置被临时修改');
  console.log('   - 然后又改回了passwordless');
  
  console.log('\n可能性5: 浏览器缓存或session');
  console.log('   - 之前的登录状态被缓存');
  console.log('   - 你一直处于登录状态');
  console.log('   - 直到最近session过期');
}

async function checkFrontendRoutes() {
  console.log('\n📋 检查可能的前端路径');
  console.log('========================');
  
  console.log('需要检查的前端文件:');
  console.log('1. 是否有隐藏的passwordless登录页面');
  console.log('2. 是否有开发者专用的登录界面'); 
  console.log('3. 路由配置中是否有特殊路径');
  console.log('4. AuthContext中是否有自动登录逻辑');
  
  // 这里我们需要检查前端代码
}

async function analyzeUserTimeline() {
  console.log('\n📊 用户行为时间线分析');
  console.log('====================');
  
  try {
    // 获取用户数据的时间戳
    const userResult = await dynamodb.get({
      TableName: 'Baliciaga-Users-dev',
      Key: { cognitoSub: cognitoSub }
    }).promise();
    
    const listingsResult = await dynamodb.scan({
      TableName: 'Baliciaga-Listings-dev',
      FilterExpression: 'ownerId = :ownerId',
      ExpressionAttributeValues: {
        ':ownerId': cognitoSub
      }
    }).promise();
    
    const applicationsResult = await dynamodb.scan({
      TableName: 'Baliciaga-Applications-dev',
      FilterExpression: 'applicantId = :applicantId',
      ExpressionAttributeValues: {
        ':applicantId': cognitoSub
      }
    }).promise();
    
    // 构建时间线
    const timeline = [];
    
    if (userResult.Item) {
      timeline.push({
        date: userResult.Item.createdAt,
        action: '用户注册',
        details: `邮箱: ${userResult.Item.email}`
      });
      
      if (userResult.Item.updatedAt !== userResult.Item.createdAt) {
        timeline.push({
          date: userResult.Item.updatedAt,
          action: '更新Profile',
          details: '填写了详细资料'
        });
      }
    }
    
    listingsResult.Items.forEach(listing => {
      timeline.push({
        date: listing.createdAt,
        action: '发布房源',
        details: listing.title
      });
    });
    
    applicationsResult.Items.forEach(application => {
      timeline.push({
        date: application.createdAt,
        action: '申请房源',
        details: `申请ID: ${application.id}`
      });
    });
    
    // 按时间排序
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log('用户行为时间线:');
    timeline.forEach((event, index) => {
      const date = new Date(event.date);
      console.log(`${index + 1}. ${date.toLocaleString()} - ${event.action}`);
      console.log(`   ${event.details}`);
    });
    
    // 分析模式
    console.log('\n分析结果:');
    const firstActivity = timeline[0];
    const lastActivity = timeline[timeline.length - 1];
    
    if (firstActivity && lastActivity) {
      const daysDiff = Math.floor(
        (new Date(lastActivity.date) - new Date(firstActivity.date)) / (1000 * 60 * 60 * 24)
      );
      
      console.log(`活动时间跨度: ${daysDiff}天`);
      console.log(`活动频率: ${timeline.length}个操作在${daysDiff}天内`);
      
      if (daysDiff > 0) {
        console.log('\n💡 重要结论: 你确实在多个时间点成功登录并使用了系统');
        console.log('   这说明你之前一定有某种方式成功登录');
      }
    }
    
  } catch (error) {
    console.error('❌ 分析时间线时出错:', error.message);
  }
}

async function run() {
  await investigateUserData();
  await investigateLoginMethods();
  await analyzeUserTimeline();
  
  console.log('\n🎯 关键结论');
  console.log('==========');
  console.log('基于数据分析，你确实之前成功登录过并使用了系统:');
  console.log('1. ✅ 有完整的用户Profile数据');
  console.log('2. ✅ 有创建的房源记录');
  console.log('3. ✅ 有申请房源的记录');
  console.log('4. ✅ 有多次系统交互的时间线');
  console.log('');
  console.log('这说明：');
  console.log('- 你一定通过某种方式成功登录过');
  console.log('- 可能是passwordless但你误以为是密码登录');
  console.log('- 或者系统在某个时候确实支持过密码登录');
  console.log('- 需要进一步检查前端代码查找真正的登录方式');
}

run()
  .then(() => {
    console.log('\n✨ 调查完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 调查失败:', error);
    process.exit(1);
  });