# CCt#24: Bar分类重复目录分析报告

## 执行时间：2025-07-09

## 情况概述

在bar分类的S3相册中发现了8对重复目录，每对都包含原始格式（含空格/大写）和kebab-case格式两个版本。

## 关键发现

### 1. 目录内容对比结果

所有16对目录（dev和prod各8对）的aws s3 sync --dryrun对比结果均为 **Different**（有差异）。

### 2. 详细内容分析

深入检查后发现：
- 两个版本的目录都包含相同数量的文件（文件名也相同）
- 但文件内容不同（大小不同、上传时间不同）
- Kebab-case版本的文件上传时间更早（2025-05-28）
- 原始格式版本的文件上传时间更晚（2025-05-31）

示例对比（Honeycomb Hookah & Eatery）：
```
原始格式版本：
- photo_a.webp: 1,481,778 bytes (2025-05-31)
- photo_b.webp: 1,631,106 bytes (2025-05-31)

Kebab-case版本：
- photo_a.webp: 635,450 bytes (2025-05-28)
- photo_b.webp: 883,896 bytes (2025-05-28)
```

### 3. JSON文件引用情况

**重要发现**：所有JSON文件（bars-dev.json和bars.json）中的引用都指向 **kebab-case格式** 的目录：

- DEV环境：58个引用全部使用kebab-case格式
- PROD环境：58个引用全部使用kebab-case格式
- 原始格式目录：0个引用

### 4. 文件数量统计

| 商户名称 | 文件数量 |
|---------|---------|
| Honeycomb Hookah & Eatery | 9 |
| LONGTIME \| Modern Asian Restaurant & Bar Bali | 7 |
| PLATONIC | 12 |
| The Shady Fox | 4 |
| bali beer cycle | 6 |
| barn gastropub | 7 |
| black sand brewery | 14 |
| shelter restaurant | 4 |

## 结论

1. **当前使用情况**：系统实际使用的是kebab-case格式的目录（所有JSON引用都指向这些目录）

2. **原始格式目录状态**：包含空格/大写的目录虽然有文件，但完全没有被系统引用，属于冗余数据

3. **文件版本差异**：两个版本的图片文件内容不同，可能是：
   - 不同的压缩/优化版本
   - 不同时间上传的不同版本
   - kebab-case版本是原始版本，原始格式版本是后来重复上传的

## 建议操作

由于所有JSON引用都已经指向kebab-case格式的目录，建议：

1. **可以安全删除**：所有原始格式（含空格/大写）的目录，因为它们没有被任何地方引用

2. **删除列表**（共16个目录）：
   - DEV环境：8个原始格式目录
   - PROD环境：8个原始格式目录

3. **数据量**：将清理约126个冗余图片文件（dev和prod各63个）

## 风险评估

- **风险等级**：低
- **原因**：这些目录完全没有被JSON文件引用，删除不会影响系统功能