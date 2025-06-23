/**
 * 调查系统何时出现问题，分析变更历史
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = 'ap-southeast-1_N72jBBIzH';
const USERS_TABLE = 'Baliciaga-Users-dev';

async function investigateUserHistory() {
  console.log('🔍 调查用户注册历史和时间线');
  console.log('=============================');
  
  try {
    // 1. 获取所有用户的创建时间
    console.log('📋 1. 分析所有用户的注册时间...');
    
    const cognitoUsers = await cognito.listUsers({
      UserPoolId: USER_POOL_ID,
      Limit: 60
    }).promise();
    
    console.log(`找到 ${cognitoUsers.Users.length} 个Cognito用户:`);
    
    const userTimeline = cognitoUsers.Users.map(user => {
      const emailAttr = user.Attributes.find(attr => attr.Name === 'email');
      return {
        email: emailAttr?.Value || 'unknown',
        cognitoSub: user.Username,
        status: user.UserStatus,
        createdAt: user.UserCreateDate,
        lastModified: user.UserLastModifiedDate,
        enabled: user.Enabled
      };
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    console.log('\n用户注册时间线:');
    userTimeline.forEach((user, index) => {
      const createDate = new Date(user.createdAt);
      const daysDiff = Math.floor((Date.now() - createDate.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   创建: ${createDate.toISOString()} (${daysDiff}天前)`);
      console.log(`   状态: ${user.status} | 启用: ${user.enabled}`);
      console.log(`   CognitoSub: ${user.cognitoSub}`);
    });
    
    // 2. 分析DynamoDB用户数据
    console.log('\n📋 2. 分析DynamoDB用户数据完整性...');
    
    const dbUsers = await dynamodb.scan({
      TableName: USERS_TABLE
    }).promise();
    
    console.log(`DynamoDB中有 ${dbUsers.Items.length} 个用户记录:`);
    
    const dbTimeline = dbUsers.Items.map(user => ({
      email: user.email,
      cognitoSub: user.cognitoSub,
      hasProfile: !!user.profile,
      hasName: !!(user.name || user.profile?.name),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    })).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    dbTimeline.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   DB创建: ${user.createdAt}`);
      console.log(`   有Profile: ${user.hasProfile} | 有姓名: ${user.hasName}`);
    });
    
    // 3. 交叉对比分析
    console.log('\n📋 3. 交叉对比分析...');
    
    const cognitoEmails = new Set(userTimeline.map(u => u.email));
    const dbEmails = new Set(dbTimeline.map(u => u.email));
    
    console.log('数据一致性检查:');
    console.log(`Cognito用户数: ${cognitoEmails.size}`);
    console.log(`DynamoDB记录数: ${dbEmails.size}`);
    
    const orphanCognito = userTimeline.filter(u => !dbEmails.has(u.email));
    const orphanDb = dbTimeline.filter(u => !cognitoEmails.has(u.email));
    
    if (orphanCognito.length > 0) {
      console.log('\n⚠️  孤立的Cognito用户（有Cognito无DynamoDB）:');
      orphanCognito.forEach(user => {
        console.log(`   ${user.email} - 创建于 ${user.createdAt}`);
      });
    }
    
    if (orphanDb.length > 0) {
      console.log('\n⚠️  孤立的DynamoDB记录（有DynamoDB无Cognito）:');
      orphanDb.forEach(user => {
        console.log(`   ${user.email} - 创建于 ${user.createdAt}`);
      });
    }
    
    // 4. 分析认证方式模式
    console.log('\n📋 4. 分析不同用户的认证方式...');
    
    for (const user of userTimeline.slice(0, 5)) { // 只检查前5个用户避免太多API调用
      console.log(`\n检查用户: ${user.email}`);
      
      try {
        // 测试密码认证
        await cognito.adminInitiateAuth({
          UserPoolId: USER_POOL_ID,
          ClientId: '3n9so3j4rlh21mebhjo39nperk',
          AuthFlow: 'ADMIN_NO_SRP_AUTH',
          AuthParameters: {
            USERNAME: user.cognitoSub,
            PASSWORD: 'test123'
          }
        }).promise();
        console.log('   ✅ 支持密码认证');
      } catch (error) {
        if (error.code === 'InvalidParameterException') {
          console.log('   ❌ 不支持密码认证（passwordless）');
        } else if (error.code === 'NotAuthorizedException') {
          console.log('   ✅ 支持密码认证（但密码错误）');
        } else {
          console.log(`   🤔 未知状态: ${error.code}`);
        }
      }
    }
    
    // 5. 检查最近的系统变更
    console.log('\n📋 5. 检查可能的系统变更...');
    
    console.log('可能导致问题的变更:');
    console.log('1. Lambda函数部署更新');
    console.log('2. Cognito用户池配置修改');
    console.log('3. 前端代码更新');
    console.log('4. 环境变量或配置变更');
    
    // 检查最近创建的用户是否都是passwordless
    const recentUsers = userTimeline.filter(user => {
      const daysDiff = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7; // 最近7天
    });
    
    console.log(`\n最近7天创建的用户 (${recentUsers.length}个):`);
    recentUsers.forEach(user => {
      const createDate = new Date(user.createdAt);
      console.log(`   ${user.email} - ${createDate.toLocaleDateString()}`);
    });
    
    if (recentUsers.length > 0) {
      console.log('\n如果最近的用户都是passwordless，说明问题是最近出现的');
    }
    
  } catch (error) {
    console.error('❌ 调查过程中出错:', error.message);
  }
}

async function checkSystemConfiguration() {
  console.log('\n🔧 检查系统配置历史');
  console.log('==================');
  
  try {
    // 检查Cognito配置
    const poolResult = await cognito.describeUserPool({
      UserPoolId: USER_POOL_ID
    }).promise();
    
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: '3n9so3j4rlh21mebhjo39nperk'
    }).promise();
    
    console.log('当前Cognito配置:');
    console.log('用户池:');
    console.log(`   创建时间: ${poolResult.UserPool.CreationDate}`);
    console.log(`   最后修改: ${poolResult.UserPool.LastModifiedDate}`);
    console.log(`   用户名属性: ${poolResult.UserPool.UsernameAttributes}`);
    console.log(`   自动验证: ${poolResult.UserPool.AutoVerifiedAttributes}`);
    
    console.log('\n客户端配置:');
    console.log(`   创建时间: ${clientResult.UserPoolClient.CreationDate}`);
    console.log(`   最后修改: ${clientResult.UserPoolClient.LastModifiedDate}`);
    console.log(`   认证流程: ${clientResult.UserPoolClient.ExplicitAuthFlows}`);
    
    // 分析配置变更
    const poolModified = new Date(poolResult.UserPool.LastModifiedDate);
    const clientModified = new Date(clientResult.UserPoolClient.LastModifiedDate);
    const daysSincePoolModified = Math.floor((Date.now() - poolModified.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceClientModified = Math.floor((Date.now() - clientModified.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`\n配置修改时间分析:`);
    console.log(`   用户池最后修改: ${daysSincePoolModified}天前`);
    console.log(`   客户端最后修改: ${daysSinceClientModified}天前`);
    
    if (daysSincePoolModified <= 7 || daysSinceClientModified <= 7) {
      console.log('⚠️  最近一周内有配置修改，这可能是问题原因');
    }
    
  } catch (error) {
    console.error('❌ 检查配置时出错:', error.message);
  }
}

async function analyzePatterns() {
  console.log('\n📊 模式分析');
  console.log('==========');
  
  console.log('基于数据分析，可能的情况:');
  console.log('\n情况1: 系统最近发生了变更');
  console.log('   - 某个Lambda函数或配置被修改');
  console.log('   - 导致新用户注册方式改变');
  console.log('   - 老用户正常，新用户有问题');
  
  console.log('\n情况2: 前端代码回滚或更新');
  console.log('   - SignUpPage的实现被意外删除');
  console.log('   - 或者从未正确实现过');
  console.log('   - 之前可能通过其他方式注册');
  
  console.log('\n情况3: 环境配置变更');
  console.log('   - 环境变量被修改');
  console.log('   - Cognito触发器配置变更');
  console.log('   - SES配置问题影响注册流程');
  
  console.log('\n情况4: 测试数据混淆');
  console.log('   - 之前的"正常注册"可能是测试环境');
  console.log('   - 或者通过管理员工具创建');
  console.log('   - 实际的前端注册一直有问题');
}

async function run() {
  await investigateUserHistory();
  await checkSystemConfiguration();
  await analyzePatterns();
  
  console.log('\n🎯 关键问题');
  console.log('==========');
  console.log('需要确认的关键信息:');
  console.log('1. 之前正常注册的用户是通过什么方式注册的？');
  console.log('2. 最近是否有代码部署或配置变更？');
  console.log('3. SignUpPage.tsx的TODO是最近添加的还是一直存在？');
  console.log('4. 之前的用户是否都支持密码登录？');
}

run()
  .then(() => {
    console.log('\n✨ 时间线调查完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 调查失败:', error);
    process.exit(1);
  });