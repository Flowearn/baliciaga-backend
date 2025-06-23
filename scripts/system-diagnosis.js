/**
 * 系统性诊断整个认证系统的问题
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
const CLIENT_ID = '3n9so3j4rlh21mebhjo39nperk';
const email = 'troyzhy@gmail.com';
const cognitoSub = '596ac5ac-b0b1-70d2-40ec-3b2a286f9df9';

async function diagnoseSystemIssues() {
  console.log('🔍 系统认证问题诊断报告');
  console.log('=========================');
  
  const issues = [];
  const findings = [];
  
  try {
    // 1. 前端注册问题诊断
    console.log('\n📋 1. 前端注册系统诊断');
    console.log('========================');
    
    console.log('❌ 问题1: SignUpPage.tsx 注册功能未实现');
    console.log('   文件: /frontend/src/pages/SignUpPage.tsx');
    console.log('   问题: 第63-66行只有TODO注释，没有实际API调用');
    console.log('   影响: 用户无法通过前端正常注册');
    
    issues.push({
      severity: 'HIGH',
      component: 'Frontend SignUp',
      issue: '注册功能完全未实现',
      file: 'SignUpPage.tsx:63-66',
      impact: '用户无法注册'
    });
    
    console.log('✅ 发现: authService.ts 有完整的注册方法');
    console.log('   - signUpWithPassword() - 密码注册');
    console.log('   - registerUser() - 无密码注册');
    console.log('   但前端页面没有调用这些方法');
    
    findings.push({
      component: 'Frontend Auth Service',
      status: 'OK',
      note: '认证服务完整，但未被前端调用'
    });
    
    // 2. 认证流程混乱诊断
    console.log('\n📋 2. 认证流程混乱诊断');
    console.log('======================');
    
    console.log('❌ 问题2: 多重认证方式导致混乱');
    console.log('   发现: 系统同时支持密码和无密码认证');
    console.log('   问题: 前端显示密码注册，但实际创建了无密码用户');
    
    // 检查用户池配置
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID
    }).promise();
    
    const authFlows = clientResult.UserPoolClient.ExplicitAuthFlows;
    console.log('   客户端支持的认证流程:', authFlows);
    
    const hasPassword = authFlows.includes('ALLOW_USER_SRP_AUTH');
    const hasCustom = authFlows.includes('ALLOW_CUSTOM_AUTH');
    
    if (hasPassword && hasCustom) {
      issues.push({
        severity: 'MEDIUM',
        component: 'Cognito Configuration',
        issue: '同时启用密码和无密码认证导致混乱',
        impact: '用户不知道应该使用哪种方式'
      });
    }
    
    // 3. Lambda函数问题诊断
    console.log('\n📋 3. Lambda函数问题诊断');
    console.log('========================');
    
    console.log('检查CreateAuthChallenge Lambda...');
    
    // 模拟CreateAuthChallenge调用
    const { handler: createHandler } = require('../src/features/auth/createChallenge');
    
    const mockEvent = {
      userName: cognitoSub,
      request: {
        userAttributes: {
          email: email,
          sub: cognitoSub
        }
      },
      response: {}
    };
    
    // 临时设置环境变量
    process.env.VERIFICATION_CODES_TABLE_NAME = 'baliciaga-verification-codes-dev';
    
    const createResult = await createHandler(mockEvent);
    console.log('✅ CreateAuthChallenge 本地测试成功');
    console.log('   生成的验证码:', createResult.response.privateChallengeParameters?.secretLoginCode);
    console.log('   邮箱参数:', createResult.response.privateChallengeParameters?.email);
    
    // 检查数据库存储
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const dbCheck1 = await dynamodb.get({
      TableName: 'baliciaga-verification-codes-dev',
      Key: { email: email }
    }).promise();
    
    const dbCheck2 = await dynamodb.get({
      TableName: 'baliciaga-verification-codes-dev',
      Key: { email: cognitoSub }
    }).promise();
    
    console.log('\n数据库存储检查:');
    console.log('   用真实邮箱查询:', dbCheck1.Item ? '找到' : '未找到');
    console.log('   用cognitoSub查询:', dbCheck2.Item ? '找到' : '未找到');
    
    if (!dbCheck1.Item && dbCheck2.Item) {
      issues.push({
        severity: 'HIGH',
        component: 'CreateAuthChallenge Lambda',
        issue: '验证码存储使用了cognitoSub而不是真实邮箱',
        impact: '验证时查找不到验证码'
      });
    }
    
    // 4. 用户状态问题诊断
    console.log('\n📋 4. 用户状态问题诊断');
    console.log('======================');
    
    const userResult = await cognito.adminGetUser({
      UserPoolId: USER_POOL_ID,
      Username: cognitoSub
    }).promise();
    
    console.log('用户状态分析:');
    console.log('   状态:', userResult.UserStatus);
    console.log('   创建时间:', userResult.UserCreateDate);
    console.log('   是否启用:', userResult.Enabled);
    
    // 测试密码认证
    console.log('\n密码认证测试...');
    try {
      await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: cognitoSub,
          PASSWORD: 'test123'
        }
      }).promise();
      console.log('✅ 用户支持密码认证');
    } catch (error) {
      if (error.code === 'InvalidParameterException') {
        console.log('❌ 用户不支持密码认证（passwordless only）');
        findings.push({
          component: 'User Configuration',
          status: 'Passwordless Only',
          note: '用户只能使用无密码认证'
        });
      } else {
        console.log('⚠️  密码认证测试结果:', error.code);
      }
    }
    
    // 5. 前端后端不一致问题
    console.log('\n📋 5. 前端后端不一致问题');
    console.log('==========================');
    
    console.log('❌ 问题3: 前端后端认证方式不匹配');
    console.log('   前端: 显示密码注册表单，调用signInWithPassword()');
    console.log('   后端: 用户配置为passwordless认证');
    console.log('   结果: 用户无法使用密码登录');
    
    issues.push({
      severity: 'HIGH',
      component: 'Frontend-Backend Integration',
      issue: '前端密码登录与后端passwordless用户不匹配',
      impact: '用户无法登录'
    });
    
    // 6. 系统设计问题
    console.log('\n📋 6. 系统设计问题诊断');
    console.log('======================');
    
    console.log('❌ 问题4: 缺乏统一的认证策略');
    console.log('   问题: 没有明确定义使用密码还是无密码认证');
    console.log('   影响: 开发者和用户都不清楚应该使用哪种方式');
    
    console.log('❌ 问题5: 前端无passwordless登录界面');
    console.log('   问题: 只有密码登录表单，没有验证码输入页面');
    console.log('   影响: passwordless用户无法通过前端登录');
    
    issues.push({
      severity: 'MEDIUM',
      component: 'System Design',
      issue: '缺乏统一认证策略和对应UI',
      impact: '用户体验混乱'
    });
    
  } catch (error) {
    console.error('诊断过程中出错:', error.message);
  }
  
  // 生成问题总结
  console.log('\n🎯 问题总结报告');
  console.log('===============');
  
  console.log('\n严重问题 (需要立即修复):');
  issues.filter(i => i.severity === 'HIGH').forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.component}: ${issue.issue}`);
    console.log(`   影响: ${issue.impact}`);
    if (issue.file) console.log(`   文件: ${issue.file}`);
  });
  
  console.log('\n中等问题 (需要规划修复):');
  issues.filter(i => i.severity === 'MEDIUM').forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.component}: ${issue.issue}`);
    console.log(`   影响: ${issue.impact}`);
  });
  
  // 建议修复方案
  console.log('\n💡 建议修复方案');
  console.log('===============');
  
  console.log('\n短期修复 (立即):');
  console.log('1. 修复SignUpPage.tsx，调用signUpWithPassword()');
  console.log('2. 为现有passwordless用户设置密码，或');
  console.log('3. 在前端添加passwordless登录界面');
  
  console.log('\n中期修复 (本周):');
  console.log('1. 统一认证策略：选择密码或无密码作为主要方式');
  console.log('2. 修复CreateAuthChallenge的数据库存储key问题');
  console.log('3. 添加完整的前端无密码认证流程');
  
  console.log('\n长期改进 (下个版本):');
  console.log('1. 实现混合认证：用户可选择密码或无密码');
  console.log('2. 添加用户设置页面，允许切换认证方式');
  console.log('3. 完善错误处理和用户引导');
  
  return { issues, findings };
}

diagnoseSystemIssues()
  .then(() => {
    console.log('\n✨ 系统诊断完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 系统诊断失败:', error);
    process.exit(1);
  });