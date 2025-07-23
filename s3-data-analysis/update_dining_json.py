#!/usr/bin/env python3
import json

def update_dining_urls():
    # 读取dining.json
    with open('dining.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    # 遍历所有条目并更新URL
    for item in data:
        # 更新photos数组中的URL
        if 'photos' in item and item['photos']:
            for i, photo_url in enumerate(item['photos']):
                if '/dining-image/' in photo_url:
                    item['photos'][i] = photo_url.replace('/dining-image/', '/dining-image-prod/')
                    updated_count += 1
        
        # 更新staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if '/dining-image/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/dining-image/', '/dining-image-prod/')
                updated_count += 1
    
    # 保存更新后的文件
    with open('dining-updated.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Updated {updated_count} URLs in dining.json")
    
    # 验证结果
    with open('dining-updated.json', 'r') as f:
        content = f.read()
        old_path_count = content.count('/dining-image/')
        new_path_count = content.count('/dining-image-prod/')
        
    print(f"Verification:")
    print(f"  - Old paths (/dining-image/): {old_path_count}")
    print(f"  - New paths (/dining-image-prod/): {new_path_count}")

if __name__ == "__main__":
    update_dining_urls()