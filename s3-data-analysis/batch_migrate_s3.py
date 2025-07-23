#!/usr/bin/env python3
import json
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

def extract_s3_path(cloudfront_url):
    """从CloudFront URL提取S3路径"""
    match = re.search(r'cloudfront\.net/(.+?)$', cloudfront_url)
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
    # 读取JSON文件
    with open('backup/cafes.json', 'r') as f:
        cafes_data = json.load(f)
    
    # 收集所有唯一的图片路径
    unique_paths = set()
    for cafe in cafes_data:
        if 'photos' in cafe and cafe['photos']:
            for photo_url in cafe['photos']:
                s3_path = extract_s3_path(photo_url)
                if s3_path and s3_path.startswith('image-v2/'):
                    unique_paths.add(s3_path)
    
    print(f"Found {len(unique_paths)} unique image paths to migrate")
    
    # 准备复制任务
    copy_tasks = []
    for path in sorted(unique_paths):
        # 从 image-v2/xxx 转换为 cafe-image-dev/xxx 和 cafe-image-prod/xxx
        new_path_dev = path.replace('image-v2/', 'cafe-image-dev/')
        new_path_prod = path.replace('image-v2/', 'cafe-image-prod/')
        
        source = f"s3://baliciaga-database/{path}"
        dest_dev = f"s3://baliciaga-database/{new_path_dev}"
        dest_prod = f"s3://baliciaga-database/{new_path_prod}"
        
        copy_tasks.append((source, dest_dev))
        copy_tasks.append((source, dest_prod))
    
    print(f"Total copy operations: {len(copy_tasks)}")
    print("Starting parallel migration with 10 concurrent threads...")
    
    # 使用线程池并行执行
    completed = 0
    failed = 0
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=10) as executor:
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
                # 每10个任务打印一次进度
                if completed % 10 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed
                    remaining = (len(copy_tasks) - completed) / rate
                    print(f"Progress: {completed}/{len(copy_tasks)} ({completed/len(copy_tasks)*100:.1f}%) - "
                          f"Rate: {rate:.1f} files/sec - ETA: {remaining:.1f} seconds")
    
    elapsed_time = time.time() - start_time
    print(f"\nMigration completed!")
    print(f"Total time: {elapsed_time:.1f} seconds")
    print(f"Success: {completed - failed}")
    print(f"Failed: {failed}")
    print(f"Average rate: {completed/elapsed_time:.1f} files/second")

if __name__ == "__main__":
    main()