#!/usr/bin/env python3
import json
import subprocess

def sync_bars_merchants():
    """将Hippie Fish和Miss Fish从bars-dev.json同步到bars.json"""
    
    print("=== 同步bar分类的dev/prod数据一致性 ===\n")
    
    # 1. 读取bars-dev.json（使用fixed版本，因为它包含了正确的dining-image-dev路径）
    dev_file = '/Users/troy/开发文档/Baliciaga/backend/scripts/bars-dev_fixed.json'
    with open(dev_file, 'r', encoding='utf-8') as f:
        dev_data = json.load(f)
    
    # 2. 提取目标商户
    target_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    merchants_to_add = []
    
    for merchant in dev_data:
        if merchant.get('name', '') in target_merchants:
            merchants_to_add.append(merchant)
            print(f"找到商户: {merchant['name']}")
    
    if len(merchants_to_add) != 2:
        print(f"❌ 错误：期望找到2个商户，实际找到{len(merchants_to_add)}个")
        return
    
    # 3. 读取bars.json
    prod_file = '/Users/troy/开发文档/Baliciaga/backend/scripts/bars.json'
    with open(prod_file, 'r', encoding='utf-8') as f:
        prod_data = json.load(f)
    
    print(f"\n当前bars.json中有 {len(prod_data)} 个商户")
    
    # 4. 处理每个要添加的商户
    for merchant in merchants_to_add:
        # 深拷贝商户数据
        import copy
        new_merchant = copy.deepcopy(merchant)
        
        # 更新photos URLs
        updated_photos = 0
        for i, photo_url in enumerate(new_merchant.get('photos', [])):
            if 'dining-image-dev' in photo_url:
                new_merchant['photos'][i] = photo_url.replace('dining-image-dev', 'dining-image-prod')
                updated_photos += 1
        
        # 更新staticMapS3Url
        if 'staticMapS3Url' in new_merchant and 'dining-image-dev' in new_merchant['staticMapS3Url']:
            new_merchant['staticMapS3Url'] = new_merchant['staticMapS3Url'].replace('dining-image-dev', 'dining-image-prod')
            print(f"\n{new_merchant['name']}:")
            print(f"  - 更新了 {updated_photos} 个照片URL")
            print(f"  - 更新了静态地图URL")
        
        # 添加到prod数据
        prod_data.append(new_merchant)
    
    print(f"\n更新后bars.json中有 {len(prod_data)} 个商户")
    
    # 5. 保存更新后的文件
    output_file = prod_file.replace('.json', '_updated.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(prod_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n本地文件已保存: {output_file}")
    
    # 6. 上传到S3
    s3_path = 's3://baliciaga-database/data/bars.json'
    upload_cmd = ['aws', 's3', 'cp', output_file, s3_path]
    result = subprocess.run(upload_cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✅ 成功上传到S3: {s3_path}")
        
        # 7. 验证结果
        verify_sync(output_file)
    else:
        print(f"❌ 上传失败: {result.stderr}")

def verify_sync(json_file):
    """验证同步结果"""
    print("\n=== 验证同步结果 ===")
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    target_merchants = ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']
    
    for target in target_merchants:
        found = False
        for merchant in data:
            if merchant.get('name', '') == target:
                found = True
                # 检查URL
                prod_urls = 0
                dev_urls = 0
                
                for photo_url in merchant.get('photos', []):
                    if 'dining-image-prod' in photo_url:
                        prod_urls += 1
                    elif 'dining-image-dev' in photo_url:
                        dev_urls += 1
                
                static_url = merchant.get('staticMapS3Url', '')
                if 'dining-image-prod' in static_url:
                    prod_urls += 1
                elif 'dining-image-dev' in static_url:
                    dev_urls += 1
                
                print(f"\n{target}:")
                print(f"  ✅ 已添加到bars.json")
                print(f"  - dining-image-prod URLs: {prod_urls}")
                print(f"  - dining-image-dev URLs: {dev_urls}")
                
                if dev_urls == 0:
                    print(f"  ✅ 所有URL已正确更新为prod环境")
                else:
                    print(f"  ❌ 仍有{dev_urls}个URL指向dev环境")
                break
        
        if not found:
            print(f"\n{target}:")
            print(f"  ❌ 未找到")

def main():
    sync_bars_merchants()

if __name__ == "__main__":
    main()