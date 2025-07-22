#!/usr/bin/env python3
import json
import subprocess
import re
from collections import defaultdict

# 定义所有需要审计的文件及其预期路径
AUDIT_CONFIG = [
    {
        'file': 'cafes-dev.json',
        's3_path': 's3://baliciaga-database/data/cafes-dev.json',
        'expected_path': 'cafe-image-dev',
        'category': 'cafe',
        'env': 'dev'
    },
    {
        'file': 'cafes.json',
        's3_path': 's3://baliciaga-database/data/cafes.json',
        'expected_path': 'cafe-image-prod',
        'category': 'cafe',
        'env': 'prod'
    },
    {
        'file': 'dining-dev.json',
        's3_path': 's3://baliciaga-database/data/dining-dev.json',
        'expected_path': 'dining-image-dev',
        'category': 'dining',
        'env': 'dev'
    },
    {
        'file': 'dining.json',
        's3_path': 's3://baliciaga-database/data/dining.json',
        'expected_path': 'dining-image-prod',
        'category': 'dining',
        'env': 'prod'
    },
    {
        'file': 'bars-dev.json',
        's3_path': 's3://baliciaga-database/data/bars-dev.json',
        'expected_path': 'bar-image-dev',
        'category': 'bar',
        'env': 'dev'
    },
    {
        'file': 'bars.json',
        's3_path': 's3://baliciaga-database/data/bars.json',
        'expected_path': 'bar-image-prod',
        'category': 'bar',
        'env': 'prod'
    },
    {
        'file': 'cowork-dev.json',
        's3_path': 's3://baliciaga-database/data/cowork-dev.json',
        'expected_path': 'cowork-image-dev',
        'category': 'cowork',
        'env': 'dev'
    },
    {
        'file': 'cowork.json',
        's3_path': 's3://baliciaga-database/data/cowork.json',
        'expected_path': 'cowork-image-prod',
        'category': 'cowork',
        'env': 'prod'
    }
]

def download_file(s3_path, local_file):
    """下载S3文件"""
    cmd = ['aws', 's3', 'cp', s3_path, local_file]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

def check_url_consistency(url, expected_path):
    """检查URL是否包含预期路径"""
    if not url:
        return True  # 空URL不算错误
    
    # 检查URL中是否包含预期路径
    return f"/{expected_path}/" in url

def audit_json_file(config):
    """审计单个JSON文件"""
    print(f"\n审计文件: {config['file']}")
    print(f"预期路径: {config['expected_path']}")
    
    # 下载文件
    if not download_file(config['s3_path'], config['file']):
        print(f"  ❌ 无法下载文件")
        return None
    
    # 读取JSON
    with open(config['file'], 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 统计
    total_items = len(data)
    total_photos = 0
    total_staticmaps = 0
    incorrect_urls = []
    
    # 检查每个商户
    for item in data:
        merchant_name = item.get('name', 'Unknown')
        
        # 检查photos数组
        if 'photos' in item and item['photos']:
            for idx, photo_url in enumerate(item['photos']):
                total_photos += 1
                if not check_url_consistency(photo_url, config['expected_path']):
                    incorrect_urls.append({
                        'merchant': merchant_name,
                        'field': f'photos[{idx}]',
                        'url': photo_url,
                        'expected_path': config['expected_path']
                    })
        
        # 检查staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            total_staticmaps += 1
            if not check_url_consistency(item['staticMapS3Url'], config['expected_path']):
                incorrect_urls.append({
                    'merchant': merchant_name,
                    'field': 'staticMapS3Url',
                    'url': item['staticMapS3Url'],
                    'expected_path': config['expected_path']
                })
    
    # 返回审计结果
    return {
        'file': config['file'],
        'expected_path': config['expected_path'],
        'total_items': total_items,
        'total_photos': total_photos,
        'total_staticmaps': total_staticmaps,
        'incorrect_urls': incorrect_urls,
        'is_consistent': len(incorrect_urls) == 0
    }

def generate_markdown_report(all_results):
    """生成Markdown报告"""
    report = []
    report.append("# JSON文件URL一致性审计报告\n")
    report.append("## 审计时间：2025-07-09\n")
    
    # 总体统计
    total_files = len(all_results)
    consistent_files = sum(1 for r in all_results if r and r['is_consistent'])
    inconsistent_files = total_files - consistent_files
    
    report.append("## 总体结果\n")
    report.append(f"- 审计文件总数：{total_files}")
    report.append(f"- ✅ 一致的文件：{consistent_files}")
    report.append(f"- ❌ 不一致的文件：{inconsistent_files}\n")
    
    # 详细结果
    report.append("## 详细审计结果\n")
    
    for result in all_results:
        if not result:
            continue
            
        report.append(f"### {result['file']}\n")
        report.append(f"- **预期路径**: `{result['expected_path']}`")
        report.append(f"- **商户总数**: {result['total_items']}")
        report.append(f"- **图片URL总数**: {result['total_photos']}")
        report.append(f"- **静态地图URL总数**: {result['total_staticmaps']}")
        
        if result['is_consistent']:
            report.append("- **结果**: ✅ 一致")
        else:
            report.append(f"- **结果**: ❌ 不一致（发现 {len(result['incorrect_urls'])} 个错误）")
            
            report.append("\n**错误的URL列表**:\n")
            for error in result['incorrect_urls'][:10]:  # 最多显示10个
                report.append(f"1. **商户**: {error['merchant']}")
                report.append(f"   - **字段**: {error['field']}")
                report.append(f"   - **错误URL**: `{error['url']}`")
                report.append(f"   - **应包含路径**: `{error['expected_path']}`\n")
            
            if len(result['incorrect_urls']) > 10:
                report.append(f"... 还有 {len(result['incorrect_urls']) - 10} 个错误\n")
        
        report.append("")
    
    return "\n".join(report)

def main():
    print("开始JSON文件URL一致性审计...")
    
    all_results = []
    
    # 审计每个文件
    for config in AUDIT_CONFIG:
        result = audit_json_file(config)
        all_results.append(result)
    
    # 生成报告
    report = generate_markdown_report(all_results)
    
    # 保存报告
    with open('url_consistency_audit_report.md', 'w', encoding='utf-8') as f:
        f.write(report)
    
    print("\n审计完成！报告已保存到 url_consistency_audit_report.md")
    
    # 清理下载的文件
    for config in AUDIT_CONFIG:
        subprocess.run(['rm', '-f', config['file']], capture_output=True)

if __name__ == "__main__":
    main()