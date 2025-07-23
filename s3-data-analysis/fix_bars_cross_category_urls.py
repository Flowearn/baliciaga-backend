#!/usr/bin/env python3
import json
import subprocess

def fix_bars_dev_urls():
    """修复bars-dev.json中Hippie Fish和Miss Fish的图片路径"""
    
    print("=== 修复bars-dev.json中跨分类商户的图片路径 ===\n")
    
    # 读取bars-dev.json
    json_path = '/Users/troy/开发文档/Baliciaga/backend/scripts/bars-dev.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 需要修复的商户
    cross_category_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    
    updated_count = 0
    
    for merchant in data:
        merchant_name = merchant.get('name', '')
        
        if merchant_name in cross_category_merchants:
            print(f"处理商户: {merchant_name}")
            
            # 修复photos URLs
            photos_updated = 0
            for i, photo_url in enumerate(merchant.get('photos', [])):
                if 'bar-image-dev' in photo_url:
                    old_url = photo_url
                    new_url = photo_url.replace('bar-image-dev', 'dining-image-dev')
                    merchant['photos'][i] = new_url
                    photos_updated += 1
                    if photos_updated <= 3:  # 只显示前3个
                        print(f"  照片{i+1}: bar-image-dev → dining-image-dev")
            
            # 修复staticMapS3Url
            static_url = merchant.get('staticMapS3Url', '')
            if static_url and 'bar-image-dev' in static_url:
                old_static = static_url
                new_static = static_url.replace('bar-image-dev', 'dining-image-dev')
                merchant['staticMapS3Url'] = new_static
                print(f"  静态地图: bar-image-dev → dining-image-dev")
            
            if photos_updated > 0:
                print(f"  ✅ 更新了 {photos_updated} 个照片URL")
                updated_count += 1
            
            print()
    
    if updated_count > 0:
        # 保存更新后的文件
        output_path = json_path.replace('.json', '_fixed.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ 成功更新 {updated_count} 个商户")
        print(f"本地文件已保存: {output_path}")
        
        # 上传到S3
        s3_path = 's3://baliciaga-database/data/bars-dev.json'
        upload_cmd = ['aws', 's3', 'cp', output_path, s3_path]
        result = subprocess.run(upload_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 成功上传到S3: {s3_path}")
            
            # 验证修复
            verify_fixes(output_path)
        else:
            print(f"❌ 上传失败: {result.stderr}")
    else:
        print("\n未找到需要修复的商户")

def verify_fixes(json_path):
    """验证修复结果"""
    print("\n=== 验证修复结果 ===")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cross_category_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    
    for merchant in data:
        merchant_name = merchant.get('name', '')
        
        if merchant_name in cross_category_merchants:
            print(f"\n{merchant_name}:")
            
            # 检查是否还有bar-image-dev的URL
            bar_urls = 0
            dining_urls = 0
            
            for photo_url in merchant.get('photos', []):
                if 'bar-image-dev' in photo_url:
                    bar_urls += 1
                elif 'dining-image-dev' in photo_url:
                    dining_urls += 1
            
            static_url = merchant.get('staticMapS3Url', '')
            if 'dining-image-dev' in static_url:
                dining_urls += 1
            elif 'bar-image-dev' in static_url:
                bar_urls += 1
            
            print(f"  dining-image-dev URLs: {dining_urls}")
            print(f"  bar-image-dev URLs: {bar_urls}")
            
            if bar_urls == 0:
                print(f"  ✅ 所有URL已正确指向dining-image-dev")
            else:
                print(f"  ❌ 仍有{bar_urls}个URL指向bar-image-dev")

def main():
    fix_bars_dev_urls()

if __name__ == "__main__":
    main()