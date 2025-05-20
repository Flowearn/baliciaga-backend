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
- **`src/models/BaliciagaCafe.js`**: 定义了咖啡馆数据模型，处理从API原始数据到应用所需数据结构的转换，包含 `openingPeriods` 和 `instagram` 字段
- **`src/fetchCangguCafes.js`** (或 `handler.js`中的核心逻辑):
  - `/dev/cafes` 等接口的实现
  - **当前已修改为从S3读取 `data/cafes.json` 作为数据源**
  - 实现了 `isOpenNow` 的实时计算
  - 包含内存缓存机制（例如5分钟TTL）
- **`scripts/` 目录下的辅助脚本**:
  - `enrichCafeData.js`: 批量获取地点详情并合并数据
  - `downloadCafePhotos.js`: 下载Google图片到本地
  - `renameScreenshotFiles.js` (或 `renameManualPhotos.js`): 重命名本地截图文件
  - `uploadAssetsToS3.js`: 上传图片到S3并更新JSON中的图片链接

## 重要注意事项和未来工作提示

- **API密钥管理**：`.env` 文件需要正确配置 `MAPS_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`
- **S3权限配置**：S3存储桶策略需要允许对 `image/*` 的公共读取，以及Lambda执行角色需要有读取 `data/cafes.json` 的权限
- **数据一致性**：如果手动修改了S3上的 `data/cafes.json` 或图片，需要有流程确保所有引用该数据的地方都能获取最新状态
- **未来可实现的 `isOpenNow` 状态的后台定期更新Lambda**：这是计划中的优化方向
- **本地脚本的运行环境**：脚本通常在 `BALICIAGA/backend/` 或 `BALICIAGA/backend/scripts/` 目录下通过 `node` 运行，依赖于根目录或 `backend` 目录下的 `.env` 文件 