#!/usr/bin/env python3
import subprocess
import re

def get_s3_directories_raw(s3_path):
    """获取S3路径下的所有子目录（保留原始格式）"""
    try:
        cmd = ['aws', 's3', 'ls', s3_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            directories = []
            for line in result.stdout.strip().split('\n'):
                if line.strip() and 'PRE' in line:
                    # 提取PRE之后的所有内容作为目录名
                    parts = line.split('PRE', 1)
                    if len(parts) == 2:
                        dir_name = parts[1].strip()
                        directories.append(dir_name)
            return directories
        else:
            print(f"Error accessing {s3_path}: {result.stderr}")
            return []
    except Exception as e:
        print(f"Exception accessing {s3_path}: {str(e)}")
        return []

def normalize_for_comparison(name):
    """标准化名称用于比较（去除Google Place ID和特殊字符）"""
    # 移除尾部的斜杠
    name = name.rstrip('/')
    # 移除Google Place ID
    name = re.sub(r'_ChIJ[a-zA-Z0-9_-]+$', '', name)
    # 转换为小写并替换所有非字母数字字符为短横线
    normalized = re.sub(r'[^a-z0-9]+', '-', name.lower())
    # 移除首尾的短横线
    normalized = normalized.strip('-')
    return normalized

def analyze_directory_patterns(s3_path):
    """分析目录命名模式并找出潜在重复"""
    directories = get_s3_directories_raw(s3_path)
    
    # 分类目录
    kebab_case_dirs = []  # 纯小写+短横线
    mixed_case_dirs = []  # 包含空格或大写
    
    # 用于检测重复的字典
    normalized_map = {}
    
    for dir_name in directories:
        # 去除Google Place ID进行格式检查
        clean_name = re.sub(r'_ChIJ[a-zA-Z0-9_-]+/$', '', dir_name).rstrip('/')
        
        # 检查是否包含空格或大写字母
        if ' ' in clean_name or any(c.isupper() for c in clean_name) or '|' in clean_name or '&' in clean_name:
            mixed_case_dirs.append(dir_name)
        else:
            kebab_case_dirs.append(dir_name)
        
        # 标准化并记录用于查找重复
        normalized = normalize_for_comparison(dir_name)
        if normalized not in normalized_map:
            normalized_map[normalized] = []
        normalized_map[normalized].append(dir_name)
    
    # 找出重复
    duplicates = []
    for normalized, variants in normalized_map.items():
        if len(variants) > 1:
            # 检查是否真的是命名格式不同导致的重复
            has_mixed = any(' ' in v or any(c.isupper() for c in v) for v in variants)
            has_kebab = any(not (' ' in v or any(c.isupper() for c in v)) for v in variants)
            
            # 只报告同时有混合格式和kebab格式的情况
            if has_mixed and has_kebab:
                duplicates.append(variants)
    
    return {
        'total': len(directories),
        'kebab_case': kebab_case_dirs,
        'mixed_case': mixed_case_dirs,
        'duplicates': duplicates
    }

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
    
    print("## 目录命名分析\n")
    
    for s3_path in s3_paths:
        print(f"检查 {s3_path}...")
        analysis = analyze_directory_patterns(s3_path)
        
        print(f"  总目录数: {analysis['total']}")
        print(f"  标准格式 (kebab-case): {len(analysis['kebab_case'])}")
        print(f"  混合格式 (含空格/大写): {len(analysis['mixed_case'])}")
        
        if analysis['mixed_case']:
            print(f"  混合格式目录示例:")
            for dir_name in analysis['mixed_case'][:3]:
                print(f"    - {dir_name}")
            if len(analysis['mixed_case']) > 3:
                print(f"    ... 还有 {len(analysis['mixed_case']) - 3} 个")
        
        if analysis['duplicates']:
            print(f"  发现 {len(analysis['duplicates'])} 组因命名格式不同的潜在重复")
            findings.append({
                'path': s3_path,
                'duplicates': analysis['duplicates']
            })
        
        print()
    
    # 生成最终报告
    print("\n## 调查报告总结\n")
    
    if findings:
        print("| 父相册路径 | 发现的潜在重复目录对 |")
        print("| :--- | :--- |")
        
        for finding in findings:
            path = finding['path']
            for dup_group in finding['duplicates']:
                # 只显示真正因为命名格式不同的重复
                print(f"| `{path}` | `{dup_group}` |")
    else:
        print("未发现因命名格式不同（大小写/空格 vs kebab-case）而导致的重复目录。")
        print("\n注：虽然存在一些目录有多个变体（如带/不带Google Place ID），但它们不属于本次调查的命名格式问题范围。")

if __name__ == "__main__":
    main()