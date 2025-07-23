#!/usr/bin/env python3
import subprocess
import json

def scan_for_png_staticmaps():
    """扫描所有S3相册中的staticmap.png文件"""
    
    print("=== 扫描所有S3相册中的staticmap.png文件 ===\n")
    
    # 定义所有标准相册
    albums = [
        'cafe-image-dev', 'cafe-image-prod',
        'dining-image-dev', 'dining-image-prod',
        'bar-image-dev', 'bar-image-prod',
        'cowork-image-dev', 'cowork-image-prod'
    ]
    
    all_png_files = []
    
    for album in albums:
        print(f"扫描 {album}...")
        
        # 执行S3 ls命令
        cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"  ❌ 扫描失败: {result.stderr}")
            continue
        
        # 查找staticmap.png文件
        album_png_files = []
        for line in result.stdout.splitlines():
            if line.strip() and 'staticmap.png' in line:
                parts = line.split()
                if len(parts) >= 4:
                    file_path = parts[3]
                    s3_path = f"s3://baliciaga-database/{file_path}"
                    album_png_files.append({
                        'album': album,
                        'path': file_path,
                        's3_path': s3_path,
                        'merchant_folder': file_path.split('/')[-2]
                    })
        
        if album_png_files:
            print(f"  找到 {len(album_png_files)} 个staticmap.png文件")
            for file_info in album_png_files:
                print(f"    - {file_info['merchant_folder']}/staticmap.png")
        else:
            print(f"  ✅ 未找到staticmap.png文件")
        
        all_png_files.extend(album_png_files)
    
    # 生成报告
    print("\n" + "="*60)
    print("扫描结果汇总")
    print("="*60)
    print(f"\n总共找到 {len(all_png_files)} 个需要转换的staticmap.png文件\n")
    
    if all_png_files:
        print("详细列表：")
        for i, file_info in enumerate(all_png_files, 1):
            print(f"{i}. {file_info['path']}")
        
        # 保存到JSON文件
        with open('png_staticmaps_to_convert.json', 'w', encoding='utf-8') as f:
            json.dump(all_png_files, f, ensure_ascii=False, indent=2)
        
        print(f"\n文件列表已保存到: png_staticmaps_to_convert.json")
    else:
        print("太好了！所有相册中都没有找到需要转换的staticmap.png文件。")
    
    return all_png_files

if __name__ == "__main__":
    png_files = scan_for_png_staticmaps()
    
    if png_files:
        print("\n" + "="*60)
        print("下一步操作")
        print("="*60)
        print(f"找到了 {len(png_files)} 个PNG文件需要转换为WebP格式。")
        print("请确认是否继续进行转换操作。")