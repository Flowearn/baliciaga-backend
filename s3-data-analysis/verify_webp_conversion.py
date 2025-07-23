#!/usr/bin/env python3
import subprocess
import json
import random

def verify_conversion():
    """验证转换结果"""
    
    # 1. 随机选择一个商户进行验证 - 选择 Alma Tapas Bar - Canggu
    test_merchant = "alma-tapas-bar-canggu"
    print(f"验证商户: {test_merchant}")
    
    # 2. 检查dining.json中的URL
    print("\n检查dining.json中的staticMapS3Url...")
    with open('/Users/troy/开发文档/Baliciaga/backend/scripts/dining-dev.json', 'r', encoding='utf-8') as f:
        dining_data = json.load(f)
    
    alma_data = None
    for item in dining_data:
        if 'alma-tapas-bar-canggu' in item.get('name', '').lower().replace(' ', '-'):
            alma_data = item
            break
    
    if alma_data and 'staticMapS3Url' in alma_data:
        static_map_url = alma_data['staticMapS3Url']
        print(f"  URL: {static_map_url}")
        print(f"  格式: {'✅ .webp' if '.webp' in static_map_url else '❌ 不是.webp'}")
    
    # 3. 验证WebP文件在S3上的可访问性
    print("\n验证S3上的WebP文件...")
    
    # 检查dev环境
    webp_url_dev = f"https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/{test_merchant}/staticmap.webp"
    print(f"\n检查Dev环境: {webp_url_dev}")
    cmd = ['curl', '-I', '-s', webp_url_dev]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if 'HTTP/2 200' in result.stdout:
        print("  ✅ Dev环境WebP文件可访问 (HTTP 200)")
    else:
        print("  ❌ Dev环境WebP文件不可访问")
        print(result.stdout[:200])
    
    # 检查prod环境
    webp_url_prod = f"https://d2cmxnft4myi1k.cloudfront.net/dining-image-prod/{test_merchant}/staticmap.webp"
    print(f"\n检查Prod环境: {webp_url_prod}")
    cmd = ['curl', '-I', '-s', webp_url_prod]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if 'HTTP/2 200' in result.stdout:
        print("  ✅ Prod环境WebP文件可访问 (HTTP 200)")
    else:
        print("  ❌ Prod环境WebP文件不可访问")
        print(result.stdout[:200])
    
    # 4. 确认PNG文件已被删除
    print("\n确认PNG文件已被删除...")
    
    # 检查S3上是否还有PNG文件
    cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/dining-image-dev/{test_merchant}/']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    files = result.stdout.strip().split('\n')
    has_png = any('staticmap.png' in line for line in files)
    has_webp = any('staticmap.webp' in line for line in files)
    
    print(f"  PNG文件: {'❌ 仍然存在' if has_png else '✅ 已删除'}")
    print(f"  WebP文件: {'✅ 存在' if has_webp else '❌ 不存在'}")
    
    # 5. 随机抽样其他几个转换结果
    print("\n随机抽样验证其他转换结果...")
    
    samples = [
        ('bar-image-dev', 'platonic'),
        ('cowork-image-prod', 'genesis-creative-centre'),
        ('bar-image-prod', 'black-sand-brewery')
    ]
    
    for album, merchant in samples:
        webp_url = f"https://d2cmxnft4myi1k.cloudfront.net/{album}/{merchant}/staticmap.webp"
        cmd = ['curl', '-I', '-s', webp_url]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if 'HTTP/2 200' in result.stdout:
            print(f"  ✅ {album}/{merchant}/staticmap.webp - 可访问")
        else:
            print(f"  ❌ {album}/{merchant}/staticmap.webp - 不可访问")

# 执行验证
print("=" * 80)
print("开始验证PNG到WebP转换结果...")
print("=" * 80)
verify_conversion()
print("\n" + "=" * 80)
print("验证完成！")