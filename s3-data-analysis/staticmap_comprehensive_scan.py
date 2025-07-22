#!/usr/bin/env python3
import subprocess
import json
import os
from collections import defaultdict

def scan_all_s3_staticmaps():
    """扫描S3中所有的静态地图文件"""
    print("扫描S3中的所有静态地图文件...")
    print("=" * 100)
    
    albums = [
        'cafe-image-dev', 'cafe-image-prod',
        'dining-image-dev', 'dining-image-prod',
        'bar-image-dev', 'bar-image-prod',
        'cowork-image-dev', 'cowork-image-prod'
    ]
    
    all_staticmaps = []
    
    for album in albums:
        cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        album_maps = []
        for line in result.stdout.splitlines():
            if line.strip() and ('static' in line.lower() and ('.webp' in line or '.png' in line)):
                parts = line.split()
                if len(parts) >= 4:
                    file_path = parts[3]
                    full_url = f"https://d2cmxnft4myi1k.cloudfront.net/{file_path}"
                    # 提取路径结构
                    path_parts = file_path.split('/')
                    if len(path_parts) >= 3:
                        structure = {
                            'album': path_parts[0],
                            'folder': path_parts[1],
                            'filename': path_parts[2],
                            'full_url': full_url,
                            'full_path': file_path
                        }
                        album_maps.append(structure)
                        all_staticmaps.append(structure)
        
        print(f"\n{album}:")
        print(f"  找到 {len(album_maps)} 个静态地图文件")
        # 显示前3个示例
        for i, item in enumerate(album_maps[:3]):
            print(f"  - {item['folder']}/{item['filename']}")
        if len(album_maps) > 3:
            print(f"  ... 还有 {len(album_maps) - 3} 个")
    
    return all_staticmaps

def scan_all_json_expected_urls():
    """扫描所有dev环境JSON文件中期待的静态地图URL"""
    print("\n\n扫描JSON文件中期待的静态地图URL...")
    print("=" * 100)
    
    json_configs = [
        ('bars-dev.json', 'bar-image-dev'),
        ('dining-dev.json', 'dining-image-dev'),
        ('cafes-dev.json', 'cafe-image-dev'),
        ('cowork-dev.json', 'cowork-image-dev'),
    ]
    
    all_expected = []
    scripts_dir = '/Users/troy/开发文档/Baliciaga/backend/scripts'
    
    for json_file, expected_album in json_configs:
        filepath = os.path.join(scripts_dir, json_file)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            json_urls = []
            for item in data:
                if 'staticMapS3Url' in item and item['staticMapS3Url']:
                    url = item['staticMapS3Url']
                    # 解析URL结构
                    if 'cloudfront.net/' in url:
                        path = url.split('cloudfront.net/')[1]
                        path_parts = path.split('/')
                        if len(path_parts) >= 3:
                            structure = {
                                'merchant_name': item.get('name', 'Unknown'),
                                'place_id': item.get('placeId', 'Unknown'),
                                'expected_url': url,
                                'expected_album': path_parts[0],
                                'expected_folder': path_parts[1],
                                'expected_filename': path_parts[2],
                                'json_source': json_file
                            }
                            json_urls.append(structure)
                            all_expected.append(structure)
            
            print(f"\n{json_file}:")
            print(f"  找到 {len(json_urls)} 个静态地图URL")
            # 显示前3个示例
            for i, item in enumerate(json_urls[:3]):
                print(f"  - {item['merchant_name']}: {item['expected_folder']}/{item['expected_filename']}")
            if len(json_urls) > 3:
                print(f"  ... 还有 {len(json_urls) - 3} 个")
    
    return all_expected

def detailed_comparison(s3_maps, json_expected):
    """详细比较S3实际文件和JSON期待的URL"""
    print("\n\n详细比较报告...")
    print("=" * 100)
    
    # 按相册分组
    s3_by_album = defaultdict(list)
    for item in s3_maps:
        s3_by_album[item['album']].append(item)
    
    json_by_album = defaultdict(list)
    for item in json_expected:
        json_by_album[item['expected_album']].append(item)
    
    # 只分析dev环境
    dev_albums = ['cafe-image-dev', 'dining-image-dev', 'bar-image-dev', 'cowork-image-dev']
    
    total_matches = 0
    total_mismatches = 0
    total_missing = 0
    
    for album in dev_albums:
        print(f"\n\n{album}:")
        print("-" * 80)
        
        s3_items = s3_by_album.get(album, [])
        json_items = json_by_album.get(album, [])
        
        # 创建S3 URL集合
        s3_urls = {item['full_url'] for item in s3_items}
        
        # 分析每个JSON期待的URL
        matches = []
        mismatches = []
        missing = []
        
        for expected in json_items:
            if expected['expected_url'] in s3_urls:
                matches.append(expected)
            else:
                # 检查是否有类似的文件
                found_similar = False
                for s3_item in s3_items:
                    if expected['place_id'] in s3_item['folder']:
                        mismatches.append({
                            'merchant': expected['merchant_name'],
                            'expected': expected['expected_url'],
                            'found': s3_item['full_url'],
                            'issue': '文件夹名称不匹配'
                        })
                        found_similar = True
                        break
                
                if not found_similar:
                    missing.append(expected)
        
        # 报告结果
        print(f"✅ 完全匹配: {len(matches)} 个")
        print(f"⚠️  路径不匹配: {len(mismatches)} 个")
        print(f"❌ 完全缺失: {len(missing)} 个")
        
        # 显示不匹配的详情
        if mismatches:
            print(f"\n路径不匹配的文件:")
            for item in mismatches[:5]:
                print(f"\n  商户: {item['merchant']}")
                print(f"  期待: {item['expected']}")
                print(f"  实际: {item['found']}")
            if len(mismatches) > 5:
                print(f"\n  ... 还有 {len(mismatches) - 5} 个不匹配")
        
        # 显示缺失的文件
        if missing:
            print(f"\n完全缺失的文件:")
            for item in missing[:5]:
                print(f"  - {item['merchant_name']} (PlaceId: {item['place_id']})")
                print(f"    期待: {item['expected_url']}")
            if len(missing) > 5:
                print(f"  ... 还有 {len(missing) - 5} 个缺失")
        
        # 找出S3中多余的文件
        expected_urls = {item['expected_url'] for item in json_items}
        extra_files = [item for item in s3_items if item['full_url'] not in expected_urls]
        
        if extra_files:
            print(f"\nS3中多余的文件: {len(extra_files)} 个")
            for item in extra_files[:5]:
                print(f"  - {item['folder']}/{item['filename']}")
            if len(extra_files) > 5:
                print(f"  ... 还有 {len(extra_files) - 5} 个")
        
        total_matches += len(matches)
        total_mismatches += len(mismatches)
        total_missing += len(missing)
    
    # 总结
    print("\n\n" + "=" * 100)
    print("总体统计:")
    print("=" * 100)
    print(f"✅ 完全匹配: {total_matches} 个")
    print(f"⚠️  路径不匹配: {total_mismatches} 个")
    print(f"❌ 完全缺失: {total_missing} 个")
    print(f"\n总计期待的静态地图: {len(json_expected)} 个")
    print(f"匹配率: {total_matches / len(json_expected) * 100:.1f}%")

def main():
    # 1. 扫描所有S3静态地图
    s3_maps = scan_all_s3_staticmaps()
    
    # 2. 扫描所有JSON期待的URL
    json_expected = scan_all_json_expected_urls()
    
    # 3. 详细比较
    detailed_comparison(s3_maps, json_expected)
    
    # 保存详细数据
    report_data = {
        's3_total': len(s3_maps),
        'json_expected_total': len(json_expected),
        's3_maps': s3_maps,
        'json_expected': json_expected
    }
    
    with open('staticmap_full_scan_report.json', 'w', encoding='utf-8') as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)
    
    print("\n\n详细数据已保存到 staticmap_full_scan_report.json")

if __name__ == "__main__":
    main()