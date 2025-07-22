#!/usr/bin/env python3
import json
import subprocess

def fix_cowork_prod():
    """修复cowork prod环境的静态地图URL"""
    
    print("=== 修复cowork prod环境 ===")
    
    # 读取cowork.json
    with open('/Users/troy/开发文档/Baliciaga/backend/scripts/cowork.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    
    for merchant in data:
        merchant_name = merchant.get('name', 'Unknown')
        current_url = merchant.get('staticmap', '')
        
        if current_url and '.png' in current_url:
            # 需要更新为正确的CloudFront域名和webp格式
            # 从 https://dyyme2yybmi4j.cloudfront.net/cowork-image-prod/b-work-bali/staticmap.png
            # 到 https://d2cmxnft4myi1k.cloudfront.net/cowork-image-prod/b-work-bali/staticmap.webp
            
            new_url = current_url.replace('dyyme2yybmi4j.cloudfront.net', 'd2cmxnft4myi1k.cloudfront.net')
            new_url = new_url.replace('.png', '.webp')
            
            merchant['staticmap'] = new_url
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
            print("✅ 成功上传到S3")
        else:
            print(f"❌ 上传失败: {result.stderr}")
    else:
        print("\n无需更新")

if __name__ == "__main__":
    fix_cowork_prod()