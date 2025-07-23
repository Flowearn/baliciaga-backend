#!/usr/bin/env python3
import json

def create_cowork_prod():
    # 读取cowork-dev.json
    with open('cowork-dev.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    # 遍历所有条目并更新URL
    for item in data:
        # 更新photos数组中的URL
        if 'photos' in item and item['photos']:
            for i, photo_url in enumerate(item['photos']):
                if '/cowork-image-dev/' in photo_url:
                    item['photos'][i] = photo_url.replace('/cowork-image-dev/', '/cowork-image-prod/')
                    updated_count += 1
        
        # 更新staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if '/cowork-image-dev/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/cowork-image-dev/', '/cowork-image-prod/')
                updated_count += 1
    
    # 保存为cowork.json
    with open('cowork.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Created cowork.json with {updated_count} URL updates")
    
    # 验证结果
    with open('cowork.json', 'r') as f:
        content = f.read()
        dev_path_count = content.count('/cowork-image-dev/')
        prod_path_count = content.count('/cowork-image-prod/')
        
    print(f"Verification:")
    print(f"  - Dev paths (/cowork-image-dev/): {dev_path_count}")
    print(f"  - Prod paths (/cowork-image-prod/): {prod_path_count}")
    
    # 显示示例URL
    print("\nSample URLs in cowork.json:")
    with open('cowork.json', 'r') as f:
        data = json.load(f)
        for item in data[:2]:  # 只显示前2个
            if 'photos' in item and item['photos']:
                print(f"  {item['photos'][0]}")
            break

if __name__ == "__main__":
    create_cowork_prod()