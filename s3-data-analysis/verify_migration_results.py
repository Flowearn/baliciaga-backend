#!/usr/bin/env python3
"""
验证静态地图迁移结果
"""
import subprocess
import json
import re

def download_json_from_s3(json_file):
    """从S3下载JSON文件"""
    local_path = f"/tmp/{json_file}"
    cmd = ['aws', 's3', 'cp', f's3://baliciaga-database/data/{json_file}', local_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to download {json_file}: {result.stderr}")
        return None
    return local_path

def check_static_map_urls(json_file):
    """检查JSON文件中的静态地图URL是否正确"""
    print(f"\n检查 {json_file} 中的静态地图URL...")
    
    local_path = download_json_from_s3(json_file)
    if not local_path:
        return False
    
    with open(local_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    old_format_count = 0
    new_format_count = 0
    missing_count = 0
    
    for item in data:
        url = item.get('staticMapS3Url', '')
        if not url:
            missing_count += 1
            continue
        
        # 检查是否包含商户名_placeId格式的路径
        if re.search(r'/[^/]+_[^/]+/[^/]*static', url):
            old_format_count += 1
            print(f"  ❌ 旧格式: {item['name']} - {url}")
        else:
            new_format_count += 1
    
    print(f"  统计: 新格式={new_format_count}, 旧格式={old_format_count}, 缺失={missing_count}")
    return old_format_count == 0

def check_s3_static_maps(album):
    """检查S3相册中是否还有独立存放的静态地图"""
    print(f"\n检查 {album} 中的独立静态地图...")
    
    cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ❌ 扫描失败: {result.stderr}")
        return False
    
    old_format_files = []
    for line in result.stdout.splitlines():
        if line.strip() and ('static' in line.lower() and ('.webp' in line or '.png' in line)):
            parts = line.split()
            if len(parts) >= 4:
                file_path = parts[3]
                # 检查是否是商户名_placeId格式
                if re.search(r'/[^/]+_[^/]+/[^/]*static', file_path):
                    old_format_files.append(file_path)
    
    if old_format_files:
        print(f"  ❌ 发现 {len(old_format_files)} 个旧格式静态地图:")
        for f in old_format_files[:5]:  # 只显示前5个
            print(f"    - {f}")
        if len(old_format_files) > 5:
            print(f"    ... 还有 {len(old_format_files) - 5} 个")
    else:
        print(f"  ✅ 未发现旧格式静态地图")
    
    return len(old_format_files) == 0

def test_url_accessibility(json_file, sample_size=5):
    """测试JSON文件中的静态地图URL是否可访问"""
    print(f"\n测试 {json_file} 中的URL可访问性 (抽样{sample_size}个)...")
    
    local_path = download_json_from_s3(json_file)
    if not local_path:
        return False
    
    with open(local_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 抽样测试
    tested = 0
    success = 0
    for item in data:
        url = item.get('staticMapS3Url', '')
        if url and tested < sample_size:
            cmd = ['curl', '-I', '-s', url]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if 'HTTP/2 200' in result.stdout or 'HTTP/1.1 200' in result.stdout:
                print(f"  ✅ {item['name']}: 可访问")
                success += 1
            else:
                print(f"  ❌ {item['name']}: 无法访问 - {url}")
            tested += 1
    
    print(f"  成功率: {success}/{tested}")
    return success == tested

def main():
    """主函数"""
    print("=== 验证静态地图迁移结果 ===")
    
    # 定义要验证的文件和相册
    tasks = [
        ('dining-dev.json', 'dining-image-dev'),
        ('dining.json', 'dining-image-prod'),
        ('bars-dev.json', 'bar-image-dev'),
        ('bars.json', 'bar-image-prod')
    ]
    
    all_passed = True
    
    for json_file, album in tasks:
        print(f"\n{'='*60}")
        print(f"验证 {json_file} 和 {album}")
        print(f"{'='*60}")
        
        # 检查JSON URL格式
        url_check = check_static_map_urls(json_file)
        all_passed = all_passed and url_check
        
        # 检查S3相册
        s3_check = check_s3_static_maps(album)
        all_passed = all_passed and s3_check
        
        # 测试URL可访问性
        access_check = test_url_accessibility(json_file, 3)
        all_passed = all_passed and access_check
    
    print(f"\n{'='*60}")
    if all_passed:
        print("✅ 所有验证通过！迁移成功完成。")
    else:
        print("❌ 部分验证失败，请检查上述错误。")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()