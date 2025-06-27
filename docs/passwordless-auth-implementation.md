# 无密码认证架构实现 (CC#67)

## 概述

本文档记录了 Baliciaga 项目从密码认证到无密码认证的架构重构过程，包含自动化测试后门的实现。

## 架构变更

### 1. Cognito App Client 配置

**禁用的认证流程：**
- `ALLOW_USER_PASSWORD_AUTH`
- `ALLOW_USER_SRP_AUTH`
- `ALLOW_ADMIN_USER_PASSWORD_AUTH`

**保留的认证流程：**
- `ALLOW_CUSTOM_AUTH` - 自定义认证流程（无密码）
- `ALLOW_REFRESH_TOKEN_AUTH` - 刷新令牌

### 2. Lambda 函数更新

#### CreateAuthChallenge Lambda
- 位置：`/backend/src/features/auth/createChallenge.js`
- 新增测试后门：
  - 当邮箱以 `@test.com` 结尾时，使用固定验证码 `123456`
  - 测试邮箱不发送实际邮件，减少 SES 调用

```javascript
const isTestEmail = email.endsWith('@test.com');
const secretLoginCode = isTestEmail ? '123456' : randomDigits(6).join('');
```

### 3. 前端更新

#### 移除的组件：
- `SignUpPage.tsx` - 密码注册页面
- `ConfirmSignUpPage.tsx` - 邮箱确认页面

#### 更新的组件：
- `LoginPage.tsx` - 改为仅输入邮箱，发送验证码
- `authService.ts` - 移除所有密码相关方法

#### 新增的组件：
- `VerifyAuthPage.tsx` - 验证码输入页面

#### 路由更新：
- 移除 `/signup` 和 `/confirm-signup` 路由
- 新增 `/verify` 路由用于验证码输入

## 认证流程

### 用户登录流程：
1. 用户在登录页输入邮箱
2. 系统调用 `sendVerificationCode()` 发送验证码
3. 用户跳转到验证页面输入6位验证码
4. 系统调用 `verifyCode()` 验证并完成登录

### 新用户流程：
1. 新用户直接输入邮箱（无需注册）
2. 系统自动创建用户并发送验证码
3. 用户输入验证码完成首次登录
4. 登录后引导用户完善个人资料

## 测试后门

### 使用方法：
1. 使用任何以 `@test.com` 结尾的邮箱
2. 验证码固定为 `123456`
3. 不会发送实际邮件

### 示例：
- `automation-test@test.com`
- `e2e-test@test.com`
- `playwright@test.com`

## 部署步骤

1. 更新 Cognito App Client 配置：
   ```bash
   node scripts/enable-passwordless-auth.js
   ```

2. 部署 Lambda 函数：
   ```bash
   npx serverless deploy
   ```

3. 测试无密码流程：
   ```bash
   node scripts/test-passwordless-flow.js
   ```

## 注意事项

1. **现有用户**：已存在的用户可以直接使用邮箱登录，无需重新注册
2. **测试环境**：测试后门仅在 `@test.com` 邮箱生效，生产邮箱不受影响
3. **安全性**：验证码5分钟有效，存储在 DynamoDB 中并自动过期
4. **邮件发送**：使用 AWS SES 发送验证码邮件

## 回滚方案

如需回滚到密码认证：
1. 运行 `scripts/enable-admin-auth.js` 恢复密码认证流程
2. 恢复前端的密码相关组件和路由
3. 重新部署应用

## 相关文件

- 后端脚本：
  - `/backend/scripts/enable-passwordless-auth.js`
  - `/backend/scripts/test-passwordless-flow.js`
  
- Lambda 函数：
  - `/backend/src/features/auth/createChallenge.js`
  - `/backend/src/features/auth/verifyChallenge.js`
  - `/backend/src/features/auth/defineChallenge.js`

- 前端组件：
  - `/frontend/src/pages/LoginPage.tsx`
  - `/frontend/src/pages/VerifyAuthPage.tsx`
  - `/frontend/src/services/authService.ts`