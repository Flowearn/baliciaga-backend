#!/usr/bin/env python3
import subprocess
import json
from urllib.parse import urlparse
import time

def download_json(s3_path, local_path):
    """从S3下载JSON文件"""
    print(f"下载 {s3_path}")
    cmd = ['aws', 's3', 'cp', s3_path, local_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"下载失败: {result.stderr}")

def check_s3_file_exists(s3_path):
    """检查S3文件是否存在"""
    cmd = ['aws', 's3', 'ls', s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and len(result.stdout.strip()) > 0

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

def analyze_staticmaps(json_file, env):
    """分析静态地图的存在情况"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    exists_list = []  # 清单A: 静态地图存在的商户
    missing_list = [] # 清单B: 静态地图缺失的商户
    no_staticmap_field = [] # 没有staticMapS3Url字段的商户
    
    print(f"\n分析 {env.upper()} 环境的静态地图...")
    print(f"总商户数: {len(data)}")
    
    for item in data:
        merchant_name = item.get('name', 'Unknown')
        
        # 检查是否有staticMapS3Url字段
        if 'staticMapS3Url' not in item or not item['staticMapS3Url']:
            no_staticmap_field.append(merchant_name)
            continue
        
        # 获取商户目录
        merchant_dir = None
        if 'photos' in item and item['photos']:
            merchant_dir = extract_merchant_directory(item['photos'][0])
        
        # 转换CDN URL为S3路径
        static_map_url = item['staticMapS3Url']
        if static_map_url.startswith('https://'):
            parsed = urlparse(static_map_url)
            s3_path = 's3://baliciaga-database' + parsed.path
        else:
            s3_path = static_map_url
        
        # 检查文件是否存在
        if check_s3_file_exists(s3_path):
            exists_list.append({
                'name': merchant_name,
                'directory': merchant_dir,
                'current_url': static_map_url,
                's3_path': s3_path
            })
        else:
            missing_list.append({
                'name': merchant_name,
                'directory': merchant_dir,
                'expected_url': static_map_url
            })
    
    return {
        'exists': exists_list,
        'missing': missing_list,
        'no_field': no_staticmap_field,
        'total': len(data)
    }

def main():
    print("# CCt#28: 分析Bar分类静态地图")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 下载JSON文件
    download_json('s3://baliciaga-database/data/bars-dev.json', 'bars-dev.json')
    download_json('s3://baliciaga-database/data/bars.json', 'bars.json')
    
    # 分析两个环境
    dev_results = analyze_staticmaps('bars-dev.json', 'dev')
    prod_results = analyze_staticmaps('bars.json', 'prod')
    
    # 生成分析报告
    print("\n" + "="*60)
    print("# 分析报告")
    print("="*60)
    
    print(f"\n## DEV环境统计")
    print(f"- 总商户数: {dev_results['total']}")
    print(f"- 静态地图存在: {len(dev_results['exists'])}")
    print(f"- 静态地图缺失: {len(dev_results['missing'])}")
    print(f"- 无静态地图字段: {len(dev_results['no_field'])}")
    
    print(f"\n## PROD环境统计")
    print(f"- 总商户数: {prod_results['total']}")
    print(f"- 静态地图存在: {len(prod_results['exists'])}")
    print(f"- 静态地图缺失: {len(prod_results['missing'])}")
    print(f"- 无静态地图字段: {len(prod_results['no_field'])}")
    
    # 详细清单
    print("\n" + "="*60)
    print("# 清单A: 待迁移（静态地图存在）")
    print("="*60)
    
    print("\n## DEV环境")
    for idx, item in enumerate(dev_results['exists'], 1):
        print(f"{idx}. {item['name']}")
        if item['directory']:
            print(f"   目录: {item['directory']}")
    
    print("\n## PROD环境")
    for idx, item in enumerate(prod_results['exists'], 1):
        print(f"{idx}. {item['name']}")
        if item['directory']:
            print(f"   目录: {item['directory']}")
    
    print("\n" + "="*60)
    print("# 清单B: 已缺失（静态地图不存在）")
    print("="*60)
    
    print("\n## DEV环境")
    if dev_results['missing']:
        for idx, item in enumerate(dev_results['missing'], 1):
            print(f"{idx}. {item['name']}")
            print(f"   期望URL: {item['expected_url']}")
    else:
        print("无缺失")
    
    print("\n## PROD环境")
    if prod_results['missing']:
        for idx, item in enumerate(prod_results['missing'], 1):
            print(f"{idx}. {item['name']}")
            print(f"   期望URL: {item['expected_url']}")
    else:
        print("无缺失")
    
    # 保存结果供后续使用
    results = {
        'dev': dev_results,
        'prod': prod_results
    }
    
    with open('bar_staticmap_analysis.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\n分析完成，结果已保存到 bar_staticmap_analysis.json")
    print(f"完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()