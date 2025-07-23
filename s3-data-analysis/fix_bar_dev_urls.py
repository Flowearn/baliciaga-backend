#!/usr/bin/env python3
import json
import subprocess
import re

def extract_merchant_directory_from_photo(photo_url):
    """从photo URL提取商户目录名"""
    # 匹配模式: bar-image/xxx/photo_y.webp
    match = re.search(r'/bar-image/([^/]+)/photo_', photo_url)
    if match:
        return match.group(1)
    return None

def main():
    print("修正bars-dev.json中的staticMapS3Url...")
    
    # 读取文件
    with open('bars-dev-check.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    for item in data:
        name = item.get('name', 'Unknown')
        old_url = item.get('staticMapS3Url', '')
        
        # 从photos数组提取商户目录
        merchant_dir = None
        if 'photos' in item and item['photos']:
            merchant_dir = extract_merchant_directory_from_photo(item['photos'][0])
        
        if merchant_dir:
            # 构建新URL
            new_url = f"https://dyyme2yybmi4j.cloudfront.net/bar-image-dev/{merchant_dir}/staticmap.png"
            
            if old_url != new_url:
                print(f"\n更新: {name}")
                print(f"  目录: {merchant_dir}")
                print(f"  新URL: {new_url}")
                
                item['staticMapS3Url'] = new_url
                updated_count += 1
    
    print(f"\n总共更新了 {updated_count} 个商户的URL")
    
    # 保存
    with open('bars-dev-fixed.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # 上传到S3
    print("\n上传到S3...")
    cmd = ['aws', 's3', 'cp', 'bars-dev-fixed.json', 's3://baliciaga-database/data/bars-dev.json']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print("✅ 上传成功！")
        return True
    else:
        print(f"❌ 上传失败: {result.stderr}")
        return False

if __name__ == "__main__":
    main()