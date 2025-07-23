#!/usr/bin/env python3
import subprocess
import json

def find_staticmap_pngs():
    """查找所有标准相册中的staticmap.png文件"""
    
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
    
    all_png_files = []
    
    for album in albums:
        print(f"\n检查 {album}/ ...")
        
        # 使用AWS CLI递归列出所有staticmap.png文件
        cmd = [
            'aws', 's3', 'ls', 
            f's3://baliciaga-database/{album}/',
            '--recursive'
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # 解析输出并查找staticmap.png文件
            png_count = 0
            for line in result.stdout.splitlines():
                if line.strip() and 'staticmap.png' in line:
                    parts = line.split()
                    if len(parts) >= 4:
                        file_path = parts[3]
                        full_path = f"s3://baliciaga-database/{file_path}"
                        all_png_files.append({
                            'album': album,
                            'path': full_path,
                            'key': file_path
                        })
                        png_count += 1
                        print(f"  找到: {file_path}")
            
            print(f"  {album} 中找到 {png_count} 个 staticmap.png 文件")
            
        except subprocess.CalledProcessError as e:
            print(f"  错误: 无法访问 {album}: {e}")
    
    # 保存结果到JSON文件
    with open('staticmap_pngs_to_convert.json', 'w', encoding='utf-8') as f:
        json.dump(all_png_files, f, ensure_ascii=False, indent=2)
    
    return all_png_files

# 执行搜索
print("开始搜索所有标准相册中的 staticmap.png 文件...")
png_files = find_staticmap_pngs()

print(f"\n========== 搜索完成 ==========")
print(f"总共找到 {len(png_files)} 个需要转换的 staticmap.png 文件")
print(f"结果已保存到 staticmap_pngs_to_convert.json")

# 统计每个相册的文件数
album_stats = {}
for file in png_files:
    album = file['album']
    album_stats[album] = album_stats.get(album, 0) + 1

print("\n各相册统计:")
for album, count in sorted(album_stats.items()):
    print(f"  {album}: {count} 个文件")