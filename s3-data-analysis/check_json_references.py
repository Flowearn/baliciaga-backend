#!/usr/bin/env python3
import subprocess
import json

# 定义要处理的重复目录对
duplicate_pairs = [
    ('Honeycomb Hookah & Eatery/', 'honeycomb-hookah-eatery/'),
    ('LONGTIME | Modern Asian Restaurant & Bar Bali/', 'longtime-modern-asian-restaurant-bar-bali/'),
    ('PLATONIC/', 'platonic/'),
    ('The Shady Fox/', 'the-shady-fox/'),
    ('bali beer cycle/', 'bali-beer-cycle/'),
    ('barn gastropub/', 'barn-gastropub/'),
    ('black sand brewery/', 'black-sand-brewery/'),
    ('shelter restaurant/', 'shelter-restaurant/')
]

# 下载JSON文件
print("下载JSON文件...")
subprocess.run(['aws', 's3', 'cp', 's3://baliciaga-database/data/bars-dev.json', 'bars-dev.json'], check=True)
subprocess.run(['aws', 's3', 'cp', 's3://baliciaga-database/data/bars.json', 'bars.json'], check=True)

def check_json_references(json_file, duplicate_pairs):
    """检查JSON文件中的引用"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    references = {
        'original': {},
        'kebab': {}
    }
    
    for item in data:
        # 检查photos数组
        if 'photos' in item and item['photos']:
            for photo_url in item['photos']:
                for original, kebab in duplicate_pairs:
                    if f"/{original}" in photo_url:
                        references['original'][original] = references['original'].get(original, 0) + 1
                    elif f"/{kebab}" in photo_url:
                        references['kebab'][kebab] = references['kebab'].get(kebab, 0) + 1
        
        # 检查staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            for original, kebab in duplicate_pairs:
                if f"/{original}" in item['staticMapS3Url']:
                    references['original'][original] = references['original'].get(original, 0) + 1
                elif f"/{kebab}" in item['staticMapS3Url']:
                    references['kebab'][kebab] = references['kebab'].get(kebab, 0) + 1
    
    return references

print("\n# JSON文件引用分析\n")

for env, json_file in [('DEV', 'bars-dev.json'), ('PROD', 'bars.json')]:
    print(f"\n## {env} 环境 ({json_file})\n")
    refs = check_json_references(json_file, duplicate_pairs)
    
    print("### 使用原始格式（含空格/大写）的引用:")
    if refs['original']:
        for dir_name, count in refs['original'].items():
            print(f"  - {dir_name.rstrip('/')}: {count} 个引用")
    else:
        print("  无")
    
    print("\n### 使用Kebab格式的引用:")
    if refs['kebab']:
        for dir_name, count in refs['kebab'].items():
            print(f"  - {dir_name.rstrip('/')}: {count} 个引用")
    else:
        print("  无")

# 清理临时文件
import os
os.remove('bars-dev.json')
os.remove('bars.json')