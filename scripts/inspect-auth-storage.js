console.log(`
=== AWS Amplify 认证存储机制调查 ===

根据AWS Amplify文档和代码分析，AWS Cognito在localStorage中存储认证信息的键名格式为：

CognitoIdentityServiceProvider.{userPoolClientId}.{username}.{tokenType}

其中：
- userPoolClientId: Cognito User Pool Client ID
- username: 用户名（通常是email）
- tokenType: 令牌类型（accessToken, idToken, refreshToken）

对于我们的应用（User Pool Client ID: 3n9so3j4rlh21mebhjo39nperk），键名格式为：

例如用户 'test@baliciaga.com' 的键名：
- CognitoIdentityServiceProvider.3n9so3j4rlh21mebhjo39nperk.test@baliciaga.com.accessToken
- CognitoIdentityServiceProvider.3n9so3j4rlh21mebhjo39nperk.test@baliciaga.com.idToken  
- CognitoIdentityServiceProvider.3n9so3j4rlh21mebhjo39nperk.test@baliciaga.com.refreshToken

其他可能的认证相关键名：
- CognitoIdentityServiceProvider.3n9so3j4rlh21mebhjo39nperk.LastAuthUser (最后登录的用户名)
- aws.cognito.signin.user.admin (可能包含用户信息)

值的格式：
- accessToken 和 idToken: JWT 格式的字符串，以 'eyJ' 开头
- refreshToken: 较长的随机字符串
- 其他键: 通常是简单的字符串值

为了在E2E测试中绕过登录，需要在localStorage中设置这些键值对。
`);

// 示例：模拟已登录状态的localStorage设置
const mockAuthData = {
  clientId: '3n9so3j4rlh21mebhjo39nperk',
  username: 'test@baliciaga.com',
  // JWT格式的模拟token（仅用于前端状态，不能用于实际API调用）
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  idToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  refreshToken: 'mock-refresh-token-string-123456789'
};

console.log(`
=== 模拟登录状态的localStorage设置示例 ===

// 在浏览器控制台或E2E测试中执行：
localStorage.setItem('CognitoIdentityServiceProvider.${mockAuthData.clientId}.${mockAuthData.username}.accessToken', '${mockAuthData.accessToken}');
localStorage.setItem('CognitoIdentityServiceProvider.${mockAuthData.clientId}.${mockAuthData.username}.idToken', '${mockAuthData.idToken}');
localStorage.setItem('CognitoIdentityServiceProvider.${mockAuthData.clientId}.${mockAuthData.username}.refreshToken', '${mockAuthData.refreshToken}');
localStorage.setItem('CognitoIdentityServiceProvider.${mockAuthData.clientId}.LastAuthUser', '${mockAuthData.username}');

注意：这些是模拟的令牌，只能用于绕过前端认证状态检查，不能用于实际的API调用。
`); 