#!/usr/bin/env python3
import json

def update_bars_urls():
    # 读取bars.json
    with open('bars.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    # 遍历所有条目并更新URL
    for item in data:
        # 更新photos数组中的URL
        if 'photos' in item and item['photos']:
            for i, photo_url in enumerate(item['photos']):
                # 处理bar-image-dev -> bar-image-prod
                if '/bar-image-dev/' in photo_url:
                    item['photos'][i] = photo_url.replace('/bar-image-dev/', '/bar-image-prod/')
                    updated_count += 1
                # 处理bar-image -> bar-image-prod
                elif '/bar-image/' in photo_url and '/bar-image-prod/' not in photo_url:
                    item['photos'][i] = photo_url.replace('/bar-image/', '/bar-image-prod/')
                    updated_count += 1
        
        # 更新staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if '/bar-image-dev/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/bar-image-dev/', '/bar-image-prod/')
                updated_count += 1
            elif '/bar-image/' in item['staticMapS3Url'] and '/bar-image-prod/' not in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/bar-image/', '/bar-image-prod/')
                updated_count += 1
    
    # 保存更新后的文件
    with open('bars-updated.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Updated {updated_count} URLs in bars.json")
    
    # 验证结果
    with open('bars-updated.json', 'r') as f:
        content = f.read()
        bar_image_count = content.count('/bar-image/')
        bar_image_dev_count = content.count('/bar-image-dev/')
        bar_image_prod_count = content.count('/bar-image-prod/')
        
    print(f"Verification:")
    print(f"  - /bar-image/ paths: {bar_image_count}")
    print(f"  - /bar-image-dev/ paths: {bar_image_dev_count}")
    print(f"  - /bar-image-prod/ paths: {bar_image_prod_count}")
    
    # 显示示例URL
    print("\nSample URLs after update:")
    with open('bars-updated.json', 'r') as f:
        data = json.load(f)
        for item in data[:2]:  # 只显示前2个
            if 'photos' in item and item['photos']:
                print(f"  {item['photos'][0]}")
            break

if __name__ == "__main__":
    update_bars_urls()