#!/usr/bin/env python3
import subprocess
import json
import os
from collections import defaultdict

def scan_s3_staticmaps():
    """扫描S3中所有的静态地图文件"""
    print("扫描S3中的所有静态地图文件...")
    print("=" * 80)
    
    albums = [
        'cafe-image-dev', 'cafe-image-prod',
        'dining-image-dev', 'dining-image-prod',
        'bar-image-dev', 'bar-image-prod',
        'cowork-image-dev', 'cowork-image-prod'
    ]
    
    s3_staticmaps = defaultdict(list)
    
    for album in albums:
        cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        count = 0
        for line in result.stdout.splitlines():
            if line.strip() and ('static' in line.lower() and ('.webp' in line or '.png' in line)):
                parts = line.split()
                if len(parts) >= 4:
                    file_path = parts[3]
                    full_url = f"https://d2cmxnft4myi1k.cloudfront.net/{file_path}"
                    s3_staticmaps[album].append(full_url)
                    count += 1
        
        print(f"{album}: {count} 个静态地图文件")
    
    return s3_staticmaps

def scan_json_expected_urls():
    """扫描所有JSON文件中期待的静态地图URL"""
    print("\n扫描JSON文件中的静态地图URL...")
    print("=" * 80)
    
    json_configs = [
        ('bars-dev.json', 'bar-image-dev'),
        ('dining-dev.json', 'dining-image-dev'),
        ('cafes-dev.json', 'cafe-image-dev'),
        ('cowork-dev.json', 'cowork-image-dev'),
    ]
    
    json_expected_urls = defaultdict(list)
    merchant_data = defaultdict(list)
    
    scripts_dir = '/Users/troy/开发文档/Baliciaga/backend/scripts'
    
    for json_file, album in json_configs:
        filepath = os.path.join(scripts_dir, json_file)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            count = 0
            for item in data:
                if 'staticMapS3Url' in item and item['staticMapS3Url']:
                    url = item['staticMapS3Url']
                    json_expected_urls[album].append(url)
                    merchant_data[album].append({
                        'name': item.get('name', 'Unknown'),
                        'placeId': item.get('placeId', 'Unknown'),
                        'expectedUrl': url
                    })
                    count += 1
            
            print(f"{json_file} ({album}): {count} 个静态地图URL")
    
    return json_expected_urls, merchant_data

def compare_urls(s3_urls, json_urls, merchant_data):
    """比较S3实际文件和JSON期待的URL"""
    print("\n比较分析...")
    print("=" * 80)
    
    report = {
        'missing_in_s3': defaultdict(list),
        'wrong_format': defaultdict(list),
        'correct': defaultdict(list),
        'extra_in_s3': defaultdict(list)
    }
    
    # 对每个相册进行分析
    for album in ['cafe-image-dev', 'dining-image-dev', 'bar-image-dev', 'cowork-image-dev']:
        s3_set = set(s3_urls.get(album, []))
        json_set = set(json_urls.get(album, []))
        merchants = merchant_data.get(album, [])
        
        print(f"\n{album}:")
        print(f"  S3中的文件数: {len(s3_set)}")
        print(f"  JSON期待的文件数: {len(json_set)}")
        
        # 检查每个JSON期待的URL
        for merchant in merchants:
            expected_url = merchant['expectedUrl']
            merchant_name = merchant['name']
            place_id = merchant['placeId']
            
            if expected_url in s3_set:
                report['correct'][album].append(merchant)
            else:
                # 检查是否有其他格式的文件存在
                found_alternative = False
                for s3_url in s3_set:
                    if place_id in s3_url or merchant_name.lower().replace(' ', '-') in s3_url:
                        report['wrong_format'][album].append({
                            'merchant': merchant,
                            'actualUrl': s3_url,
                            'expectedUrl': expected_url
                        })
                        found_alternative = True
                        break
                
                if not found_alternative:
                    report['missing_in_s3'][album].append(merchant)
        
        # 检查S3中多余的文件
        for s3_url in s3_set:
            if s3_url not in json_set:
                # 检查是否是旧格式
                if '/staticmap.webp' in s3_url or '/staticmap.png' in s3_url:
                    report['extra_in_s3'][album].append({
                        'url': s3_url,
                        'type': 'old_format'
                    })
                else:
                    # 可能是未在JSON中记录的文件
                    report['extra_in_s3'][album].append({
                        'url': s3_url,
                        'type': 'unknown'
                    })
    
    return report

def generate_detailed_report(report):
    """生成详细报告"""
    print("\n" + "=" * 80)
    print("详细报告")
    print("=" * 80)
    
    # 1. 完全正确的
    print("\n✅ 完全正确的静态地图:")
    total_correct = 0
    for album, merchants in report['correct'].items():
        if merchants:
            print(f"\n{album}: {len(merchants)} 个")
            total_correct += len(merchants)
    print(f"\n总计正确: {total_correct} 个")
    
    # 2. 格式错误的
    print("\n\n⚠️  格式错误的静态地图 (文件存在但路径不对):")
    total_wrong_format = 0
    for album, items in report['wrong_format'].items():
        if items:
            print(f"\n{album}: {len(items)} 个")
            for item in items[:5]:  # 只显示前5个
                print(f"  商户: {item['merchant']['name']}")
                print(f"  期待: {item['expectedUrl']}")
                print(f"  实际: {item['actualUrl']}")
                print()
            if len(items) > 5:
                print(f"  ... 还有 {len(items) - 5} 个")
            total_wrong_format += len(items)
    print(f"\n总计格式错误: {total_wrong_format} 个")
    
    # 3. 完全缺失的
    print("\n\n❌ 完全缺失的静态地图:")
    total_missing = 0
    for album, merchants in report['missing_in_s3'].items():
        if merchants:
            print(f"\n{album}: {len(merchants)} 个")
            for merchant in merchants[:5]:  # 只显示前5个
                print(f"  - {merchant['name']} (PlaceId: {merchant['placeId']})")
            if len(merchants) > 5:
                print(f"  ... 还有 {len(merchants) - 5} 个")
            total_missing += len(merchants)
    print(f"\n总计缺失: {total_missing} 个")
    
    # 4. S3中多余的文件
    print("\n\n📦 S3中多余的文件:")
    total_extra = 0
    for album, items in report['extra_in_s3'].items():
        if items:
            old_format = [i for i in items if i['type'] == 'old_format']
            unknown = [i for i in items if i['type'] == 'unknown']
            
            if old_format:
                print(f"\n{album} - 旧格式文件: {len(old_format)} 个")
                for item in old_format[:3]:
                    print(f"  - {item['url'].split('/')[-2]}/staticmap.webp")
                if len(old_format) > 3:
                    print(f"  ... 还有 {len(old_format) - 3} 个")
            
            if unknown:
                print(f"\n{album} - 未知文件: {len(unknown)} 个")
                for item in unknown[:3]:
                    print(f"  - {item['url']}")
                if len(unknown) > 3:
                    print(f"  ... 还有 {len(unknown) - 3} 个")
            
            total_extra += len(items)
    print(f"\n总计多余文件: {total_extra} 个")
    
    # 保存详细报告
    with open('staticmap_audit_report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print("\n\n详细报告已保存到 staticmap_audit_report.json")
    
    return {
        'total_correct': total_correct,
        'total_wrong_format': total_wrong_format,
        'total_missing': total_missing,
        'total_extra': total_extra
    }

def main():
    # 1. 扫描S3
    s3_urls = scan_s3_staticmaps()
    
    # 2. 扫描JSON
    json_urls, merchant_data = scan_json_expected_urls()
    
    # 3. 比较分析
    report = compare_urls(s3_urls, json_urls, merchant_data)
    
    # 4. 生成报告
    summary = generate_detailed_report(report)
    
    # 5. 总结
    print("\n\n" + "=" * 80)
    print("总结")
    print("=" * 80)
    print(f"✅ 完全正确: {summary['total_correct']} 个")
    print(f"⚠️  格式错误: {summary['total_wrong_format']} 个")
    print(f"❌ 完全缺失: {summary['total_missing']} 个")
    print(f"📦 多余文件: {summary['total_extra']} 个")
    
    total_expected = sum(len(urls) for urls in json_urls.values())
    print(f"\n预期总数: {total_expected} 个")
    print(f"正确率: {summary['total_correct'] / total_expected * 100:.1f}%")

if __name__ == "__main__":
    main()