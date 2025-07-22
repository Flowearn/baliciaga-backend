#!/usr/bin/env python3
import subprocess
import re
from collections import defaultdict

def normalize_name(name):
    """将目录名标准化为小写+短横线格式"""
    # 移除尾部的斜杠
    name = name.rstrip('/')
    # 移除Google Place ID（如果有）
    name = re.sub(r'_ChIJ[a-zA-Z0-9_-]+$', '', name)
    # 转换为小写并替换空格和特殊字符为短横线
    normalized = name.lower().replace(' ', '-').replace('_', '-')
    # 移除多余的短横线
    normalized = re.sub(r'-+', '-', normalized)
    return normalized

def get_s3_directories(s3_path):
    """获取S3路径下的所有子目录"""
    try:
        cmd = ['aws', 's3', 'ls', s3_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            directories = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 2 and parts[0] == 'PRE':
                        directories.append(parts[1])
            return directories
        else:
            print(f"Error accessing {s3_path}: {result.stderr}")
            return []
    except Exception as e:
        print(f"Exception accessing {s3_path}: {str(e)}")
        return []

def find_duplicates_in_directory(s3_path, directories):
    """在一个目录中查找潜在的重复"""
    duplicates = []
    normalized_map = defaultdict(list)
    
    # 按标准化名称分组
    for dir_name in directories:
        normalized = normalize_name(dir_name)
        normalized_map[normalized].append(dir_name)
    
    # 找出有多个变体的名称
    for normalized, variants in normalized_map.items():
        if len(variants) > 1:
            duplicates.append(variants)
    
    return duplicates

def main():
    # 要检查的8个S3路径
    s3_paths = [
        's3://baliciaga-database/cafe-image-dev/',
        's3://baliciaga-database/cafe-image-prod/',
        's3://baliciaga-database/dining-image-dev/',
        's3://baliciaga-database/dining-image-prod/',
        's3://baliciaga-database/bar-image-dev/',
        's3://baliciaga-database/bar-image-prod/',
        's3://baliciaga-database/cowork-image-dev/',
        's3://baliciaga-database/cowork-image-prod/'
    ]
    
    findings = []
    
    for s3_path in s3_paths:
        print(f"Checking {s3_path}...")
        directories = get_s3_directories(s3_path)
        
        if directories:
            # 分析目录名格式
            kebab_case_dirs = []
            mixed_case_dirs = []
            
            for dir_name in directories:
                # 移除Google Place ID进行分析
                clean_name = re.sub(r'_ChIJ[a-zA-Z0-9_-]+/$', '', dir_name).rstrip('/')
                
                if ' ' in clean_name or any(c.isupper() for c in clean_name):
                    mixed_case_dirs.append(dir_name)
                else:
                    kebab_case_dirs.append(dir_name)
            
            # 查找重复
            duplicates = find_duplicates_in_directory(s3_path, directories)
            
            if duplicates:
                findings.append({
                    'path': s3_path,
                    'duplicates': duplicates,
                    'mixed_case_count': len(mixed_case_dirs),
                    'kebab_case_count': len(kebab_case_dirs)
                })
            
            # 显示统计
            print(f"  Total directories: {len(directories)}")
            print(f"  Mixed case/spaces: {len(mixed_case_dirs)}")
            print(f"  Kebab case: {len(kebab_case_dirs)}")
            if duplicates:
                print(f"  Found {len(duplicates)} potential duplicate groups")
            print()
    
    # 生成报告
    print("\n## 调查报告\n")
    
    if findings:
        print("| 父相册路径 | 发现的潜在重复目录对 |")
        print("| :--- | :--- |")
        
        for finding in findings:
            path = finding['path']
            for dup_group in finding['duplicates']:
                print(f"| `{path}` | `{dup_group}` |")
    else:
        print("未发现任何潜在的重复目录。")
    
    # 显示详细统计
    print("\n## 详细统计\n")
    for s3_path in s3_paths:
        directories = get_s3_directories(s3_path)
        if directories:
            mixed_dirs = [d for d in directories if ' ' in d or any(c.isupper() for c in re.sub(r'_ChIJ[a-zA-Z0-9_-]+/$', '', d))]
            if mixed_dirs:
                print(f"\n{s3_path} 中包含空格或大写字母的目录:")
                for d in mixed_dirs[:5]:  # 只显示前5个
                    print(f"  - {d}")
                if len(mixed_dirs) > 5:
                    print(f"  ... 还有 {len(mixed_dirs) - 5} 个")

if __name__ == "__main__":
    main()