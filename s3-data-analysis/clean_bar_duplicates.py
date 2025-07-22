#!/usr/bin/env python3
import subprocess
import json
import os

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
environments = [
    {
        'name': 'dev',
        's3_path': 's3://baliciaga-database/bar-image-dev/',
        'json_file': 'bars-dev.json',
        'json_s3_path': 's3://baliciaga-database/data/bars-dev.json'
    },
    {
        'name': 'prod',
        's3_path': 's3://baliciaga-database/bar-image-prod/',
        'json_file': 'bars.json',
        'json_s3_path': 's3://baliciaga-database/data/bars.json'
    }
]

def compare_directories(s3_base, dir1, dir2):
    """使用aws s3 sync --dryrun比较两个目录"""
    source = s3_base + dir1
    dest = s3_base + dir2
    
    print(f"\n比较目录内容:")
    print(f"  源: {source}")
    print(f"  目标: {dest}")
    
    # 使用sync --dryrun检查差异
    cmd = ['aws', 's3', 'sync', source, dest, '--dryrun']
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    # 如果没有输出，说明目录内容相同
    if not result.stdout.strip():
        return 'Identical'
    else:
        print(f"  差异输出:\n{result.stdout}")
        return 'Different'

def update_json_file(json_file, old_dir, new_dir):
    """更新JSON文件中的目录引用"""
    # 下载JSON文件
    print(f"\n下载JSON文件: {json_file}")
    s3_path = f"s3://baliciaga-database/data/{json_file}"
    subprocess.run(['aws', 's3', 'cp', s3_path, json_file], check=True)
    
    # 读取并更新JSON
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 统计更新数量
    update_count = 0
    
    # 更新所有URL引用
    for item in data:
        if 'photos' in item and item['photos']:
            for i, photo_url in enumerate(item['photos']):
                if f"/{old_dir}" in photo_url:
                    item['photos'][i] = photo_url.replace(f"/{old_dir}", f"/{new_dir}")
                    update_count += 1
        
        if 'staticMapS3Url' in item and item['staticMapS3Url']:
            if f"/{old_dir}" in item['staticMapS3Url']:
                item['staticMapS3Url'] = item['staticMapS3Url'].replace(f"/{old_dir}", f"/{new_dir}")
                update_count += 1
    
    # 保存更新后的文件
    updated_file = f"{json_file}.updated"
    with open(updated_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"  更新了 {update_count} 个URL引用")
    
    return updated_file, update_count

def delete_directory(s3_path):
    """删除S3目录"""
    print(f"\n删除S3目录: {s3_path}")
    cmd = ['aws', 's3', 'rm', s3_path, '--recursive']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print("  删除成功")
        return True
    else:
        print(f"  删除失败: {result.stderr}")
        return False

def upload_json_file(local_file, s3_path):
    """上传JSON文件到S3"""
    print(f"\n上传更新后的JSON文件到: {s3_path}")
    cmd = ['aws', 's3', 'cp', local_file, s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print("  上传成功")
        return True
    else:
        print(f"  上传失败: {result.stderr}")
        return False

def process_duplicate_pair(env, old_dir, new_dir):
    """处理一对重复目录"""
    print(f"\n{'='*60}")
    print(f"处理 {env['name']} 环境: '{old_dir}' -> '{new_dir}'")
    print(f"{'='*60}")
    
    # 步骤1: 对比内容
    comparison = compare_directories(env['s3_path'], old_dir, new_dir)
    print(f"\n对比结果: **{comparison}**")
    
    if comparison == 'Identical':
        # 步骤2A: 更新JSON文件
        updated_file, update_count = update_json_file(env['json_file'], old_dir.rstrip('/'), new_dir.rstrip('/'))
        
        if update_count > 0:
            # 步骤2B: 删除冗余S3目录
            # 注意：需要正确处理包含特殊字符的目录名
            s3_dir_path = env['s3_path'] + old_dir
            if delete_directory(s3_dir_path):
                # 步骤2C: 上传已修正的JSON文件
                if upload_json_file(updated_file, env['json_s3_path']):
                    return {'status': 'merged', 'old': old_dir, 'new': new_dir, 'updates': update_count}
                else:
                    return {'status': 'error', 'message': 'Failed to upload JSON'}
            else:
                return {'status': 'error', 'message': 'Failed to delete directory'}
        else:
            # 没有需要更新的引用，可以直接删除目录
            s3_dir_path = env['s3_path'] + old_dir
            if delete_directory(s3_dir_path):
                return {'status': 'merged', 'old': old_dir, 'new': new_dir, 'updates': 0}
            else:
                return {'status': 'error', 'message': 'Failed to delete directory'}
    else:
        return {'status': 'different', 'old': old_dir, 'new': new_dir}

def main():
    results = {
        'merged': [],
        'different': [],
        'errors': []
    }
    
    # 处理每个环境的每对重复目录
    for env in environments:
        print(f"\n\n{'#'*60}")
        print(f"# 处理 {env['name'].upper()} 环境")
        print(f"{'#'*60}")
        
        for old_dir, new_dir in duplicate_pairs:
            result = process_duplicate_pair(env, old_dir, new_dir)
            
            if result['status'] == 'merged':
                results['merged'].append({
                    'env': env['name'],
                    'old': result['old'],
                    'new': result['new'],
                    'updates': result['updates']
                })
            elif result['status'] == 'different':
                results['different'].append({
                    'env': env['name'],
                    'old': result['old'],
                    'new': result['new']
                })
            else:
                results['errors'].append({
                    'env': env['name'],
                    'old': result['old'],
                    'message': result.get('message', 'Unknown error')
                })
    
    # 生成最终报告
    print(f"\n\n{'#'*60}")
    print("# 最终报告")
    print(f"{'#'*60}")
    
    print(f"\n## 成功合并的目录 ({len(results['merged'])} 对):")
    for item in results['merged']:
        print(f"  - [{item['env']}] '{item['old']}' -> '{item['new']}' (更新了 {item['updates']} 个引用)")
    
    if results['different']:
        print(f"\n## 内容不一致需要人工决策的目录 ({len(results['different'])} 对):")
        for item in results['different']:
            print(f"  - [{item['env']}] '{item['old']}' 与 '{item['new']}' 内容不一致")
    
    if results['errors']:
        print(f"\n## 处理出错的目录 ({len(results['errors'])} 对):")
        for item in results['errors']:
            print(f"  - [{item['env']}] '{item['old']}': {item['message']}")
    
    # 清理临时文件
    for env in environments:
        for f in [env['json_file'], f"{env['json_file']}.updated"]:
            if os.path.exists(f):
                os.remove(f)

if __name__ == "__main__":
    main()