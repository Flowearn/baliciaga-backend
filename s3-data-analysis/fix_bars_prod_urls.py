#!/usr/bin/env python3
import json

def fix_bars_prod_json_urls():
    """修复bars.json (bars-updated.json)中Hippie Fish和Miss Fish的URL路径"""
    
    # 目标商户
    target_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    
    print("处理 bars-updated.json (bars.json)...")
    with open('bars-updated.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated = 0
    
    for item in data:
        if item.get('name') in target_merchants:
            print(f"\n找到商户: {item['name']}")
            
            # 更新photos数组中的所有URL
            if 'photos' in item and item['photos']:
                for i, photo_url in enumerate(item['photos']):
                    # 替换 /dining-image-dev/ 为 /bar-image-prod/
                    if '/dining-image-dev/' in photo_url:
                        old_url = photo_url
                        item['photos'][i] = photo_url.replace('/dining-image-dev/', '/bar-image-prod/')
                        print(f"  更新: {old_url} -> {item['photos'][i]}")
                        updated += 1
            
            # 检查并更新staticMapS3Url
            if 'staticMapS3Url' in item and item['staticMapS3Url']:
                if '/dining-image-dev/' in item['staticMapS3Url']:
                    old_url = item['staticMapS3Url']
                    item['staticMapS3Url'] = item['staticMapS3Url'].replace('/dining-image-dev/', '/bar-image-prod/')
                    print(f"  更新静态地图: {old_url} -> {item['staticMapS3Url']}")
                    updated += 1
    
    # 保存文件
    with open('bars-updated.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\nbars-updated.json: 更新了 {updated} 个URL")
    return updated

# 执行修复
total_fixed = fix_bars_prod_json_urls()
print(f"\n总共修复了 {total_fixed} 个URL")