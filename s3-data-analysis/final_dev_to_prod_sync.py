#!/usr/bin/env python3
"""
最终的dev到prod环境同步脚本
将dev环境的所有数据和资源作为事实源头，覆盖并更新prod环境
"""
import subprocess
import json
import sys
from datetime import datetime

def run_command(cmd, description):
    """执行命令并返回结果"""
    print(f"\n执行: {description}")
    print(f"命令: {' '.join(cmd)}")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ 失败: {result.stderr}")
        return False
    else:
        print(f"✅ 成功")
        if result.stdout:
            print(f"输出: {result.stdout[:200]}...")  # 只显示前200字符
        return True

def sync_s3_album(dev_album, prod_album):
    """同步S3相册从dev到prod"""
    print(f"\n{'='*60}")
    print(f"同步S3相册: {dev_album} -> {prod_album}")
    print(f"{'='*60}")
    
    cmd = [
        'aws', 's3', 'sync',
        f's3://baliciaga-database/{dev_album}/',
        f's3://baliciaga-database/{prod_album}/',
        '--delete'
    ]
    
    return run_command(cmd, f"同步 {dev_album} 到 {prod_album}")

def sync_json_file(dev_json, prod_json, dev_album, prod_album):
    """同步JSON文件从dev到prod，替换URL路径"""
    print(f"\n{'='*60}")
    print(f"同步JSON文件: {dev_json} -> {prod_json}")
    print(f"{'='*60}")
    
    # 下载dev JSON
    local_dev_path = f"/tmp/{dev_json}"
    cmd = ['aws', 's3', 'cp', f's3://baliciaga-database/data/{dev_json}', local_dev_path]
    if not run_command(cmd, f"下载 {dev_json}"):
        return False
    
    # 读取并修改内容
    print(f"\n修改JSON内容...")
    with open(local_dev_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 统计URL替换
    url_count = 0
    for item in data:
        # 替换photos数组中的URL
        if 'photos' in item and isinstance(item['photos'], list):
            for i, photo_url in enumerate(item['photos']):
                if f'/{dev_album}/' in photo_url:
                    item['photos'][i] = photo_url.replace(f'/{dev_album}/', f'/{prod_album}/')
                    url_count += 1
        
        # 替换staticMapS3Url
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if f'/{dev_album}/' in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace(f'/{dev_album}/', f'/{prod_album}/')
                url_count += 1
    
    print(f"  ✅ 替换了 {url_count} 个URL路径")
    
    # 保存修改后的文件
    local_prod_path = f"/tmp/{prod_json}"
    with open(local_prod_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # 上传到S3
    cmd = ['aws', 's3', 'cp', local_prod_path, f's3://baliciaga-database/data/{prod_json}']
    if not run_command(cmd, f"上传 {prod_json}"):
        return False
    
    # 清除CloudFront缓存
    cmd = [
        'aws', 'cloudfront', 'create-invalidation',
        '--distribution-id', 'E2OWVXNIWJXMFR',
        '--paths', f'/data/{prod_json}'
    ]
    run_command(cmd, f"清除 {prod_json} 的CloudFront缓存")
    
    return True

def sync_category(category_name, dev_album, prod_album, dev_json, prod_json):
    """同步一个完整的分类"""
    print(f"\n{'#'*70}")
    print(f"# 同步 {category_name} 分类")
    print(f"{'#'*70}")
    
    # A. 同步S3相册
    if not sync_s3_album(dev_album, prod_album):
        print(f"❌ {category_name} S3相册同步失败")
        return False
    
    # B, C, D. 同步JSON文件
    if not sync_json_file(dev_json, prod_json, dev_album, prod_album):
        print(f"❌ {category_name} JSON文件同步失败")
        return False
    
    print(f"\n✅ {category_name} 分类同步完成")
    return True

def main():
    """主函数"""
    print("="*70)
    print("最终DEV到PROD环境同步")
    print(f"执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    # 定义所有分类的同步任务
    sync_tasks = [
        {
            'name': 'cafe',
            'dev_album': 'cafe-image-dev',
            'prod_album': 'cafe-image-prod',
            'dev_json': 'cafes-dev.json',
            'prod_json': 'cafes.json'
        },
        {
            'name': 'dining',
            'dev_album': 'dining-image-dev',
            'prod_album': 'dining-image-prod',
            'dev_json': 'dining-dev.json',
            'prod_json': 'dining.json'
        },
        {
            'name': 'bar',
            'dev_album': 'bar-image-dev',
            'prod_album': 'bar-image-prod',
            'dev_json': 'bars-dev.json',
            'prod_json': 'bars.json'
        },
        {
            'name': 'cowork',
            'dev_album': 'cowork-image-dev',
            'prod_album': 'cowork-image-prod',
            'dev_json': 'cowork-dev.json',
            'prod_json': 'cowork.json'
        }
    ]
    
    # 执行所有同步任务
    success_count = 0
    for task in sync_tasks:
        if sync_category(
            task['name'],
            task['dev_album'],
            task['prod_album'],
            task['dev_json'],
            task['prod_json']
        ):
            success_count += 1
    
    # 最终报告
    print("\n" + "="*70)
    print("最终报告")
    print("="*70)
    print(f"\n同步结果: {success_count}/{len(sync_tasks)} 个分类成功同步")
    
    if success_count == len(sync_tasks):
        print("\n✅ 所有分类同步成功！")
        print("dev和prod环境的数据和S3资源已达到完全的镜像同步。")
    else:
        print("\n❌ 部分分类同步失败，请检查错误日志。")
        sys.exit(1)

if __name__ == "__main__":
    main()