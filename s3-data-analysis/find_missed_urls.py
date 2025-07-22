#!/usr/bin/env python3
import json
import re

def find_image_v2_urls(json_file):
    """查找所有仍然指向image-v2的URL"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    missed_urls = set()
    
    # 遍历所有cafe条目
    for cafe in data:
        # 检查所有可能包含图片URL的字段
        # 1. photos数组
        if 'photos' in cafe and cafe['photos']:
            for photo_url in cafe['photos']:
                if '/image-v2/' in photo_url:
                    missed_urls.add(photo_url)
        
        # 2. mapUrl字段（静态地图）
        if 'mapUrl' in cafe and cafe['mapUrl'] and '/image-v2/' in cafe['mapUrl']:
            missed_urls.add(cafe['mapUrl'])
        
        # 3. 其他可能的图片字段
        for key in ['coverImage', 'thumbnailUrl', 'logoUrl', 'bannerUrl']:
            if key in cafe and cafe[key] and '/image-v2/' in str(cafe[key]):
                missed_urls.add(cafe[key])
    
    return list(missed_urls)

def extract_s3_path(url):
    """从URL中提取S3路径"""
    match = re.search(r'cloudfront\.net/(.+?)$', url)
    if match:
        return match.group(1)
    return None

def main():
    print("=== 分析 cafes-dev.json ===")
    dev_missed = find_image_v2_urls('current-cafes-dev.json')
    print(f"发现 {len(dev_missed)} 个仍指向image-v2的URL")
    
    print("\n=== 分析 cafes.json ===")
    prod_missed = find_image_v2_urls('current-cafes.json')
    print(f"发现 {len(prod_missed)} 个仍指向image-v2的URL")
    
    # 合并所有遗漏的URL（去重）
    all_missed = list(set(dev_missed + prod_missed))
    print(f"\n总计发现 {len(all_missed)} 个唯一的遗漏URL")
    
    # 分析URL类型
    photo_urls = []
    map_urls = []
    other_urls = []
    
    for url in all_missed:
        if 'static-map' in url or 'map' in url.lower():
            map_urls.append(url)
        elif 'photo' in url:
            photo_urls.append(url)
        else:
            other_urls.append(url)
    
    print(f"\n按类型分类：")
    print(f"- 静态地图URL: {len(map_urls)}")
    print(f"- 照片URL: {len(photo_urls)}")
    print(f"- 其他URL: {len(other_urls)}")
    
    if map_urls:
        print(f"\n静态地图URL示例（前5个）：")
        for url in map_urls[:5]:
            print(f"  {url}")
    
    # 导出S3路径列表
    s3_paths = []
    for url in all_missed:
        path = extract_s3_path(url)
        if path:
            s3_paths.append(path)
    
    # 保存到文件
    with open('missed_urls.txt', 'w') as f:
        for url in all_missed:
            f.write(url + '\n')
    
    with open('missed_s3_paths.txt', 'w') as f:
        for path in s3_paths:
            f.write(path + '\n')
    
    print(f"\n已保存：")
    print(f"- missed_urls.txt: 所有遗漏的URL")
    print(f"- missed_s3_paths.txt: 对应的S3路径")
    
    return all_missed, s3_paths

if __name__ == "__main__":
    missed_urls, s3_paths = main()