#!/usr/bin/env python3
import json

def verify_staticmap_urls(json_file):
    """验证JSON文件中的staticMapS3Url格式"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"检查 {json_file} 中的staticMapS3Url...")
    print(f"商户总数: {len(data)}\n")
    
    correct_count = 0
    incorrect_urls = []
    
    for item in data:
        name = item.get('name', 'Unknown')
        url = item.get('staticMapS3Url', '')
        
        # 检查URL格式是否正确
        if url and '/staticmap.png' in url and '_ChIJ' not in url:
            correct_count += 1
        else:
            incorrect_urls.append({
                'name': name,
                'url': url
            })
    
    print(f"✅ 正确格式的URL: {correct_count} 个")
    
    if incorrect_urls:
        print(f"\n❌ 需要修正的URL: {len(incorrect_urls)} 个")
        for item in incorrect_urls:
            print(f"\n商户: {item['name']}")
            print(f"URL: {item['url']}")
    else:
        print("\n✨ 所有URL格式都正确！")
    
    # 检查一些示例
    print("\n示例URL:")
    for i, item in enumerate(data[:3]):
        print(f"{i+1}. {item.get('name')}")
        print(f"   {item.get('staticMapS3Url')}")

# 执行验证
verify_staticmap_urls('bars-dev-check.json')