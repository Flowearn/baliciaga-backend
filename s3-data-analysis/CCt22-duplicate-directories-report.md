# S3相册重复目录调查报告

## 任务编号：CCt#22
## 执行时间：2025-07-09

## 调查概述
对8个标准化S3父相册路径进行了全面扫描，查找因命名规范不同（如 `My Place` vs `my-place`）而可能指向同一商户的重复目录。

## 主要发现

### 真正的命名格式重复（大小写/空格 vs kebab-case）

只在 **bar-image** 相册中发现了因命名格式不同导致的重复目录：

| 父相册路径 | 发现的潜在重复目录对 |
| :--- | :--- |
| `s3://baliciaga-database/bar-image-dev/` | `['Honeycomb Hookah & Eatery/', 'honeycomb-hookah-eatery/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['LONGTIME | Modern Asian Restaurant & Bar Bali/', 'longtime-modern-asian-restaurant-bar-bali/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['PLATONIC/', 'platonic/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['The Shady Fox/', 'the-shady-fox/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['bali beer cycle/', 'bali-beer-cycle/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['barn gastropub/', 'barn-gastropub/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['black sand brewery/', 'black-sand-brewery/']` |
| `s3://baliciaga-database/bar-image-dev/` | `['shelter restaurant/', 'shelter-restaurant/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['Honeycomb Hookah & Eatery/', 'honeycomb-hookah-eatery/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['LONGTIME | Modern Asian Restaurant & Bar Bali/', 'longtime-modern-asian-restaurant-bar-bali/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['PLATONIC/', 'platonic/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['The Shady Fox/', 'the-shady-fox/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['bali beer cycle/', 'bali-beer-cycle/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['barn gastropub/', 'barn-gastropub/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['black sand brewery/', 'black-sand-brewery/']` |
| `s3://baliciaga-database/bar-image-prod/` | `['shelter restaurant/', 'shelter-restaurant/']` |

### 其他发现

1. **Google Place ID 变体**：在dining、cowork等分类中发现的"重复"实际上是同一商户的两个变体：
   - 一个只有商户名（如 `alma-tapas-bar-canggu/`）
   - 另一个包含Google Place ID（如 `alma-tapas-bar-canggu_ChIJTTj8Ts9H0i0R2XwcfS_i6Mk/`）
   
   这些不属于命名格式问题，可能是系统设计的一部分。

2. **命名格式统计**：
   - **cafe-image**: 所有目录都使用标准的kebab-case格式
   - **dining-image**: 所有目录都使用标准的kebab-case格式
   - **bar-image**: 混合使用，有8个目录使用大写/空格格式
   - **cowork-image**: 所有目录都使用标准的kebab-case格式

## 建议

1. **优先处理bar-image**：这是唯一存在真正命名格式重复的分类，建议：
   - 统一使用kebab-case格式
   - 删除包含空格和大写字母的旧格式目录
   - 更新相关JSON文件中的引用

2. **Google Place ID变体**：建议调查这些变体的用途，确定是否需要保留两个版本。

3. **预防措施**：建立命名规范，确保新添加的商户目录统一使用kebab-case格式。

---
调查完成时间：2025-07-09 14:30
执行人：Claude