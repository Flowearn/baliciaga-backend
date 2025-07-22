#!/usr/bin/env python3
"""
最终的静态地图迁移脚本
将bar和dining分类（包括dev和prod环境）中，所有独立存放的静态地图图片，
移动到其对应的商户主相册中，并更新JSON文件中的URL。
"""
import subprocess
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

def download_json_from_s3(json_file):
    """从S3下载JSON文件"""
    local_path = f"/tmp/{json_file}"
    cmd = ['aws', 's3', 'cp', f's3://baliciaga-database/data/{json_file}', local_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to download {json_file}: {result.stderr}")
        return None
    return local_path

def upload_json_to_s3(local_path, json_file):
    """上传JSON文件到S3的正确路径"""
    cmd = ['aws', 's3', 'cp', local_path, f's3://baliciaga-database/data/{json_file}']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to upload {json_file}: {result.stderr}")
        return False
    
    # 清除CloudFront缓存
    cmd = ['aws', 'cloudfront', 'create-invalidation', 
           '--distribution-id', 'E2OWVXNIWJXMFR', 
           '--paths', f'/data/{json_file}']
    subprocess.run(cmd, capture_output=True, text=True)
    return True

def extract_merchant_and_placeid_from_path(path):
    """从路径中提取商户名和placeId"""
    # 匹配模式: merchant_placeId/staticmap.webp 或 merchant_placeId/merchant_static.webp
    match = re.search(r'/([^/]+)_([^/]+)/[^/]*static[^/]*\.(webp|png)$', path)
    if match:
        return match.group(1), match.group(2)
    return None, None

def find_staticmaps_in_album(album):
    """在指定相册中查找所有静态地图"""
    print(f"扫描 {album} 中的静态地图...")
    
    cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ❌ 扫描失败: {result.stderr}")
        return []
    
    staticmaps = []
    for line in result.stdout.splitlines():
        if line.strip() and ('static' in line.lower() and ('.webp' in line or '.png' in line)):
            parts = line.split()
            if len(parts) >= 4:
                file_path = parts[3]
                merchant, placeid = extract_merchant_and_placeid_from_path(file_path)
                if merchant and placeid:
                    staticmaps.append({
                        'path': file_path,
                        'merchant': merchant,
                        'placeid': placeid,
                        'album': album
                    })
    
    print(f"  找到 {len(staticmaps)} 个独立存放的静态地图")
    return staticmaps

def move_staticmap(staticmap_info, dry_run=False):
    """移动单个静态地图到商户主相册"""
    album = staticmap_info['album']
    merchant = staticmap_info['merchant']
    old_path = staticmap_info['path']
    
    # 构建新路径
    new_path = f"{album}/{merchant}/staticmap.webp"
    old_s3_path = f"s3://baliciaga-database/{old_path}"
    new_s3_path = f"s3://baliciaga-database/{new_path}"
    
    if dry_run:
        print(f"  [DRY RUN] Would move: {old_path} -> {new_path}")
        return True
    
    # 复制文件到新位置
    cmd = ['aws', 's3', 'cp', old_s3_path, new_s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ❌ 复制失败: {old_path} -> {new_path}")
        print(f"     错误: {result.stderr}")
        return False
    
    # 删除旧文件
    cmd = ['aws', 's3', 'rm', old_s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ⚠️  删除旧文件失败: {old_path}")
    
    print(f"  ✅ 已移动: {merchant}_* -> {merchant}/staticmap.webp")
    return True

def update_json_urls(json_file, album, staticmaps, dry_run=False):
    """更新JSON文件中的静态地图URL"""
    print(f"\n更新 {json_file} 中的URL...")
    
    # 下载JSON文件
    local_path = download_json_from_s3(json_file)
    if not local_path:
        return False
    
    # 读取JSON
    with open(local_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 创建商户名到新路径的映射
    merchant_to_new_path = {}
    for sm in staticmaps:
        merchant_to_new_path[sm['merchant'].lower()] = f"{album}/{sm['merchant']}/staticmap.webp"
    
    # 更新URL
    updates = 0
    for item in data:
        old_url = item.get('staticMapS3Url', '')
        if not old_url:
            continue
            
        # 从URL中提取商户名和placeId来进行匹配
        url_match = re.search(r'/([^/]+)_([^/]+)/[^/]*static[^/]*\.(webp|png)$', old_url)
        if url_match:
            url_merchant = url_match.group(1)
            url_placeid = url_match.group(2)
            
            # 在staticmaps中查找匹配项
            for sm in staticmaps:
                if sm['merchant'] == url_merchant and sm['placeid'] == url_placeid:
                    new_path = f"{album}/{sm['merchant']}/staticmap.webp"
                    # 保持原有的CloudFront distribution
                    if 'd2cmxnft4myi1k.cloudfront.net' in old_url:
                        new_url = f"https://d2cmxnft4myi1k.cloudfront.net/{new_path}"
                    else:
                        new_url = f"https://d12sihvag1cihk.cloudfront.net/{new_path}"
                    if dry_run:
                        print(f"  [DRY RUN] Would update {item['name']}: {old_url} -> {new_url}")
                    else:
                        item['staticMapS3Url'] = new_url
                        print(f"  ✅ 更新 {item['name']} 的静态地图URL")
                    updates += 1
                    break
    
    if updates > 0 and not dry_run:
        # 保存更新后的JSON
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 上传回S3
        if upload_json_to_s3(local_path, json_file):
            print(f"  ✅ 成功更新 {json_file} 中的 {updates} 个URL")
            return True
        else:
            print(f"  ❌ 上传 {json_file} 失败")
            return False
    elif updates == 0:
        print(f"  ℹ️  {json_file} 中没有需要更新的URL")
    
    return True

def process_album_and_json(json_file, album, dry_run=False):
    """处理一个相册和对应的JSON文件"""
    print(f"\n{'='*60}")
    print(f"处理 {json_file} 和 {album}")
    print(f"{'='*60}")
    
    # 查找静态地图
    staticmaps = find_staticmaps_in_album(album)
    
    if not staticmaps:
        print(f"  ℹ️  {album} 中没有独立存放的静态地图")
        return True
    
    # 移动静态地图
    print(f"\n移动 {len(staticmaps)} 个静态地图...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        for sm in staticmaps:
            future = executor.submit(move_staticmap, sm, dry_run)
            futures.append(future)
        
        success_count = 0
        for future in as_completed(futures):
            if future.result():
                success_count += 1
        
        print(f"  成功移动 {success_count}/{len(staticmaps)} 个文件")
    
    # 更新JSON文件
    if success_count > 0:
        update_json_urls(json_file, album, staticmaps, dry_run)
    
    return True

def main():
    """主函数"""
    print("=== 最终静态地图迁移脚本 ===")
    print("将bar和dining分类的所有静态地图移动到商户主相册\n")
    
    # 定义要处理的文件和相册对
    tasks = [
        ('dining-dev.json', 'dining-image-dev'),
        ('dining.json', 'dining-image-prod'),
        ('bars-dev.json', 'bar-image-dev'),
        ('bars.json', 'bar-image-prod')
    ]
    
    # 检查是否为dry run模式
    dry_run = '--dry-run' in sys.argv
    if dry_run:
        print("⚠️  DRY RUN模式 - 只显示将要执行的操作，不会实际修改文件\n")
    
    # 处理每个任务
    for json_file, album in tasks:
        success = process_album_and_json(json_file, album, dry_run)
        if not success:
            print(f"\n❌ 处理 {json_file} 和 {album} 时出错")
    
    print(f"\n{'='*60}")
    print("✅ 所有任务完成！")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()