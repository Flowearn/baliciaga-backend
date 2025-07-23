// fix-bar-json-prefix.js
// 修正bar-v3-dev.json中photos数组的URL前缀

const fs = require("fs").promises;
const path = require("path");

async function fixBarJsonPrefix() {
    const filePath = path.join(__dirname, 'bar-v3-dev.json');
    
    try {
        // 读取文件
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        let modified = false;
        
        // 遍历所有商户
        for (const place of data) {
            if (place.photos && Array.isArray(place.photos)) {
                // 检查是否有使用dining-image-dev前缀的照片
                const hasWrongPrefix = place.photos.some(url => url.includes('dining-image-dev/'));
                
                if (hasWrongPrefix) {
                    console.log(`修正商户 "${place.name}" 的照片URL前缀...`);
                    place.photos = place.photos.map(url => 
                        url.replace('dining-image-dev/', 'bar-image-dev/')
                    );
                    modified = true;
                }
            }
        }
        
        if (modified) {
            // 写回文件
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`\n✅ 已成功修正 bar-v3-dev.json 中的URL前缀`);
        } else {
            console.log('\n✅ 文件中没有需要修正的URL前缀');
        }
        
    } catch (error) {
        console.error('❌ 处理文件时出错:', error);
    }
}

// 执行修正
fixBarJsonPrefix();