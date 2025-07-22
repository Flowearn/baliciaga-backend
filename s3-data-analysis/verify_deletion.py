#!/usr/bin/env python3
import subprocess

# 验证这些目录是否已被删除
directories_to_check = [
    'Honeycomb Hookah & Eatery/',
    'LONGTIME | Modern Asian Restaurant & Bar Bali/',
    'PLATONIC/',
    'The Shady Fox/',
    'bali beer cycle/',
    'barn gastropub/',
    'black sand brewery/',
    'shelter restaurant/'
]

environments = ['dev', 'prod']

print("# 验证删除结果\n")

for env in environments:
    print(f"## {env.upper()} 环境")
    base_path = f's3://baliciaga-database/bar-image-{env}/'
    
    all_deleted = True
    
    for directory in directories_to_check:
        s3_path = base_path + directory
        
        # 尝试列出目录
        cmd = ['aws', 's3', 'ls', s3_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and result.stdout.strip():
            print(f"  ✗ {directory} - 仍然存在")
            all_deleted = False
        else:
            print(f"  ✓ {directory} - 已成功删除")
    
    if all_deleted:
        print(f"\n  结果: 所有原始格式目录已成功删除 ✓")
    else:
        print(f"\n  结果: 部分目录删除失败 ✗")
    
    print()

# 再次检查当前bar-image目录的状态
print("\n## 当前目录列表（应该只有kebab-case格式）\n")

for env in environments:
    print(f"### {env.upper()}环境剩余目录数:")
    base_path = f's3://baliciaga-database/bar-image-{env}/'
    
    cmd = ['aws', 's3', 'ls', base_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        directories = [line.split('PRE', 1)[1].strip() for line in result.stdout.strip().split('\n') if 'PRE' in line]
        
        # 检查是否还有非kebab-case格式的目录
        non_kebab = [d for d in directories if ' ' in d or any(c.isupper() for c in d) or '|' in d]
        
        print(f"  总目录数: {len(directories)}")
        if non_kebab:
            print(f"  仍有非标准格式目录: {len(non_kebab)}")
            for d in non_kebab[:3]:
                print(f"    - {d}")
        else:
            print(f"  ✓ 所有目录都是kebab-case格式")