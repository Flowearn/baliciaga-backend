#!/usr/bin/env python3
import json
import re

def deep_scan_for_urls(obj, path="", results=None):
    """递归扫描JSON对象中的所有URL"""
    if results is None:
        results = []
    
    if isinstance(obj, dict):
        for key, value in obj.items():
            deep_scan_for_urls(value, f"{path}.{key}", results)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            deep_scan_for_urls(item, f"{path}[{i}]", results)
    elif isinstance(obj, str):
        # 检查是否是URL
        if 'cloudfront.net' in obj or 'http' in obj:
            results.append((path, obj))
    
    return results

def main():
    print("=== 深度扫描 cafes-dev.json ===")
    with open('current-cafes-dev.json', 'r', encoding='utf-8') as f:
        dev_data = json.load(f)
    
    dev_urls = deep_scan_for_urls(dev_data)
    
    print(f"总共发现 {len(dev_urls)} 个URL")
    
    # 分析URL类型
    image_v2_urls = []
    cafe_image_dev_urls = []
    cafe_image_prod_urls = []
    other_urls = []
    
    for path, url in dev_urls:
        if '/image-v2/' in url:
            image_v2_urls.append((path, url))
        elif '/cafe-image-dev/' in url:
            cafe_image_dev_urls.append((path, url))
        elif '/cafe-image-prod/' in url:
            cafe_image_prod_urls.append((path, url))
        else:
            other_urls.append((path, url))
    
    print(f"\nURL分布：")
    print(f"- image-v2路径: {len(image_v2_urls)}")
    print(f"- cafe-image-dev路径: {len(cafe_image_dev_urls)}")
    print(f"- cafe-image-prod路径: {len(cafe_image_prod_urls)}")
    print(f"- 其他路径: {len(other_urls)}")
    
    if image_v2_urls:
        print(f"\n仍然使用image-v2的URL：")
        for path, url in image_v2_urls[:10]:
            print(f"  路径: {path}")
            print(f"  URL: {url}")
            print()
    
    # 检查是否有mapUrl字段
    map_url_count = 0
    for cafe in dev_data:
        if 'mapUrl' in cafe:
            map_url_count += 1
            if map_url_count <= 3:
                print(f"\n发现mapUrl字段：")
                print(f"  Cafe: {cafe.get('name', 'Unknown')}")
                print(f"  MapUrl: {cafe.get('mapUrl', '')}")
    
    print(f"\n总共有 {map_url_count} 个cafe包含mapUrl字段")
    
    # 同样检查prod文件
    print("\n\n=== 深度扫描 cafes.json ===")
    with open('current-cafes.json', 'r', encoding='utf-8') as f:
        prod_data = json.load(f)
    
    prod_urls = deep_scan_for_urls(prod_data)
    
    print(f"总共发现 {len(prod_urls)} 个URL")
    
    # 分析prod文件的URL类型
    prod_image_v2 = sum(1 for _, url in prod_urls if '/image-v2/' in url)
    prod_cafe_dev = sum(1 for _, url in prod_urls if '/cafe-image-dev/' in url)
    prod_cafe_prod = sum(1 for _, url in prod_urls if '/cafe-image-prod/' in url)
    
    print(f"\nProd文件URL分布：")
    print(f"- image-v2路径: {prod_image_v2}")
    print(f"- cafe-image-dev路径: {prod_cafe_dev}")
    print(f"- cafe-image-prod路径: {prod_cafe_prod}")

if __name__ == "__main__":
    main()