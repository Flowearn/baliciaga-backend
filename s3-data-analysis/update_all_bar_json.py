#!/usr/bin/env python3
import json
import subprocess
import time
from urllib.parse import urlparse

def download_json(s3_path, local_path):
    """从S3下载JSON文件"""
    print(f"下载 {s3_path}")
    cmd = ['aws', 's3', 'cp', s3_path, local_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"下载失败: {result.stderr}")

def upload_json(local_path, s3_path):
    """上传JSON文件到S3"""
    print(f"上传 {local_path} 到 {s3_path}")
    cmd = ['aws', 's3', 'cp', local_path, s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"上传失败: {result.stderr}")

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

def update_all_staticmap_urls(json_data, env):
    """更新所有商户的staticMapS3Url为标准格式"""
    updated_count = 0
    
    for item in json_data:
        # 从photos提取商户目录
        merchant_dir = None
        if 'photos' in item and item['photos']:
            merchant_dir = extract_merchant_directory(item['photos'][0])
        
        if merchant_dir:
            # 构建新的标准化URL
            new_url = f"https://dyyme2yybmi4j.cloudfront.net/bar-image-{env}/{merchant_dir}/staticmap.png"
            
            # 更新staticMapS3Url
            if 'staticMapS3Url' in item:
                old_url = item['staticMapS3Url']
                item['staticMapS3Url'] = new_url
                
                if old_url != new_url:
                    updated_count += 1
                    print(f"  更新 {item.get('name', 'Unknown')}")
                    print(f"    从: {old_url}")
                    print(f"    到: {new_url}")
    
    return updated_count

def main():
    print("# CCt#33: 更新所有Bar分类JSON文件的staticMapS3Url")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 处理两个环境
    environments = [
        {
            'name': 'dev',
            'json_file': 'bars-dev.json',
            's3_path': 's3://baliciaga-database/data/bars-dev.json'
        },
        {
            'name': 'prod',
            'json_file': 'bars.json',
            's3_path': 's3://baliciaga-database/data/bars.json'
        }
    ]
    
    total_updated = 0
    
    for env_config in environments:
        print(f"\n处理 {env_config['name'].upper()} 环境")
        print("="*60)
        
        # 下载JSON
        download_json(env_config['s3_path'], env_config['json_file'])
        
        # 读取数据
        with open(env_config['json_file'], 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"商户总数: {len(data)}")
        
        # 更新所有URL
        updated_count = update_all_staticmap_urls(data, env_config['name'])
        total_updated += updated_count
        
        print(f"\n更新了 {updated_count} 个商户的staticMapS3Url")
        
        # 保存更新后的数据
        with open(env_config['json_file'], 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 上传回S3
        upload_json(env_config['json_file'], env_config['s3_path'])
        
        # 清理本地文件
        subprocess.run(['rm', env_config['json_file']])
    
    # 最终报告
    print("\n" + "="*60)
    print("# 最终报告")
    print("="*60)
    print(f"\n总共更新了 {total_updated} 个staticMapS3Url")
    print(f"- DEV环境: 已更新")
    print(f"- PROD环境: 已更新")
    print(f"\n所有14个Bar商户现在都有了标准化的静态地图URL")
    print(f"完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()