#!/usr/bin/env python3
import json

def update_static_map_urls(json_file, old_prefix, new_prefix):
    """更新JSON文件中的静态地图URL"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    # 遍历所有cafe条目
    for cafe in data:
        # 更新staticMapS3Url字段
        if 'staticMapS3Url' in cafe and cafe['staticMapS3Url']:
            if old_prefix in cafe['staticMapS3Url']:
                cafe['staticMapS3Url'] = cafe['staticMapS3Url'].replace(old_prefix, new_prefix)
                updated_count += 1
    
    # 保存更新后的JSON
    output_file = json_file.replace('current-', 'final-')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return updated_count, output_file

def verify_no_image_v2(json_file):
    """验证文件中是否还有image-v2路径"""
    with open(json_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    count = content.count('/image-v2/')
    return count

def main():
    print("=== 更新cafes-dev.json中的静态地图URL ===")
    count_dev, file_dev = update_static_map_urls(
        'current-cafes-dev.json',
        '/image-v2/',
        '/cafe-image-dev/'
    )
    print(f"更新了 {count_dev} 个静态地图URL")
    print(f"保存到: {file_dev}")
    
    print("\n=== 更新cafes.json中的静态地图URL ===")
    count_prod, file_prod = update_static_map_urls(
        'current-cafes.json',
        '/image-v2/',
        '/cafe-image-prod/'
    )
    print(f"更新了 {count_prod} 个静态地图URL")
    print(f"保存到: {file_prod}")
    
    print("\n=== 验证更新结果 ===")
    
    # 验证dev文件
    remaining_dev = verify_no_image_v2(file_dev)
    print(f"cafes-dev.json中剩余的image-v2引用: {remaining_dev}")
    
    # 验证prod文件
    remaining_prod = verify_no_image_v2(file_prod)
    print(f"cafes.json中剩余的image-v2引用: {remaining_prod}")
    
    # 显示示例URL
    print("\n=== 更新后的URL示例 ===")
    
    with open(file_dev, 'r') as f:
        dev_data = json.load(f)
        print("\ncafes-dev.json中的静态地图URL示例（前3个）:")
        count = 0
        for cafe in dev_data:
            if 'staticMapS3Url' in cafe and cafe['staticMapS3Url']:
                print(f"  {cafe['name']}: {cafe['staticMapS3Url']}")
                count += 1
                if count >= 3:
                    break
    
    with open(file_prod, 'r') as f:
        prod_data = json.load(f)
        print("\ncafes.json中的静态地图URL示例（前3个）:")
        count = 0
        for cafe in prod_data:
            if 'staticMapS3Url' in cafe and cafe['staticMapS3Url']:
                print(f"  {cafe['name']}: {cafe['staticMapS3Url']}")
                count += 1
                if count >= 3:
                    break

if __name__ == "__main__":
    main()