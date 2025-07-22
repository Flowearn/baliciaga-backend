#!/usr/bin/env python3
import json
import os

def find_merchant_in_json(merchant_name, json_files_dir):
    """在所有JSON文件中查找商户"""
    results = []
    
    # 列出所有JSON文件
    json_files = [f for f in os.listdir(json_files_dir) if f.endswith('.json')]
    
    for json_file in json_files:
        filepath = os.path.join(json_files_dir, json_file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, list):
                for item in data:
                    if 'name' in item:
                        # 检查多种可能的匹配方式
                        item_name_lower = item['name'].lower()
                        merchant_lower = merchant_name.lower().replace('-', ' ')
                        
                        # 尝试不同的匹配策略
                        matches = [
                            merchant_lower in item_name_lower,
                            merchant_lower.replace(' and ', ' & ') in item_name_lower,
                            merchant_lower.replace(' ', '') in item_name_lower.replace(' ', ''),
                            # 特殊情况
                            ('longtime' in merchant_lower and 'longtime' in item_name_lower),
                            ('honeycomb' in merchant_lower and 'honeycomb' in item_name_lower),
                            ('m mason' in merchant_lower and 'mason' in item_name_lower),
                            ('luigi' in merchant_lower and 'luigi' in item_name_lower),
                            ('teamo' in merchant_lower and 'teamo' in item_name_lower),
                            ('la baracca' in merchant_lower and 'baracca' in item_name_lower),
                            ('karya' in merchant_lower and 'karya' in item_name_lower),
                            ('puco' in merchant_lower and 'puco' in item_name_lower),
                            ('setter' in merchant_lower and 'setter' in item_name_lower),
                        ]
                        
                        if any(matches):
                            results.append({
                                'json_file': json_file,
                                'name': item['name'],
                                'placeId': item.get('placeId', 'NO_PLACEID'),
                                'staticMapUrl': item.get('staticMapS3Url', '')
                            })
        except Exception as e:
            pass
    
    return results

# 失败的商户列表
failed_merchants = [
    ('teamo', ['dining-image-dev', 'dining-image-prod']),
    ('setter-coworking-private-offices', ['cowork-image-dev', 'cowork-image-prod']),
    ('puco-rooftop-coworking-space-eatery', ['cowork-image-dev', 'cowork-image-prod']),
    ('m-mason-bar-grill-canggu', ['dining-image-dev', 'dining-image-prod']),
    ('luigis-hot-pizza-canggu', ['dining-image-dev', 'dining-image-prod']),
    ('longtime-modern-asian-restaurant-bar-bali', ['bar-image-dev', 'bar-image-prod']),
    ('la-baracca', ['dining-image-dev', 'dining-image-prod']),
    ('karya-coworking-bali', ['cowork-image-dev', 'cowork-image-prod']),
    ('honeycomb-hookah-eatery', ['bar-image-dev', 'bar-image-prod']),
]

json_dir = '/Users/troy/开发文档/Baliciaga/backend/scripts'

print("查找失败商户的PlaceId...")
print("=" * 80)

for merchant, albums in failed_merchants:
    print(f"\n商户: {merchant}")
    print(f"需要处理的相册: {', '.join(albums)}")
    
    # 在JSON中查找
    results = find_merchant_in_json(merchant, json_dir)
    
    if results:
        print("找到的匹配:")
        for r in results:
            print(f"  - 文件: {r['json_file']}")
            print(f"    名称: {r['name']}")
            print(f"    PlaceId: {r['placeId']}")
            if r['staticMapUrl']:
                print(f"    静态地图URL: {r['staticMapUrl']}")
    else:
        print("  ❌ 未在任何JSON文件中找到")
    
    # 构建应该使用的路径
    if results and results[0]['placeId'] != 'NO_PLACEID':
        place_id = results[0]['placeId']
        for album in albums:
            expected_path = f"{album}/{merchant}_{place_id}/{merchant}_static.webp"
            print(f"  期望路径: {expected_path}")

print("\n" + "=" * 80)
print("分析完成")