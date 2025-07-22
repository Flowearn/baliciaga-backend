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
                if '/dining-image-dev/' in photo_url:
                    item['photos'][i] = photo_url.replace('/dining-image-dev/', '/dining-image-prod/')
                    updated_count += 1
        
        # 更新staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if '/dining-image-dev/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace('/dining-image-dev/', '/dining-image-prod/')
                updated_count += 1
    
    # 保存更新后的文件
    with open('dining-updated.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Updated {updated_count} URLs in dining.json")
    
    # 验证结果
    with open('dining-updated.json', 'r') as f:
        content = f.read()
        dev_path_count = content.count('/dining-image-dev/')
        prod_path_count = content.count('/dining-image-prod/')
        
    print(f"Verification:")
    print(f"  - Dev paths (/dining-image-dev/): {dev_path_count}")
    print(f"  - Prod paths (/dining-image-prod/): {prod_path_count}")
    
    # 显示示例URL
    print("\nSample URLs after update:")
    with open('dining-updated.json', 'r') as f:
        data = json.load(f)
        for item in data[:2]:  # 只显示前2个
            if 'photos' in item and item['photos']:
                print(f"  {item['photos'][0]}")
            break

if __name__ == "__main__":
    update_dining_urls()