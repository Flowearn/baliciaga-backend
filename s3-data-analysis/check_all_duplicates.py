#!/usr/bin/env python3
import subprocess

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

# 定义环境
environments = ['dev', 'prod']

def count_files_in_directory(s3_path):
    """统计S3目录中的文件数量"""
    cmd = ['aws', 's3', 'ls', s3_path, '--recursive']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        lines = result.stdout.strip().split('\n')
        # 过滤掉空行和目录本身
        files = [line for line in lines if line.strip() and not line.endswith('/')]
        return len(files)
    return 0

print("# CCt#24: 重复目录内容检查报告\n")

for env in environments:
    print(f"\n## {env.upper()} 环境\n")
    base_path = f's3://baliciaga-database/bar-image-{env}/'
    
    for original, kebab in duplicate_pairs:
        original_path = base_path + original
        kebab_path = base_path + kebab
        
        original_count = count_files_in_directory(original_path)
        kebab_count = count_files_in_directory(kebab_path)
        
        print(f"**{original.rstrip('/')}**")
        print(f"  - 原始格式: {original_count} 个文件")
        print(f"  - Kebab格式: {kebab_count} 个文件")
        
        if original_count > 0 and kebab_count > 0:
            print(f"  - 状态: 两个目录都有内容（不同版本）")
        elif original_count > 0 and kebab_count == 0:
            print(f"  - 状态: 仅原始格式有内容")
        elif original_count == 0 and kebab_count > 0:
            print(f"  - 状态: 仅Kebab格式有内容")
        else:
            print(f"  - 状态: 两个目录都为空")
        print()