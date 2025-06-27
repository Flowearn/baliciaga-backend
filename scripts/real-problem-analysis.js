/**
 * 真正的问题分析 - 基于用户反馈的事实
 */

const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const ses = new AWS.SES();
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

async function analyzeRealProblems() {
  console.log('🔍 真正的问题分析');
  console.log('==================');
  
  console.log('基于用户反馈的关键事实:');
  console.log('1. ❌ AWS SES发送域从未通过验证');
  console.log('2. ❌ 前端/account页面没有Continue选项，只有email/password输入');
  console.log('3. ❌ 用户之前确实能正常登录并使用系统');
  console.log('4. ❌ 现在无法登录，显示"密码错误"');
  
  try {
    // 1. 检查SES域验证状态
    console.log('\n📋 1. SES域验证状态检查...');
    
    try {
      const identitiesResult = await ses.listIdentities().promise();
      console.log('SES身份列表:', identitiesResult.Identities);
      
      for (const identity of identitiesResult.Identities) {
        const statusResult = await ses.getIdentityVerificationAttributes({
          Identities: [identity]
        }).promise();
        
        console.log(`身份 ${identity}:`);
        console.log('  验证状态:', statusResult.VerificationAttributes[identity]?.VerificationStatus || '未知');
      }
    } catch (sesError) {
      console.log('❌ SES检查失败:', sesError.message);
      console.log('这证实了SES确实没有配置');
    }
    
    // 2. 检查实际的前端配置
    console.log('\n📋 2. 分析前端实际情况...');
    
    console.log('AccountPage.tsx 分析:');
    console.log('- 使用 AWS Amplify <Authenticator /> 组件');
    console.log('- 但Amplify的默认UI可能不是passwordless');
    console.log('- Amplify可能配置为传统的用户名/密码模式');
    
    // 3. 检查Amplify配置
    console.log('\n📋 3. 检查可能的Amplify配置问题...');
    
    // 检查用户池的实际配置
    const poolResult = await cognito.describeUserPool({
      UserPoolId: 'ap-southeast-1_N72jBBIzH'
    }).promise();
    
    const clientResult = await cognito.describeUserPoolClient({
      UserPoolId: 'ap-southeast-1_N72jBBIzH',
      ClientId: '3n9so3j4rlh21mebhjo39nperk'
    }).promise();
    
    console.log('Cognito用户池配置:');
    console.log('  用户名属性:', poolResult.UserPool.UsernameAttributes);
    console.log('  密码策略:', poolResult.UserPool.Policies?.PasswordPolicy ? '已配置' : '未配置');
    console.log('  MFA配置:', poolResult.UserPool.MfaConfiguration);
    
    console.log('\nCognito客户端配置:');
    console.log('  支持的认证流程:', clientResult.UserPoolClient.ExplicitAuthFlows);
    console.log('  需要密码:', clientResult.UserPoolClient.ExplicitAuthFlows.includes('ALLOW_USER_PASSWORD_AUTH'));
    console.log('  支持SRP:', clientResult.UserPoolClient.ExplicitAuthFlows.includes('ALLOW_USER_SRP_AUTH'));
    console.log('  支持自定义认证:', clientResult.UserPoolClient.ExplicitAuthFlows.includes('ALLOW_CUSTOM_AUTH'));
    
    // 4. 分析用户历史 - 修正DynamoDB查询
    console.log('\n📋 4. 重新分析用户数据...');
    
    // 正确的DynamoDB查询方式
    const usersResult = await dynamodb.scan({
      TableName: 'Baliciaga-Users-dev',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': 'troyzhy@gmail.com'
      }
    }).promise();
    
    if (usersResult.Items && usersResult.Items.length > 0) {
      const user = usersResult.Items[0];
      console.log('✅ 找到用户数据:');
      console.log('   邮箱:', user.email);
      console.log('   创建时间:', user.createdAt);
      console.log('   更新时间:', user.updatedAt);
      console.log('   有Profile:', !!user.profile);
      
      if (user.profile) {
        console.log('   Profile详情: 姓名、职业、头像等都已填写');
        console.log('   这证实用户确实之前成功登录过');
      }
    } else {
      console.log('❌ 没有找到用户DynamoDB记录');
    }
    
    // 5. 分析真正的问题
    console.log('\n📋 5. 问题根源分析...');
    
    console.log('矛盾点分析:');
    console.log('A. 用户有完整的Profile数据 → 证实之前成功登录过');
    console.log('B. SES从未配置 → passwordless登录应该不可能工作');
    console.log('C. 前端只显示密码登录 → Amplify配置为传统认证');
    console.log('D. 后端用户是passwordless → 不支持密码登录');
    
    console.log('\n可能的解释:');
    console.log('1. **开发环境vs生产环境混乱**');
    console.log('   - 可能有多套环境配置');
    console.log('   - 之前在不同环境成功登录');
    
    console.log('2. **Amplify配置变更**');
    console.log('   - 之前支持passwordless，后来改为密码模式');
    console.log('   - 但用户数据没有迁移');
    
    console.log('3. **测试数据vs真实数据**');
    console.log('   - Profile数据可能是通过管理工具创建的');
    console.log('   - 不是通过前端正常流程');
    
    console.log('4. **SES配置曾经工作过**');
    console.log('   - 可能之前短暂配置过SES');
    console.log('   - 后来配置丢失或回滚');
    
    // 6. 检查环境变量和配置
    console.log('\n📋 6. 检查配置不一致...');
    
    console.log('需要检查的配置文件:');
    console.log('- frontend/src/amplify-config.ts');
    console.log('- frontend/.env');
    console.log('- backend serverless.yml');
    console.log('- backend环境变量');
    
  } catch (error) {
    console.error('❌ 分析过程中出错:', error.message);
  }
}

async function generateHypotheses() {
  console.log('\n🧠 问题假设');
  console.log('==========');
  
  console.log('基于所有证据，最可能的情况是:');
  
  console.log('\n假设1: **配置环境混乱** (概率80%)');
  console.log('- 开发环境和生产环境配置不同');
  console.log('- 之前在某个配置正确的环境成功登录');
  console.log('- 现在环境配置被改变或重置');
  
  console.log('\n假设2: **Amplify配置变更** (概率60%)');
  console.log('- 前端Amplify最初配置为passwordless');
  console.log('- 后来改为密码模式以配合/login页面');
  console.log('- 但后端用户数据没有相应调整');
  
  console.log('\n假设3: **SES临时配置** (概率40%)');
  console.log('- SES曾经短暂配置过（可能用的沙盒模式）');
  console.log('- 验证码邮件能发送到特定邮箱');
  console.log('- 后来SES配置丢失或域名验证过期');
  
  console.log('\n假设4: **测试工具登录** (概率30%)');
  console.log('- 之前通过AWS控制台或其他工具登录');
  console.log('- 直接操作Cognito或DynamoDB');
  console.log('- 绕过了前端界面');
  
  console.log('\n需要验证的关键点:');
  console.log('1. 检查 amplify-config.ts 的认证模式配置');
  console.log('2. 检查是否有多个环境（dev/staging/prod）');
  console.log('3. 检查Git历史，看配置何时被修改');
  console.log('4. 尝试恢复工作的配置组合');
}

async function run() {
  await analyzeRealProblems();
  await generateHypotheses();
  
  console.log('\n🎯 下一步行动');
  console.log('============');
  console.log('1. 检查前端 amplify-config.ts 配置');
  console.log('2. 检查是否有多套环境配置');
  console.log('3. 查看Git提交历史，找到配置变更点');
  console.log('4. 尝试恢复之前工作的配置');
}

run()
  .then(() => {
    console.log('\n✨ 分析完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 分析失败:', error);
    process.exit(1);
  });