#!/usr/bin/env python3
import json
import subprocess
import re
from collections import defaultdict

def extract_s3_path(cloudfront_url):
    """从CloudFront URL提取S3路径"""
    match = re.search(r'cloudfront\.net/(.+?)$', cloudfront_url)
    if match:
        return match.group(1)
    return None

def main():
    # 读取JSON文件
    with open('backup/cafes.json', 'r') as f:
        cafes_data = json.load(f)
    
    # 收集所有唯一的图片路径
    unique_paths = set()
    for cafe in cafes_data:
        if 'photos' in cafe and cafe['photos']:
            for photo_url in cafe['photos']:
                s3_path = extract_s3_path(photo_url)
                if s3_path and s3_path.startswith('image-v2/'):
                    unique_paths.add(s3_path)
    
    print(f"Found {len(unique_paths)} unique image paths to migrate")
    
    # 生成S3复制命令
    copy_commands = []
    
    for path in sorted(unique_paths):
        # 从 image-v2/xxx 转换为 cafe-image-dev/xxx 和 cafe-image-prod/xxx
        new_path_dev = path.replace('image-v2/', 'cafe-image-dev/')
        new_path_prod = path.replace('image-v2/', 'cafe-image-prod/')
        
        # 创建复制命令
        source = f"s3://baliciaga-database/{path}"
        dest_dev = f"s3://baliciaga-database/{new_path_dev}"
        dest_prod = f"s3://baliciaga-database/{new_path_prod}"
        
        copy_commands.append(f"aws s3 cp '{source}' '{dest_dev}'")
        copy_commands.append(f"aws s3 cp '{source}' '{dest_prod}'")
    
    # 写入批处理脚本
    with open('migrate_s3_images.sh', 'w') as f:
        f.write("#!/bin/bash\n\n")
        f.write("echo 'Starting S3 image migration...'\n")
        f.write(f"echo 'Total images to copy: {len(unique_paths)}'\n")
        f.write(f"echo 'Total operations: {len(copy_commands)}'\n\n")
        
        for i, cmd in enumerate(copy_commands):
            f.write(f"echo 'Progress: {i+1}/{len(copy_commands)}'\n")
            f.write(f"{cmd}\n")
        
        f.write("\necho 'Migration completed!'\n")
    
    print(f"Migration script created: migrate_s3_images.sh")
    print(f"Total S3 copy operations: {len(copy_commands)}")
    
    # 显示前5个操作作为示例
    print("\nFirst 5 operations:")
    for cmd in copy_commands[:5]:
        print(f"  {cmd}")

if __name__ == "__main__":
    main()