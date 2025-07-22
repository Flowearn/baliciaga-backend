#!/usr/bin/env python3
import subprocess
import json

def download_and_verify(file_name):
    """下载并验证文件"""
    # 下载文件
    cmd = ['aws', 's3', 'cp', f's3://baliciaga-database/data/{file_name}', f'verify-{file_name}']
    subprocess.run(cmd, capture_output=True)
    
    # 读取并检查
    with open(f'verify-{file_name}', 'r') as f:
        content = f.read()
        data = json.loads(content)
    
    # 统计URL
    image_v2_count = content.count('/image-v2/')
    cafe_image_dev_count = content.count('/cafe-image-dev/')
    cafe_image_prod_count = content.count('/cafe-image-prod/')
    
    # 统计具体字段
    photos_count = 0
    static_map_count = 0
    
    for cafe in data:
        if 'photos' in cafe and cafe['photos']:
            photos_count += len(cafe['photos'])
        if 'staticMapS3Url' in cafe and cafe['staticMapS3Url']:
            static_map_count += 1
    
    return {
        'file': file_name,
        'image_v2_refs': image_v2_count,
        'cafe_image_dev_refs': cafe_image_dev_count,
        'cafe_image_prod_refs': cafe_image_prod_count,
        'total_photos': photos_count,
        'total_static_maps': static_map_count
    }

def main():
    print("=== 最终验证报告 ===\n")
    
    # 验证两个文件
    dev_stats = download_and_verify('cafes-dev.json')
    prod_stats = download_and_verify('cafes.json')
    
    print(f"cafes-dev.json:")
    print(f"  - image-v2引用: {dev_stats['image_v2_refs']}")
    print(f"  - cafe-image-dev引用: {dev_stats['cafe_image_dev_refs']}")
    print(f"  - cafe-image-prod引用: {dev_stats['cafe_image_prod_refs']}")
    print(f"  - 照片总数: {dev_stats['total_photos']}")
    print(f"  - 静态地图总数: {dev_stats['total_static_maps']}")
    
    print(f"\ncafes.json:")
    print(f"  - image-v2引用: {prod_stats['image_v2_refs']}")
    print(f"  - cafe-image-dev引用: {prod_stats['cafe_image_dev_refs']}")
    print(f"  - cafe-image-prod引用: {prod_stats['cafe_image_prod_refs']}")
    print(f"  - 照片总数: {prod_stats['total_photos']}")
    print(f"  - 静态地图总数: {prod_stats['total_static_maps']}")
    
    # 验证结果
    print("\n=== 验证结果 ===")
    if dev_stats['image_v2_refs'] == 0 and prod_stats['image_v2_refs'] == 0:
        print("✅ 成功！两个JSON文件中已不再包含任何指向image-v2的路径")
    else:
        print("❌ 失败！仍有image-v2引用存在")
    
    if dev_stats['cafe_image_dev_refs'] == (dev_stats['total_photos'] + dev_stats['total_static_maps']):
        print("✅ cafes-dev.json中所有URL都正确指向cafe-image-dev")
    
    if prod_stats['cafe_image_prod_refs'] == (prod_stats['total_photos'] + prod_stats['total_static_maps']):
        print("✅ cafes.json中所有URL都正确指向cafe-image-prod")

if __name__ == "__main__":
    main()