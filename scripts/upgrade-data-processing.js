const fs = require('fs');
const path = require('path');

console.log('🚀 开始升级数据处理逻辑 - 第二步');

const analyzeListingSourcePath = path.join(__dirname, '../src/features/rentals/analyzeListingSource.js');

// 读取文件
let content = fs.readFileSync(analyzeListingSourcePath, 'utf8');

console.log('📋 第一步：升级字段映射逻辑...');

// 1. 在parseAIResponse函数中添加新字段处理
const oldFieldMapping = `        // Map new AI schema fields to expected format
        // AI returns: amenityTags, pricing.monthly, currency, etc.
        // Backend expects: amenities, monthlyRent, etc.
        if (parsedData.amenityTags && !parsedData.amenities) {
            parsedData.amenities = parsedData.amenityTags;
        }
        if (parsedData.pricing?.monthly && !parsedData.monthlyRent) {
            parsedData.monthlyRent = parsedData.pricing.monthly;
        }
        if (parsedData.pricing?.yearly && !parsedData.yearlyRent) {
            parsedData.yearlyRent = parsedData.pricing.yearly;
        }`;

const newFieldMapping = `        // Map new AI schema fields to expected format
        // AI returns: amenityTags, pricing.monthly, currency, etc.
        // Backend expects: amenities, monthlyRent, etc.
        if (parsedData.amenityTags && !parsedData.amenities) {
            parsedData.amenities = parsedData.amenityTags;
        }
        if (parsedData.pricing?.monthly && !parsedData.monthlyRent) {
            parsedData.monthlyRent = parsedData.pricing.monthly;
        }
        if (parsedData.pricing?.yearly && !parsedData.yearlyRent) {
            parsedData.yearlyRent = parsedData.pricing.yearly;
        }
        
        // Handle new yearly price fields
        if (parsedData.price_yearly_idr && !parsedData.yearlyRent && parsedData.currency === 'IDR') {
            parsedData.yearlyRent = parsedData.price_yearly_idr;
        }
        if (parsedData.price_yearly_usd && !parsedData.yearlyRent && parsedData.currency === 'USD') {
            parsedData.yearlyRent = parsedData.price_yearly_usd;
        }
        
        // Handle new minimum stay field (convert from minimumStay_months)
        if (parsedData.minimumStay_months && typeof parsedData.minimumStay_months === 'number') {
            parsedData.minimumStay = parsedData.minimumStay_months;
        }`;

content = content.replace(oldFieldMapping, newFieldMapping);

console.log('📋 第二步：扩展价格字段处理...');

// 2. 扩展价格字段处理列表
const oldPriceFields = `        const priceFields = ['monthlyRent', 'yearlyRent', 'monthlyRentEquivalent', 'utilities', 'deposit'];`;
const newPriceFields = `        const priceFields = ['monthlyRent', 'yearlyRent', 'monthlyRentEquivalent', 'utilities', 'deposit', 'price_yearly_idr', 'price_yearly_usd'];`;

content = content.replace(oldPriceFields, newPriceFields);

console.log('📋 第三步：更新aiExtractedData存储...');

// 3. 更新aiExtractedData以包含新字段
const oldAiExtractedData = `            // Store original AI data for reference
            aiExtractedData: {
                title: parsedData.title,
                locationArea: parsedData.locationArea,
                address: parsedData.address,
                bedrooms: parsedData.bedrooms,
                bathrooms: parsedData.bathrooms,
                monthlyRent: parsedData.monthlyRent,
                yearlyRent: parsedData.yearlyRent,
                monthlyRentEquivalent: parsedData.monthlyRentEquivalent,
                utilities: parsedData.utilities,
                deposit: parsedData.deposit,
                minimumStay: parsedData.minimumStay,
                furnished: parsedData.furnished,
                petFriendly: parsedData.petFriendly,
                smokingAllowed: parsedData.smokingAllowed,
                priceNote: parsedData.priceNote,
                amenities: parsedData.amenities
            }`;

const newAiExtractedData = `            // Store original AI data for reference
            aiExtractedData: {
                title: parsedData.title,
                locationArea: parsedData.locationArea,
                address: parsedData.address,
                bedrooms: parsedData.bedrooms,
                bathrooms: parsedData.bathrooms,
                monthlyRent: parsedData.monthlyRent,
                yearlyRent: parsedData.yearlyRent,
                price_yearly_idr: parsedData.price_yearly_idr,
                price_yearly_usd: parsedData.price_yearly_usd,
                monthlyRentEquivalent: parsedData.monthlyRentEquivalent,
                utilities: parsedData.utilities,
                deposit: parsedData.deposit,
                minimumStay: parsedData.minimumStay,
                minimumStay_months: parsedData.minimumStay_months,
                furnished: parsedData.furnished,
                petFriendly: parsedData.petFriendly,
                smokingAllowed: parsedData.smokingAllowed,
                priceNote: parsedData.priceNote,
                amenities: parsedData.amenities
            }`;

content = content.replace(oldAiExtractedData, newAiExtractedData);

console.log('📋 第四步：保存升级后的文件...');

// 写入升级后的内容
fs.writeFileSync(analyzeListingSourcePath, content);

console.log('✅ 数据处理逻辑升级完成!');
console.log('🎯 现在AI可以处理：');
console.log('  - minimumStay_months (数字格式的最短租期)');
console.log('  - price_yearly_idr (IDR年租价格)');
console.log('  - price_yearly_usd (USD年租价格)');
console.log('  - 改进的面积提取逻辑(忽略泳池面积)');
console.log('🚀 准备进行最终测试!'); 