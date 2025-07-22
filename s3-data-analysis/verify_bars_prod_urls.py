#!/usr/bin/env python3
import subprocess
import json

def verify_url_accessible(url):
    """验证URL是否可访问"""
    cmd = ['curl', '-I', '-s', url]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return 'HTTP/2 200' in result.stdout or 'HTTP/1.1 200' in result.stdout

def verify_bars_prod():
    """验证bars.json中新添加商户的URL可访问性"""
    
    print("=== 验证bars.json中新添加商户的URL ===\n")
    
    # 读取更新后的bars.json
    with open('/Users/troy/开发文档/Baliciaga/backend/scripts/bars_updated.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    target_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    
    for merchant in data:
        if merchant.get('name', '') in target_merchants:
            print(f"{merchant['name']}:")
            
            # 验证第一张照片
            if merchant.get('photos'):
                first_photo = merchant['photos'][0]
                accessible = verify_url_accessible(first_photo)
                print(f"  第一张照片: {'✅' if accessible else '❌'} {first_photo.split('/')[-2]}/photo_a.webp")
            
            # 验证静态地图
            static_url = merchant.get('staticMapS3Url', '')
            if static_url:
                accessible = verify_url_accessible(static_url)
                print(f"  静态地图: {'✅' if accessible else '❌'} {static_url.split('/')[-2]}/staticmap.webp")
            
            print()

if __name__ == "__main__":
    verify_bars_prod()