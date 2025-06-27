# Baliciaga Backend API

提供巴厘岛苍古地区(Canggu)精选咖啡馆数据的API服务，支持获取咖啡馆列表和单个咖啡馆详细信息，为Baliciaga应用的前端提供数据支持。

## 技术栈

* Node.js (v18.x)
* Serverless Framework (v3.x)
* AWS Lambda & API Gateway (部署目标)
* Google Places API (数据源)
* `axios` (用于HTTP请求)
* `dotenv` (用于本地环境变量管理)
* `serverless-offline` (用于本地开发和测试)
* `serverless-dotenv-plugin` (用于Serverless Framework加载.env文件)

## Project Overview & Key Features

* **Core Stack & Architecture:**
  * Built with Node.js and the Serverless Framework for deployment on AWS Lambda.
  * Exposes a RESTful API via AWS API Gateway.
  * Utilizes AWS S3 for storing the master `cafes.json` data file and all image assets (restaurant photos and static maps in WebP format under an `image-v2/` prefix).
  * Manages configuration (API keys, S3 details) via local `.env` files for development and AWS SSM Parameter Store for deployed Lambda environments (`dev` and `prod` stages).

* **Data Model (`BaliciagaCafe.js`):**
  * A robust model class handles data shaping and ensures only specific, desired fields are exposed via the API (e.g., excluding `address`, `priceLevel`, `types`, `attributions`).
  * Correctly maps Google Places API fields (e.g., `displayName`, `location`, `nationalPhoneNumber`, `userRatingCount`, new boolean attributes like `allowsDogs`) and preserves user-managed data (S3 photo URLs, `instagramUrl`, `gofoodUrl`).

* **API Endpoints:**
  * `GET /cafes`: Serves the list of all cafes.
  * `GET /cafes/{placeId}`: Serves details for a specific cafe.
  * Includes CORS configuration (e.g., `origin: '*'`) for `serverless-offline` to support local frontend development, and standard CORS for deployed stages.

* **Data Processing & Management Scripts (`scripts/` directory):**
  * **`preprocessLocalImages.js`**: Batch renames and converts new local restaurant images to lossless WebP format.
  * **`initializeNewCafesSkeleton.js`**: Interactively adds new cafes, fetches minimal Google data (`placeId`, `name`), renames local image folders, uploads pre-processed WebP restaurant photos to S3 `image-v2/`, and creates "skeleton" JSON entries with other details as placeholders. Updates the `dev` environment S3 JSON.
  * **`batchEnrichAndFinalizeAllCafes.js`**: The main data enrichment script. For all cafes (existing and new skeletons), it fetches comprehensive details from Google Places API (using a 13-field mask), intelligently merges this with existing data (preserving user-managed S3 WebP photo links and manual URLs), and generates/uploads new WebP static maps for new cafes. Outputs the final, complete JSON.
  * **`optimizeStaticMapsToWebP.js`**: Standalone script for static map optimization and WebP conversion with S3 upload functionality.

* **Configuration (`appConfig.js`)**: Smart configuration loading based on environment (local, `serverless-offline`, AWS Lambda via SSM), including a 5-minute cache for AWS-sourced configs.

* **Image Handling**: All images (restaurant photos and static maps) are processed into optimized WebP format and served from S3 via an `image-v2/` path.

## 项目设置与运行

### 先决条件

1. 安装 [Node.js](https://nodejs.org/) (版本 18.x 或更高)。
2. 全局安装 [Serverless Framework CLI](https://www.serverless.com/framework/docs/getting-started):
   ```bash
   npm install -g serverless
   ```
3. 拥有一个有效的Google Cloud Platform账户，并已创建一个API密钥，该密钥已启用 "Places API" 和 "Maps Static API"。

### 本地设置与运行

1. **克隆仓库 (如果适用) 或导航到项目目录:**
   ```bash
   cd path/to/BALICIAGA/backend
   ```

2. **创建 `.env` 文件:**
   在 `BALICIAGA/backend/` 目录下创建一个名为 `.env` 的文件，并添加您的Google Maps API密钥：
   ```env
   MAPS_API_KEY=YOUR_ACTUAL_Maps_API_KEY
   ```
   将 `YOUR_ACTUAL_Maps_API_KEY` 替换为您的真实密钥。

3. **安装依赖:**
   ```bash
   npm install
   ```

4. **启动本地开发服务器 (使用 `serverless-offline`):**
   ```bash
   npm run offline
   ```
   或者
   ```bash
   serverless offline
   ```
   服务启动后，API端点将在 `http://localhost:3006` 可用。

## API 端点

### 获取所有咖啡馆列表

* **URL:** `/cafes` (或 `/dev/cafes`，取决于本地运行时的stage)
* **方法:** `GET`
* **成功响应 (200 OK):** 返回一个包含所有符合条件的咖啡馆对象的JSON数组。每个对象结构遵循`BaliciagaCafe`模型。
* **错误响应 (示例):**
  * `500 Internal Server Error`: 如果获取数据失败。
  * `404 Not Found`: 如果路径不正确 (虽然`/cafes`路径下此错误不常见)。

### 获取单个咖啡馆详情

* **URL:** `/cafes/{placeId}` (或 `/dev/cafes/{placeId}`)
* **方法:** `GET`
* **路径参数:**
  * `placeId` (string, 必需): Google Places API返回的地点ID。
* **成功响应 (200 OK):** 返回一个包含指定`placeId`的单个咖啡馆对象的JSON。
* **错误响应 (示例):**
  * `404 Not Found`: 如果具有该`placeId`的咖啡馆未找到或获取失败。
  * `500 Internal Server Error`: 如果发生其他服务器错误。

## 项目结构

* `src/`: 包含主要的Lambda函数逻辑。
  * `api/`: 包含与外部API (Google Places)交互的服务。
  * `models/`: 包含数据模型定义 (如 `BaliciagaCafe.js`)。
  * `utils/`: 包含配置和工具函数 (如 `config.js`)。
  * `fetchCangguCafes.js`: Lambda处理程序和核心业务逻辑。
* `serverless.yml`: Serverless Framework的配置文件。
* `.env`: 存储环境变量（本地开发，不提交到Git）。
* `package.json`: 项目依赖和脚本。

## 注意事项

* 确保您的Google Maps API密钥安全，不要将其硬编码到代码中或提交到版本控制。`.env`文件已在`.gitignore`中配置为忽略。
* 在部署到AWS之前，您可能需要在AWS控制台或通过Serverless Framework配置Lambda函数的环境变量和IAM权限。
* 默认的本地开发端口为3006，如有需要可在`serverless.yml`中的`custom.serverless-offline.httpPort`字段修改。
* AWS部署区域默认为ap-southeast-1（新加坡区域），适合部署在亚洲地区使用的服务。如需更改，请修改`serverless.yml`中的`provider.region`字段。

## 部署到AWS

1. **确保您已配置AWS凭证:**
   ```bash
   serverless config credentials --provider aws --key YOUR_AWS_KEY --secret YOUR_AWS_SECRET
   ```

2. **部署服务:**
   ```bash
   serverless deploy
   ```
   或者指定特定的stage:
   ```bash
   serverless deploy --stage prod
   ```

3. **部署完成后，Serverless Framework将输出API Gateway端点URL，您可以使用该URL访问您的API。** 

## 近期主要更新 (自2025年5月下旬以来)

### **核心架构与配置管理**

#### **SSM Parameter Store 集成 (`appConfig.js`, `serverless.yml`)**
* 后端配置管理已完全重构为通过 **AWS SSM Parameter Store** 进行管理，实现环境与配置的解耦
* `serverless.yml` 中定义了指向SSM参数路径的环境变量，使用 `${sls:stage}` 实现多环境区分：
  - 开发环境: `/baliciaga/dev/s3DataFileKeyCafe`, `/baliciaga/dev/s3DataFileKeyBar`
  - 生产环境: `/baliciaga/prod/s3DataFileKeyCafe`, `/baliciaga/prod/s3DataFileKeyBar`
* `appConfig.js` 已升级，能根据 Lambda 环境变量动态读取SSM参数，获取实际的S3对象键（文件名）
* 支持按分类（cafe/bar）和环境（dev/prod）动态加载不同的数据源

#### **Google Maps API Key 配置调整**
* 已从AWS Lambda函数的环境变量中移除 `MAPS_API_KEY_SSM_PATH`，已部署的API处理程序不再依赖此密钥
* 本地开发时，相关脚本仍可通过 `.env` 文件配置API密钥，`appConfig.js` 在本地环境下保持兼容

#### **Serverless Framework 版本管理**
* 解决了全局与本地 Serverless Framework 版本冲突问题
* `serverless.yml` 中明确指定 `frameworkVersion: '3'`
* **推荐使用方式**: 通过 `npx serverless ...` 或 `package.json` 中的npm脚本执行所有Serverless命令

### **API 端点架构升级**

#### **路径重构与分类支持**
* **列表端点**: 从 `/cafes` 迁移到 `/places`，支持分类查询：
  - `GET /<stage>/places?type=cafe` - 获取咖啡馆列表
  - `GET /<stage>/places?type=bar` - 获取酒吧列表
* **详情端点**: 从 `/cafes/{placeId}` 迁移到 `/places/{placeId}`：
  - `GET /<stage>/places/{placeId}?type=cafe` - 获取咖啡馆详情
  - `GET /<stage>/places/{placeId}?type=bar` - 获取酒吧详情

### **数据模型增强**

#### **`BaliciagaCafe.js` 模型更新**
* 构造函数和 `toJSON()` 方法已升级，新增对 `table` 字段的支持
* `table` 字段用于存储餐桌预订URL，为前端"Book a table"功能提供数据支持

### **AWS 基础设施优化**

#### **S3 存储桶策略扩展**
* `baliciaga-database` 存储桶策略已更新，新增公共读取权限支持：
  - 生产环境图片路径: `bar-image/*`
  - 缩放图片路径: `photo_webp_resized/*` 及其子目录（`600/`, `800/`, `1080/`, `1200/`等）

### **辅助脚本生态系统**

#### **图片处理脚本 (`backend/scripts/`)**
* **功能特性**:
  - 自动将非静态地图图片裁剪为正方形（竖图贴底裁剪，横图居中裁剪）
  - 统一转换为无损 WebP 格式，优化存储和传输效率
  - 根据指定目标尺寸生成多种缩放版本（1080px, 1200px等）
  - 智能尺寸处理：源图片小于目标尺寸时避免放大，保持图片质量
  - 静态地图图片特殊处理：跳过文件名以 `_static.webp` 结尾的图片或原样复制
* **输出结构**: 按尺寸组织的子文件夹 `../../photo_webp_resized/<尺寸>/<相对路径>/<文件名>.webp`
* **运行方式**: `node scripts/processNewImages.js` (具体脚本名以实际为准)

#### **JSON图片路径转换脚本**
* **功能**: 批量更新JSON数据文件中的图片链接路径
* **典型用例**: 将开发环境路径（`.../bar-image-dev/...`）转换为生产环境路径（`.../bar-image/...`）
* **运行示例**: 
  ```bash
  node scripts/transformBarImagePaths.js \
    --inputFile scripts/bars-dev.json \
    --outputFile scripts/bars.json \
    --devPathSegment /bar-image-dev/ \
    --prodPathSegment /bar-image/ \
    --cdnHost <你的CDN域名>
  ```

### **标准化部署流程**

#### **环境区分部署**
* **开发环境**: `npx serverless deploy --stage dev`
* **生产环境**: `npx serverless deploy --stage prod`
* **前置条件**: 确保对应环境的SSM参数和S3生产数据已正确配置

#### **配置管理最佳实践**
* 所有环境相关配置通过SSM Parameter Store统一管理
* 本地开发通过 `.env` 文件配置，生产部署通过SSM参数注入
* 支持多环境独立的数据源和配置隔离

# 项目开发进展和更新日志

## 项目概述与目标回顾

Baliciaga项目是一个专注于展示和管理巴厘岛Canggu地区咖啡馆信息的平台，通过精选的咖啡馆数据，为用户提供高质量、准确的咖啡馆信息。

## 主要技术栈与关键服务

- **后端**：Node.js, Serverless Framework (AWS Lambda, API Gateway), AWS S3 (用于存储最终数据和图片)
- **数据源**：Google Places API，主要使用 `searchText` 和 `searchNearby` 端点
- **核心数据处理**：`BaliciagaCafe.js` 模型类，以及多个用于数据获取、充实、上传的脚本

## 开发历程中的重要里程碑与决策

### Google Places API 分页问题攻坚

- 尝试了多种参数组合（`searchText`, `searchNearby`, `fieldMasks`, `rankPreference`, `includedTypes`, 半径调整）试图解决单次查询无法获取超过20条数据及 `nextPageToken` 的问题
- **最终结论**：对于项目目标区域的单次大范围查询，Google API未返回分页令牌

### 数据获取策略的演进

- 从最初的单次API调用尝试
- 演变为"定点爆破"/"细分搜索区域"策略，通过多次小范围 `searchNearby` (按热门度，特定类型) 调用来收集初步名单
- 后续使用 `searchText` 针对特定关键词（如 "bali canggu cafe"）或特定咖啡馆名称进行补充搜索

### 数据充实流程

- 初步名单 (`placeId`, `name`) -> 调用 `getPlaceDetails` 获取详细信息
- 详细讨论并最终确定了 `getPlaceDetails` 的 `fieldMask`，以平衡信息全面性和API成本
- 实现了 `enrichCafeData.js` 脚本，用于批量获取详情并处理数据（包括保留用户手动添加的 `instagram` 链接，添加 `openingPeriods` 等）

### 图片处理流程

- 实现了 `downloadCafePhotos.js` 脚本，用于从Google照片链接下载图片到本地，并按 `{处理后的名称}_{placeId}` 格式的子文件夹存放
- 讨论并实现了 `renameScreenshotFiles.js` (或 `renameManualPhotos.js`) 脚本，用于将用户手动截图的图片重命名为 `photo_a`, `photo_b` 等格式
- 实现了 `uploadAssetsToS3.js` 脚本，用于：
  - 将本地 `cafe_images` 目录下的图片上传到AWS S3 (`baliciaga-database` 桶的 `image/` 目录下)
  - 更新JSON数据文件中的 `photos` 数组为S3链接，并按"字母后缀优先"规则排序

### 最终数据源切换

- 最终的咖啡馆数据 (包含所有详情和S3图片链接) 存储在S3上的一个JSON文件 (例如 `s3://baliciaga-database/data/cafes.json`)
- 后端API (`WorkspaceCangguCafes.js`) 已重构为从S3读取这个JSON文件，不再实时调用Google Places API获取列表

### 实时营业状态计算 (`isOpenNow`)

- 讨论了三种方案（前端计算、后端API实时计算、后端Lambda定期任务更新S3）
- 当前 `WorkspaceCangguCafes.js` 的实现是在API被调用时，根据S3 JSON中的 `openingPeriods` 和当前巴厘岛时间**实时计算 `isOpenNow`**
- 用户倾向于未来采用**方案C（后台Lambda定期任务）**，目前API层的实时计算是过渡或基础

## 当前后端主要功能模块/文件

- **`src/utils/config.js`**: 存储API密钥配置名、S3桶名、搜索参数配置（例如 `SEARCH_CONFIG.canggu` 用于手动指定测试区域和参数）
- **`src/api/placesApiService.js`**:
  - 封装了对Google Places API的调用。包含 `searchNearbyPlaces`, `searchTextPlaces`, `getPlaceDetails`, `getPhotoUrl` 等函数
  - `getPlaceDetails` 使用了优化后的 `fieldMask`
- **`src/models/BaliciagaCafe.js`