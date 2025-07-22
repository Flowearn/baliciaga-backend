#!/usr/bin/env python3
import json
import subprocess

def fix_cowork_prod():
    """修复cowork prod环境的静态地图URL"""
    
    print("=== 修复cowork prod环境静态地图URL ===")
    
    # 读取cowork.json
    with open('/Users/troy/开发文档/Baliciaga/backend/scripts/cowork.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    for merchant in data:
        merchant_name = merchant.get('name', 'Unknown')
        current_url = merchant.get('staticMapS3Url', '')
        
        if current_url:
            needs_update = False
            new_url = current_url
            
            # 1. 更新CloudFront域名
            if 'dyyme2yybmi4j.cloudfront.net' in current_url:
                new_url = new_url.replace('dyyme2yybmi4j.cloudfront.net', 'd2cmxnft4myi1k.cloudfront.net')
                needs_update = True
            
            # 2. 更新文件格式从PNG到WebP
            if '.png' in new_url:
                new_url = new_url.replace('.png', '.webp')
                needs_update = True
            
            if needs_update:
                merchant['staticMapS3Url'] = new_url
                updated_count += 1
                
                print(f"\n商户: {merchant_name}")
                print(f"  旧URL: {current_url}")
                print(f"  新URL: {new_url}")
    
    if updated_count > 0:
        # 保存更新后的文件
        output_file = '/Users/troy/开发文档/Baliciaga/backend/scripts/cowork_updated.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ 更新了 {updated_count} 个商户的URL")
        print(f"文件已保存: {output_file}")
        
        # 上传到S3
        upload_cmd = ['aws', 's3', 'cp', output_file, 's3://baliciaga-database/data/cowork.json']
        result = subprocess.run(upload_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ 成功上传到S3: s3://baliciaga-database/data/cowork.json")
        else:
            print(f"❌ 上传失败: {result.stderr}")
    else:
        print("\n无需更新任何URL")

if __name__ == "__main__":
    fix_cowork_prod()