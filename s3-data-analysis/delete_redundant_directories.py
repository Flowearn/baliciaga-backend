#!/usr/bin/env python3
import subprocess
import time

# 定义要删除的原始格式目录
directories_to_delete = [
    'Honeycomb Hookah & Eatery/',
    'LONGTIME | Modern Asian Restaurant & Bar Bali/',
    'PLATONIC/',
    'The Shady Fox/',
    'bali beer cycle/',
    'barn gastropub/',
    'black sand brewery/',
    'shelter restaurant/'
]

# 定义环境
environments = [
    {
        'name': 'dev',
        's3_base': 's3://baliciaga-database/bar-image-dev/'
    },
    {
        'name': 'prod',
        's3_base': 's3://baliciaga-database/bar-image-prod/'
    }
]

def delete_s3_directory(s3_path):
    """删除S3目录及其所有内容"""
    print(f"\n删除目录: {s3_path}")
    
    # 首先列出目录内容以确认
    list_cmd = ['aws', 's3', 'ls', s3_path, '--recursive']
    list_result = subprocess.run(list_cmd, capture_output=True, text=True)
    
    if list_result.returncode == 0:
        files = list_result.stdout.strip().split('\n')
        file_count = len([f for f in files if f.strip()])
        print(f"  将删除 {file_count} 个文件")
        
        # 执行删除
        delete_cmd = ['aws', 's3', 'rm', s3_path, '--recursive']
        delete_result = subprocess.run(delete_cmd, capture_output=True, text=True)
        
        if delete_result.returncode == 0:
            print(f"  ✓ 成功删除")
            return True, file_count
        else:
            print(f"  ✗ 删除失败: {delete_result.stderr}")
            return False, 0
    else:
        print(f"  ✗ 无法访问目录: {list_result.stderr}")
        return False, 0

def main():
    print("# CCt#24: 删除Bar分类冗余目录\n")
    print("开始时间:", time.strftime("%Y-%m-%d %H:%M:%S"))
    
    total_deleted_files = 0
    successful_deletions = 0
    failed_deletions = 0
    
    for env in environments:
        print(f"\n## 处理 {env['name'].upper()} 环境")
        print("=" * 60)
        
        env_deleted_files = 0
        
        for directory in directories_to_delete:
            s3_path = env['s3_base'] + directory
            success, file_count = delete_s3_directory(s3_path)
            
            if success:
                successful_deletions += 1
                env_deleted_files += file_count
                total_deleted_files += file_count
            else:
                failed_deletions += 1
        
        print(f"\n{env['name'].upper()}环境小计: 删除了 {env_deleted_files} 个文件")
    
    # 生成最终报告
    print("\n" + "=" * 60)
    print("# 最终统计")
    print("=" * 60)
    print(f"成功删除的目录数: {successful_deletions}")
    print(f"失败的目录数: {failed_deletions}")
    print(f"总共删除的文件数: {total_deleted_files}")
    print(f"\n完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()