#!/usr/bin/env python3
import json
import re

def update_urls(json_file, old_prefix, new_prefix):
    """更新JSON文件中的所有URL"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    # 遍历所有cafe条目
    for cafe in data:
        if 'photos' in cafe and cafe['photos']:
            # 更新每个photo URL
            for i, photo_url in enumerate(cafe['photos']):
                if old_prefix in photo_url:
                    new_url = photo_url.replace(old_prefix, new_prefix)
                    cafe['photos'][i] = new_url
                    updated_count += 1
    
    # 保存更新后的JSON
    output_file = json_file.replace('backup/', 'updated/')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return updated_count, output_file

def main():
    # 创建输出目录
    import os
    os.makedirs('updated', exist_ok=True)
    
    # 更新cafes-dev.json
    print("Updating cafes-dev.json...")
    count_dev, file_dev = update_urls(
        'backup/cafes-dev.json',
        '/image-v2/',
        '/cafe-image-dev/'
    )
    print(f"  Updated {count_dev} URLs in {file_dev}")
    
    # 更新cafes.json
    print("\nUpdating cafes.json...")
    count_prod, file_prod = update_urls(
        'backup/cafes.json',
        '/image-v2/',
        '/cafe-image-prod/'
    )
    print(f"  Updated {count_prod} URLs in {file_prod}")
    
    # 验证更新
    print("\n\nVerification - Sample URLs from updated files:")
    
    # 检查dev文件
    with open(file_dev, 'r') as f:
        dev_data = json.load(f)
        print("\nFrom cafes-dev.json (first 3 URLs):")
        count = 0
        for cafe in dev_data:
            if 'photos' in cafe and cafe['photos']:
                for photo_url in cafe['photos']:
                    print(f"  {photo_url}")
                    count += 1
                    if count >= 3:
                        break
            if count >= 3:
                break
    
    # 检查prod文件
    with open(file_prod, 'r') as f:
        prod_data = json.load(f)
        print("\nFrom cafes.json (first 3 URLs):")
        count = 0
        for cafe in prod_data:
            if 'photos' in cafe and cafe['photos']:
                for photo_url in cafe['photos']:
                    print(f"  {photo_url}")
                    count += 1
                    if count >= 3:
                        break
            if count >= 3:
                break

if __name__ == "__main__":
    main()