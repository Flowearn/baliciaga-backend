#!/usr/bin/env python3
import json
import subprocess
from urllib.parse import urlparse

def extract_merchant_directory(photo_url):
    """从photos URL中提取商户目录"""
    if not photo_url:
        return None
    parsed = urlparse(photo_url)
    path_parts = parsed.path.strip('/').split('/')
    
    for i, part in enumerate(path_parts):
        if part in ['bar-image-dev', 'bar-image-prod']:
            if i + 1 < len(path_parts):
                return path_parts[i+1]
    return None

def force_update_all_urls():
    """强制更新所有staticMapS3Url为标准格式"""
    # 读取JSON
    with open('bars-dev-check.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    for item in data:
        # 从photos提取商户目录
        merchant_dir = None
        if 'photos' in item and item['photos']:
            merchant_dir = extract_merchant_directory(item['photos'][0])
        
        if merchant_dir and 'staticMapS3Url' in item:
            # 构建新的标准化URL
            new_url = f"https://dyyme2yybmi4j.cloudfront.net/bar-image-dev/{merchant_dir}/staticmap.png"
            old_url = item['staticMapS3Url']
            
            if old_url != new_url:
                print(f"\n更新: {item.get('name')}")
                print(f"  从: {old_url}")
                print(f"  到: {new_url}")
                
                item['staticMapS3Url'] = new_url
                updated_count += 1
    
    print(f"\n总共更新了 {updated_count} 个URL")
    
    # 保存更新后的文件
    with open('bars-dev-fixed.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # 上传到S3
    print("\n上传更新后的文件到S3...")
    cmd = ['aws', 's3', 'cp', 'bars-dev-fixed.json', 's3://baliciaga-database/data/bars-dev.json']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ 上传成功！")
    else:
        print(f"❌ 上传失败: {result.stderr}")

# 执行更新
force_update_all_urls()