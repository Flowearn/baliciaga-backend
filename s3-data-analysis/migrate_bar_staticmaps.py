#!/usr/bin/env python3
import subprocess
import json
import os
from urllib.parse import urlparse
import time

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

def move_static_map(source_s3, target_directory, env):
    """移动静态地图到商户目录"""
    # 构造目标S3路径
    target_s3 = f"s3://baliciaga-database/bar-image-{env}/{target_directory}/staticmap.png"
    
    # 执行移动
    print(f"  移动: {source_s3}")
    print(f"    到: {target_s3}")
    
    cmd = ['aws', 's3', 'mv', source_s3, target_s3]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        # 返回新的CDN URL
        return f"https://dyyme2yybmi4j.cloudfront.net/bar-image-{env}/{target_directory}/staticmap.png"
    else:
        print(f"    错误: {result.stderr}")
        return None

def process_migrations():
    """执行静态地图迁移"""
    print("# CCt#28: 执行Bar分类静态地图迁移")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 加载分析结果
    with open('bar_staticmap_analysis.json', 'r', encoding='utf-8') as f:
        analysis = json.load(f)
    
    # 下载JSON文件
    download_json('s3://baliciaga-database/data/bars-dev.json', 'bars-dev.json')
    download_json('s3://baliciaga-database/data/bars.json', 'bars.json')
    
    # 读取JSON数据
    with open('bars-dev.json', 'r', encoding='utf-8') as f:
        bars_dev_data = json.load(f)
    with open('bars.json', 'r', encoding='utf-8') as f:
        bars_prod_data = json.load(f)
    
    # 统计
    dev_processed = 0
    prod_processed = 0
    
    # 处理DEV环境
    print("\n" + "="*60)
    print("处理 DEV 环境")
    print("="*60)
    
    for item in analysis['dev']['exists']:
        merchant_name = item['name']
        merchant_dir = item['directory']
        s3_path = item['s3_path']
        
        if not merchant_dir:
            print(f"\n跳过 {merchant_name}: 无法确定目标目录")
            continue
        
        print(f"\n处理商户: {merchant_name}")
        
        # 移动静态地图
        new_url = move_static_map(s3_path, merchant_dir, 'dev')
        
        if new_url:
            # 更新JSON中的URL
            for bar_item in bars_dev_data:
                if bar_item.get('name') == merchant_name:
                    bar_item['staticMapS3Url'] = new_url
                    dev_processed += 1
                    print(f"  成功: 更新URL")
                    break
    
    # 处理PROD环境
    print("\n" + "="*60)
    print("处理 PROD 环境")
    print("="*60)
    
    for item in analysis['prod']['exists']:
        merchant_name = item['name']
        merchant_dir = item['directory']
        s3_path = item['s3_path']
        
        if not merchant_dir:
            print(f"\n跳过 {merchant_name}: 无法确定目标目录")
            continue
        
        print(f"\n处理商户: {merchant_name}")
        
        # 移动静态地图
        new_url = move_static_map(s3_path, merchant_dir, 'prod')
        
        if new_url:
            # 更新JSON中的URL
            for bar_item in bars_prod_data:
                if bar_item.get('name') == merchant_name:
                    bar_item['staticMapS3Url'] = new_url
                    prod_processed += 1
                    print(f"  成功: 更新URL")
                    break
    
    # 保存更新后的JSON
    with open('bars-dev.json', 'w', encoding='utf-8') as f:
        json.dump(bars_dev_data, f, ensure_ascii=False, indent=2)
    with open('bars.json', 'w', encoding='utf-8') as f:
        json.dump(bars_prod_data, f, ensure_ascii=False, indent=2)
    
    # 上传回S3
    upload_json('bars-dev.json', 's3://baliciaga-database/data/bars-dev.json')
    upload_json('bars.json', 's3://baliciaga-database/data/bars.json')
    
    # 生成最终报告
    print("\n" + "="*60)
    print("# 迁移统计")
    print("="*60)
    print(f"\nDEV环境: 成功处理 {dev_processed} 个商户")
    print(f"PROD环境: 成功处理 {prod_processed} 个商户")
    print(f"总计: {dev_processed + prod_processed} 个静态地图已迁移")
    
    # 生成缺失清单
    print("\n" + "="*60)
    print("# 清单B: 缺失静态地图的商户列表（最终版）")
    print("="*60)
    
    missing_merchants = []
    
    print("\n## DEV环境缺失的商户:")
    for idx, item in enumerate(analysis['dev']['missing'], 1):
        print(f"{idx}. {item['name']}")
        missing_merchants.append({
            'env': 'dev',
            'name': item['name'],
            'expected_url': item['expected_url']
        })
    
    print("\n## PROD环境缺失的商户:")
    for idx, item in enumerate(analysis['prod']['missing'], 1):
        print(f"{idx}. {item['name']}")
        missing_merchants.append({
            'env': 'prod',
            'name': item['name'],
            'expected_url': item['expected_url']
        })
    
    # 保存缺失清单
    with open('bar_missing_staticmaps.json', 'w', encoding='utf-8') as f:
        json.dump(missing_merchants, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n缺失清单已保存到 bar_missing_staticmaps.json")
    print(f"完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 清理临时文件
    os.remove('bars-dev.json')
    os.remove('bars.json')

if __name__ == "__main__":
    process_migrations()