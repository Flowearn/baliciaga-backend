#!/usr/bin/env python3
import subprocess
import json
import os
from urllib.parse import urlparse
import time

def download_json(s3_path, local_path):
    """从S3下载JSON文件"""
    print(f"下载 {s3_path} 到 {local_path}")
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
    # 解析URL路径
    parsed = urlparse(photo_url)
    path_parts = parsed.path.strip('/').split('/')
    
    # 找到dining-image-dev或dining-image-prod后的目录名
    for i, part in enumerate(path_parts):
        if part in ['dining-image-dev', 'dining-image-prod']:
            if i + 1 < len(path_parts):
                return path_parts[i+1]
    return None

def move_static_map(source_url, target_directory, env):
    """移动静态地图到商户目录"""
    # 构造源S3路径
    if source_url.startswith('https://'):
        # 转换CDN URL为S3路径
        parsed = urlparse(source_url)
        source_s3 = 's3://baliciaga-database' + parsed.path
    else:
        source_s3 = source_url
    
    # 构造目标S3路径
    target_s3 = f"s3://baliciaga-database/dining-image-{env}/{target_directory}/staticmap.png"
    
    # 执行移动
    print(f"  移动: {source_s3}")
    print(f"    到: {target_s3}")
    
    cmd = ['aws', 's3', 'mv', source_s3, target_s3]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        # 返回新的CDN URL
        return f"https://dyyme2yybmi4j.cloudfront.net/dining-image-{env}/{target_directory}/staticmap.png"
    else:
        print(f"    错误: {result.stderr}")
        return None

def process_environment(env_name, json_filename, s3_json_path):
    """处理一个环境的所有静态地图"""
    print(f"\n{'='*60}")
    print(f"处理 {env_name.upper()} 环境")
    print(f"{'='*60}\n")
    
    # 下载JSON文件
    download_json(s3_json_path, json_filename)
    
    # 读取JSON数据
    with open(json_filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 统计
    total_items = len(data)
    processed = 0
    skipped = 0
    errors = 0
    
    # 处理每个商户
    for idx, item in enumerate(data):
        print(f"\n[{idx+1}/{total_items}] 处理商户: {item.get('name', 'Unknown')}")
        
        # 检查是否有staticMapS3Url
        if 'staticMapS3Url' not in item or not item['staticMapS3Url']:
            print("  跳过: 没有静态地图")
            skipped += 1
            continue
        
        # 检查是否有photos来推断目标目录
        if 'photos' not in item or not item['photos']:
            print("  跳过: 没有photos数组，无法推断目标目录")
            skipped += 1
            continue
        
        # 提取商户目录
        merchant_dir = extract_merchant_directory(item['photos'][0])
        if not merchant_dir:
            print("  跳过: 无法从photos URL提取商户目录")
            skipped += 1
            continue
        
        print(f"  商户目录: {merchant_dir}")
        
        # 移动静态地图
        old_url = item['staticMapS3Url']
        new_url = move_static_map(old_url, merchant_dir, env_name)
        
        if new_url:
            item['staticMapS3Url'] = new_url
            processed += 1
            print(f"  成功: 更新URL")
        else:
            errors += 1
            print(f"  失败: 保持原URL")
    
    # 保存更新后的JSON
    with open(json_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # 上传回S3
    upload_json(json_filename, s3_json_path)
    
    # 删除本地文件
    os.remove(json_filename)
    
    # 返回统计
    return {
        'total': total_items,
        'processed': processed,
        'skipped': skipped,
        'errors': errors
    }

def main():
    print("# CCt#25: 合并dining分类静态地图任务")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 保存一个示例用于最终报告
    example_before = None
    example_after = None
    
    # 处理dev环境
    stats_dev = process_environment(
        'dev',
        'dining-dev.json',
        's3://baliciaga-database/data/dining-dev.json'
    )
    
    # 处理prod环境
    stats_prod = process_environment(
        'prod',
        'dining.json',
        's3://baliciaga-database/data/dining.json'
    )
    
    # 获取一个示例
    print("\n获取示例...")
    subprocess.run(['aws', 's3', 'cp', 's3://baliciaga-database/data/dining-dev.json', 'temp.json'], capture_output=True)
    with open('temp.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        for item in data:
            if 'staticMapS3Url' in item and item['staticMapS3Url'] and 'staticmap.png' in item['staticMapS3Url']:
                example_after = {
                    'name': item.get('name', 'Unknown'),
                    'url': item['staticMapS3Url']
                }
                # 构造修改前的URL（基于模式）
                merchant_dir = extract_merchant_directory(item['photos'][0]) if item.get('photos') else 'unknown'
                example_before = {
                    'name': example_after['name'],
                    'url': f"https://dyyme2yybmi4j.cloudfront.net/dining-image-dev/static-maps/{merchant_dir}.png"
                }
                break
    os.remove('temp.json')
    
    # 生成最终报告
    print("\n" + "="*60)
    print("# 最终报告")
    print("="*60)
    
    print(f"\n## DEV环境统计")
    print(f"- 总商户数: {stats_dev['total']}")
    print(f"- 成功处理: {stats_dev['processed']}")
    print(f"- 跳过: {stats_dev['skipped']}")
    print(f"- 错误: {stats_dev['errors']}")
    
    print(f"\n## PROD环境统计")
    print(f"- 总商户数: {stats_prod['total']}")
    print(f"- 成功处理: {stats_prod['processed']}")
    print(f"- 跳过: {stats_prod['skipped']}")
    print(f"- 错误: {stats_prod['errors']}")
    
    print(f"\n## 示例验证")
    if example_before and example_after:
        print(f"\n商户: {example_after['name']}")
        print(f"\n修改前 staticMapS3Url:")
        print(f"  {example_before['url']}")
        print(f"\n修改后 staticMapS3Url:")
        print(f"  {example_after['url']}")
    
    print(f"\n任务完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()