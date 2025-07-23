#!/usr/bin/env python3
import json

def fix_dining_json_urls():
    """修复dining JSON文件中的URL路径"""
    
    # 目标商户
    target_merchants = ['Lusa By/Suka', 'Bokashi Berawa', 'Zai Cafe Breakfast & Dinner']
    
    # 处理dining-dev.json
    print("处理 dining-dev.json...")
    with open('dining-dev.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    dev_updated = 0
    for item in data:
        if item.get('name') in target_merchants:
            # 更新photos数组
            if 'photos' in item and item['photos']:
                for i, photo_url in enumerate(item['photos']):
                    if '/image-v2/' in photo_url:
                        item['photos'][i] = photo_url.replace('/image-v2/', '/cafe-image-dev/')
                        dev_updated += 1
            
            # 更新staticMapS3Url
            if 'staticMapS3Url' in item and item['staticMapS3Url'] and '/image-v2/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/image-v2/', '/cafe-image-dev/')
                dev_updated += 1
    
    # 保存dining-dev.json
    with open('dining-dev.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"dining-dev.json: 更新了 {dev_updated} 个URL")
    
    # 处理dining.json
    print("\n处理 dining.json...")
    with open('dining.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    prod_updated = 0
    for item in data:
        if item.get('name') in target_merchants:
            # 更新photos数组
            if 'photos' in item and item['photos']:
                for i, photo_url in enumerate(item['photos']):
                    if '/image-v2/' in photo_url:
                        item['photos'][i] = photo_url.replace('/image-v2/', '/cafe-image-prod/')
                        prod_updated += 1
            
            # 更新staticMapS3Url
            if 'staticMapS3Url' in item and item['staticMapS3Url'] and '/image-v2/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/image-v2/', '/cafe-image-prod/')
                prod_updated += 1
    
    # 保存dining.json
    with open('dining.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"dining.json: 更新了 {prod_updated} 个URL")
    
    return dev_updated + prod_updated

# 执行修复
total_fixed = fix_dining_json_urls()
print(f"\n总共修复了 {total_fixed} 个URL")