#!/usr/bin/env python3
import json

def fix_bars_dev_json_urls():
    """修复bars-dev.json中的URL路径"""
    
    print("处理 bars-dev.json...")
    with open('bars-dev.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated = 0
    
    for item in data:
        # 更新photos数组中的所有URL
        if 'photos' in item and item['photos']:
            for i, photo_url in enumerate(item['photos']):
                # 替换 /bar-image/ 为 /bar-image-dev/
                if '/bar-image/' in photo_url and '/bar-image-dev/' not in photo_url:
                    item['photos'][i] = photo_url.replace('/bar-image/', '/bar-image-dev/')
                    updated += 1
                # 替换 /bar-image-prod/ 为 /bar-image-dev/
                elif '/bar-image-prod/' in photo_url:
                    item['photos'][i] = photo_url.replace('/bar-image-prod/', '/bar-image-dev/')
                    updated += 1
                # 替换 /dining-image-dev/ 为 /bar-image-dev/ (针对Hippie Fish和Miss Fish)
                elif '/dining-image-dev/' in photo_url:
                    item['photos'][i] = photo_url.replace('/dining-image-dev/', '/bar-image-dev/')
                    updated += 1
        
        # 检查并更新staticMapS3Url（如果需要）
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if '/dining-image-dev/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/dining-image-dev/', '/bar-image-dev/')
                updated += 1
    
    # 保存文件
    with open('bars-dev.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"bars-dev.json: 更新了 {updated} 个URL")
    return updated

# 执行修复
total_fixed = fix_bars_dev_json_urls()
print(f"\n总共修复了 {total_fixed} 个URL")