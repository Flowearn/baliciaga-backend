#!/usr/bin/env python3
import subprocess
import json
from collections import defaultdict

def scan_staticmap_files():
    """扫描所有相册中的静态地图文件"""
    
    # 定义所有8个标准相册
    albums = [
        'cafe-image-dev',
        'cafe-image-prod',
        'dining-image-dev',
        'dining-image-prod',
        'bar-image-dev',
        'bar-image-prod',
        'cowork-image-dev',
        'cowork-image-prod'
    ]
    
    all_staticmap_files = []
    pattern_stats = defaultdict(int)
    
    for album in albums:
        print(f"\n扫描 {album}/ ...")
        
        # 使用AWS CLI递归列出所有文件
        cmd = [
            'aws', 's3', 'ls', 
            f's3://baliciaga-database/{album}/',
            '--recursive'
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # 解析输出并查找静态地图文件
            album_files = []
            for line in result.stdout.splitlines():
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 4:
                        file_path = parts[3]
                        
                        # 查找包含static的文件
                        if 'static' in file_path.lower():
                            full_path = f"s3://baliciaga-database/{file_path}"
                            file_info = {
                                'album': album,
                                'path': full_path,
                                'key': file_path,
                                'filename': file_path.split('/')[-1]
                            }
                            
                            # 分析文件命名模式
                            if '_static.webp' in file_path:
                                pattern_stats['{merchant}_{placeId}/{merchant}_static.webp'] += 1
                                file_info['pattern'] = 'merchant_placeId'
                            elif '_static.png' in file_path:
                                pattern_stats['{merchant}_{placeId}/{merchant}_static.png'] += 1
                                file_info['pattern'] = 'merchant_placeId_png'
                            elif '/staticmap.webp' in file_path:
                                pattern_stats['{merchant}/staticmap.webp'] += 1
                                file_info['pattern'] = 'simple_webp'
                            elif '/staticmap.png' in file_path:
                                pattern_stats['{merchant}/staticmap.png'] += 1
                                file_info['pattern'] = 'simple_png'
                            else:
                                pattern_stats['other'] += 1
                                file_info['pattern'] = 'other'
                            
                            all_staticmap_files.append(file_info)
                            album_files.append(file_info)
            
            print(f"  找到 {len(album_files)} 个静态地图文件")
            
            # 显示前几个示例
            if album_files:
                print("  示例:")
                for i, file_info in enumerate(album_files[:3]):
                    print(f"    {file_info['key']}")
                if len(album_files) > 3:
                    print(f"    ... 还有 {len(album_files) - 3} 个文件")
            
        except subprocess.CalledProcessError as e:
            print(f"  错误: 无法访问 {album}: {e}")
    
    # 保存结果
    with open('all_staticmap_files.json', 'w', encoding='utf-8') as f:
        json.dump(all_staticmap_files, f, ensure_ascii=False, indent=2)
    
    return all_staticmap_files, pattern_stats

def analyze_patterns(files, pattern_stats):
    """分析文件命名模式"""
    print("\n" + "=" * 80)
    print("文件命名模式分析:")
    print("=" * 80)
    
    for pattern, count in sorted(pattern_stats.items(), key=lambda x: x[1], reverse=True):
        print(f"{pattern}: {count} 个文件")
    
    # 分析每个相册的模式
    print("\n各相册的命名模式:")
    album_patterns = defaultdict(lambda: defaultdict(int))
    
    for file_info in files:
        album = file_info['album']
        pattern = file_info['pattern']
        album_patterns[album][pattern] += 1
    
    for album in sorted(album_patterns.keys()):
        print(f"\n{album}:")
        for pattern, count in album_patterns[album].items():
            print(f"  {pattern}: {count}")
    
    # 找出需要处理的PNG文件
    png_files = [f for f in files if f['filename'].endswith('.png')]
    webp_files = [f for f in files if f['filename'].endswith('.webp')]
    
    print(f"\n文件格式统计:")
    print(f"PNG文件: {len(png_files)} 个")
    print(f"WebP文件: {len(webp_files)} 个")
    
    # 检查是否有重复（同时存在PNG和WebP）
    print("\n检查重复文件...")
    png_paths = {f['key'].replace('.png', '') for f in png_files}
    webp_paths = {f['key'].replace('.webp', '') for f in webp_files}
    
    duplicates = png_paths & webp_paths
    if duplicates:
        print(f"发现 {len(duplicates)} 个位置同时存在PNG和WebP文件:")
        for dup in list(duplicates)[:5]:
            print(f"  {dup}")
        if len(duplicates) > 5:
            print(f"  ... 还有 {len(duplicates) - 5} 个")
    else:
        print("未发现重复文件")

# 执行扫描
print("开始扫描所有相册中的静态地图文件...")
all_files, patterns = scan_staticmap_files()

# 分析结果
analyze_patterns(all_files, patterns)

print(f"\n总共找到 {len(all_files)} 个静态地图文件")
print("详细结果已保存到 all_staticmap_files.json")