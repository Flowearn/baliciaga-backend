#!/usr/bin/env python3
"""
修复JSON文件中截断的placeId URL
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

def fix_truncated_urls_in_json(json_file, album):
    """修复JSON文件中的截断URL"""
    print(f"\n修复 {json_file} 中的截断URL...")
    
    local_path = download_json_from_s3(json_file)
    if not local_path:
        return False
    
    with open(local_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 需要修复的URL模式
    truncated_patterns = [
        # 截断的placeId
        (r'/alma-tapas-bar-canggu_ChIJTTj8Ts9H0i0R2XwcfS/staticmap\.webp', '/alma-tapas-bar-canggu/staticmap.webp'),
        (r'/la-baracca.*_ChIJj0tR_mpH0i0RP5h/staticmap\.webp', '/la-baracca-bali-seminyak/staticmap.webp' if 'dev' in json_file else '/la-baracca/staticmap.webp'),
        (r'/lacalita-canggu_ChIJPZo4Unk40i0RxI/staticmap\.webp', '/lacalita-canggu/staticmap.webp'),
        (r'/luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ/staticmap\.webp', '/luigis-hot-pizza-canggu/staticmap.webp'),
        (r'/uma-garden-seminyak_ChIJXxe2rXNH0i0Rnt/staticmap\.webp', '/uma-garden-seminyak/staticmap.webp'),
        (r'/bali-beer-cycle_ChIJgfLsf1pF0i0RTDMRSpGD/staticmap\.webp', '/bali-beer-cycle/staticmap.webp'),
        (r'/black-sand-brewery_ChIJNzjyIBI50i0RpFdnd/staticmap\.webp', '/black-sand-brewery/staticmap.webp'),
        (r'/longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ/staticmap\.webp', '/longtime-modern-asian-restaurant-bar-bali/staticmap.webp'),
        (r'/potato-head-beach-club_ChIJ_XZL/staticmap\.webp', '/potato-head-beach-club/staticmap.webp'),
        (r'/patato-head-beach-club_ChIJ_XZL/staticmap\.webp', '/patato-head-beach-club/staticmap.webp'),
        (r'/single-fin-bali_ChIJ0aNPQ/staticmap\.webp', '/single-fin-bali/staticmap.webp'),
    ]
    
    updates = 0
    for item in data:
        old_url = item.get('staticMapS3Url', '')
        if old_url:
            new_url = old_url
            for pattern, replacement in truncated_patterns:
                if re.search(pattern, old_url):
                    # 保持原有的CloudFront域名和相册路径
                    base_url = old_url.split(album)[0]
                    new_url = base_url + album + replacement
                    item['staticMapS3Url'] = new_url
                    print(f"  ✅ 修复 {item['name']}: {old_url} -> {new_url}")
                    updates += 1
                    break
    
    if updates > 0:
        # 保存并上传
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        if upload_json_to_s3(local_path, json_file):
            print(f"  ✅ 成功更新 {json_file} 中的 {updates} 个URL")
            return True
    else:
        print(f"  ℹ️  {json_file} 中没有需要修复的截断URL")
    
    return True

def main():
    """主函数"""
    print("=== 修复JSON文件中的截断URL ===")
    
    tasks = [
        ('dining-dev.json', 'dining-image-dev'),
        ('dining.json', 'dining-image-prod'),
        ('bars-dev.json', 'bar-image-dev'),
        ('bars.json', 'bar-image-prod')
    ]
    
    for json_file, album in tasks:
        fix_truncated_urls_in_json(json_file, album)
    
    print("\n✅ 所有修复完成！")

if __name__ == "__main__":
    main()