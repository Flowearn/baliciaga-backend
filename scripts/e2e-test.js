const { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } = require("@aws-sdk/client-cognito-identity-provider");
const readline = require('readline');

// --- 配置区 ---
// 请用 serverless.yml 中的真实值替换下面的占位符
const REGION = 'ap-southeast-1';
const USER_POOL_ID = 'ap-southeast-1_gaX6b4Idb';
const CLIENT_ID = '1q1g3dq456j4jgg2iqvt15o55i';

// 使用一个每次都不同的邮箱来确保测试的是"新用户"流程
const email = `test.user.${Date.now()}@example.com`;
// --- 结束配置 ---


const client = new CognitoIdentityProviderClient({
    region: REGION,
    // serverless-offline 会在本地3002端口模拟API Gateway，Cognito调用也通过它路由
    endpoint: "http://localhost:3002", 
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function runTest() {
    try {
        console.log(`[1/3] 🚀 开始认证流程，使用新邮箱: ${email}`);
        
        const initiateAuthCommand = new InitiateAuthCommand({
            AuthFlow: 'CUSTOM_AUTH',
            ClientId: CLIENT_ID,
            AuthParameters: {
                USERNAME: email, // 在无密码流程中，USERNAME就是email
            },
        });

        const initiateAuthResponse = await client.send(initiateAuthCommand);
        const session = initiateAuthResponse.Session;

        if (initiateAuthResponse.ChallengeName === 'CUSTOM_CHALLENGE') {
            console.log('[2/3] ✅ 成功触发自定义挑战。');
            console.log('👀 请检查正在运行 `serverless offline` 的终端，找到日志中的6位验证码。');

            rl.question('🔢 请在此处输入验证码: ', async (secretCode) => {
                const respondToChallengeCommand = new RespondToAuthChallengeCommand({
                    ChallengeName: 'CUSTOM_CHALLENGE',
                    ClientId: CLIENT_ID,
                    Session: session,
                    ChallengeResponses: {
                        USERNAME: email,
                        ANSWER: secretCode,
                    },
                });

                try {
                    const challengeResponse = await client.send(respondToChallengeCommand);
                    if (challengeResponse.AuthenticationResult) {
                        console.log('[3/3] ✅✅✅ 认证成功！已获取Token！');
                        console.log('ID Token:', challengeResponse.AuthenticationResult.IdToken.substring(0, 50) + '...');
                    } else {
                        console.error('❌ 验证失败:', challengeResponse);
                    }
                } catch (err) {
                    console.error('❌ 响应挑战时出错:', err);
                } finally {
                    rl.close();
                }
            });
        } else {
            console.error('❌ 未能触发自定义挑战:', initiateAuthResponse);
            rl.close();
        }
    } catch (err) {
        console.error('❌ 发起认证时出错:', err);
        rl.close();
    }
}

runTest(); 