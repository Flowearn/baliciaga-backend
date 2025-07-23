#!/usr/bin/env python3
import json
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

def extract_s3_path(url):
    """从URL中提取S3路径"""
    match = re.search(r'cloudfront\.net/(.+?)$', url)
    if match:
        return match.group(1)
    return None

def copy_s3_file(source, destination):
    """执行单个S3复制操作"""
    try:
        cmd = ['aws', 's3', 'cp', source, destination]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return f"Success: {source} -> {destination}"
        else:
            return f"Failed: {source} -> {destination}: {result.stderr}"
    except Exception as e:
        return f"Error: {source} -> {destination}: {str(e)}"

def main():
    # 读取当前的JSON文件
    with open('current-cafes-dev.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 收集所有静态地图URL
    static_map_urls = []
    for cafe in data:
        if 'staticMapS3Url' in cafe and cafe['staticMapS3Url']:
            if '/image-v2/' in cafe['staticMapS3Url']:
                static_map_urls.append(cafe['staticMapS3Url'])
    
    print(f"发现 {len(static_map_urls)} 个静态地图URL需要迁移")
    
    # 准备复制任务
    copy_tasks = []
    for url in static_map_urls:
        s3_path = extract_s3_path(url)
        if s3_path:
            # 从 image-v2/xxx 转换为 cafe-image-dev/xxx 和 cafe-image-prod/xxx
            new_path_dev = s3_path.replace('image-v2/', 'cafe-image-dev/')
            new_path_prod = s3_path.replace('image-v2/', 'cafe-image-prod/')
            
            source = f"s3://baliciaga-database/{s3_path}"
            dest_dev = f"s3://baliciaga-database/{new_path_dev}"
            dest_prod = f"s3://baliciaga-database/{new_path_prod}"
            
            copy_tasks.append((source, dest_dev))
            copy_tasks.append((source, dest_prod))
    
    print(f"总计需要执行 {len(copy_tasks)} 个复制操作")
    
    # 使用线程池并行执行
    print("开始并行迁移（5个并发线程）...")
    
    completed = 0
    failed = 0
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        # 提交所有任务
        future_to_task = {executor.submit(copy_s3_file, task[0], task[1]): task 
                          for task in copy_tasks}
        
        # 处理完成的任务
        for future in as_completed(future_to_task):
            completed += 1
            result = future.result()
            
            if "Failed" in result or "Error" in result:
                failed += 1
                print(f"[{completed}/{len(copy_tasks)}] {result}")
            else:
                if completed % 5 == 0 or completed == len(copy_tasks):
                    print(f"进度: {completed}/{len(copy_tasks)} ({completed/len(copy_tasks)*100:.1f}%)")
    
    print(f"\n迁移完成！")
    print(f"成功: {completed - failed}")
    print(f"失败: {failed}")
    
    # 生成迁移报告
    with open('static_map_migration.txt', 'w') as f:
        f.write(f"静态地图迁移报告\n")
        f.write(f"================\n")
        f.write(f"总计迁移: {len(static_map_urls)} 个静态地图\n")
        f.write(f"执行操作: {len(copy_tasks)} 个复制操作\n")
        f.write(f"成功: {completed - failed}\n")
        f.write(f"失败: {failed}\n")

if __name__ == "__main__":
    main()