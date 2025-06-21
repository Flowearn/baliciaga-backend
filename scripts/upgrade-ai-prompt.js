const fs = require('fs');
const path = require('path');

console.log('🚀 开始升级AI Prompt - 最终决战版本');

const analyzeListingSourcePath = path.join(__dirname, '../src/features/rentals/analyzeListingSource.js');

// 读取原文件
let content = fs.readFileSync(analyzeListingSourcePath, 'utf8');

console.log('📋 第一步：更新JSON模板字段...');

// 1. 更新JSON结构 - 添加新字段
const oldJsonStructure = `  "minimumStay": "string | null",
  "amenityTags": ["string"],
  "reasoning": "string" // This field is mandatory`;

const newJsonStructure = `  "minimumStay_months": "number | null",
  "price_yearly_idr": "number | null", 
  "price_yearly_usd": "number | null",
  "amenityTags": ["string"],
  "reasoning": "string" // This field is mandatory`;

// 替换所有出现的JSON结构
content = content.replace(new RegExp(oldJsonStructure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newJsonStructure);

console.log('📋 第二步：增强指令规则...');

// 2. 更新minimum stay规则
const oldMinStayRule = `  <rule id="8" name="Minimum Stay Extraction Guide">
    **HOW TO FIND MINIMUM STAY:** You must actively look for minimum stay information. It can be written in many ways, such as "min Take 3 Year", "minimum 12 months", "1 year minimum lease", or "yearly only". You MUST convert the final value into a single number representing months. For example, "min Take 3 Year" becomes \`36\`, and "yearly only" becomes \`12\`.
  </rule>`;

const newMinStayRule = `  <rule id="new_min_stay_rule">
    **Minimum Stay Extraction:** You MUST look for explicit phrases containing the words "minimum", "min", or "lease". Examples: "Minimum lease: 6 months", "min 3 month lease", "1 year minimum lease". Extract the number of months. If no such phrase is found, the value MUST be \`null\`.
  </rule>`;

content = content.replace(oldMinStayRule, newMinStayRule);

// 3. 更新area规则
const oldAreaRule = `  <rule id="7" name="Area/Size Extraction Guide">
    **HOW TO FIND AREA:** You must actively look for land or building size. The units can be 'sqm', 'm2', or 'Are'. **You must know that 1 Are = 100 sqm**. For example, if the source says "Landsize 3 Are", you must extract the value for the 'landSize' field as \`300\`.
  </rule>`;

const newAreaRule = `  <rule id="new_area_rule">
    **Area/Size Extraction:** Extract the area of the LAND or the BUILDING only. You MUST IGNORE areas explicitly associated with a 'pool', such as '12x5m swimming pool'.
  </rule>`;

content = content.replace(oldAreaRule, newAreaRule);

console.log('📋 第三步：保存升级后的文件...');

// 备份原文件
const backupPath = analyzeListingSourcePath + '.backup';
fs.writeFileSync(backupPath, fs.readFileSync(analyzeListingSourcePath));

// 写入升级后的内容
fs.writeFileSync(analyzeListingSourcePath, content);

console.log('✅ AI Prompt升级完成!');
console.log(`📄 原文件已备份至: ${backupPath}`);
console.log('🎯 下一步：升级数据处理逻辑'); 