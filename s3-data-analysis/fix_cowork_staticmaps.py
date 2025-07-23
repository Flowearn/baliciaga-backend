#!/usr/bin/env python3
import json
import subprocess
import os

def process_cowork_environment(json_file_path, s3_json_path, album_prefix):
    """处理cowork环境的静态地图迁移和JSON更新"""
    
    print(f"\n{'='*80}")
    print(f"处理 {json_file_path}")
    print(f"{'='*80}")
    
    # 读取JSON文件
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated_count = 0
    migration_logs = []
    
    for idx, merchant in enumerate(data):
        merchant_name = merchant.get('name', 'Unknown')
        place_id = merchant.get('placeId', '')
        current_static_url = merchant.get('staticMapS3Url', '')
        
        if not current_static_url:
            continue
        
        # 分析当前URL结构
        if f'{album_prefix}/' in current_static_url:
            # 提取当前路径信息
            path_parts = current_static_url.split(f'{album_prefix}/')[1].split('/')
            
            if len(path_parts) >= 2 and place_id in path_parts[0]:
                # 当前是独立目录格式，需要移动到主相册
                old_folder = path_parts[0]  # e.g., "b-work-bali_ChIJ6fBvIpg50i0R8764BCFFN60"
                old_filename = path_parts[1]  # e.g., "b-work-bali_static.webp"
                
                # 推断商户文件夹名称
                merchant_folder = old_folder.split(f'_{place_id}')[0]
                
                # 构建S3路径
                old_s3_path = f"s3://baliciaga-database/{album_prefix}/{old_folder}/{old_filename}"
                new_s3_path = f"s3://baliciaga-database/{album_prefix}/{merchant_folder}/staticmap.webp"
                
                print(f"\n处理商户 {idx+1}: {merchant_name}")
                print(f"  当前URL: {current_static_url}")
                
                # 执行S3移动操作
                mv_cmd = ['aws', 's3', 'mv', old_s3_path, new_s3_path]
                result = subprocess.run(mv_cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    # 更新JSON中的URL
                    new_url = f"https://d2cmxnft4myi1k.cloudfront.net/{album_prefix}/{merchant_folder}/staticmap.webp"
                    merchant['staticMapS3Url'] = new_url
                    updated_count += 1
                    
                    migration_logs.append({
                        'merchant': merchant_name,
                        'old_url': current_static_url,
                        'new_url': new_url,
                        'status': 'success'
                    })
                    
                    print(f"  ✅ 成功移动到: {new_url}")
                else:
                    # 检查文件是否已经在目标位置
                    check_cmd = ['aws', 's3', 'ls', new_s3_path]
                    check_result = subprocess.run(check_cmd, capture_output=True, text=True)
                    
                    if check_result.returncode == 0:
                        # 文件已经在正确位置，只更新URL
                        new_url = f"https://d2cmxnft4myi1k.cloudfront.net/{album_prefix}/{merchant_folder}/staticmap.webp"
                        merchant['staticMapS3Url'] = new_url
                        updated_count += 1
                        
                        migration_logs.append({
                            'merchant': merchant_name,
                            'old_url': current_static_url,
                            'new_url': new_url,
                            'status': 'already_exists'
                        })
                        
                        print(f"  ✅ 文件已存在，更新URL: {new_url}")
                    else:
                        migration_logs.append({
                            'merchant': merchant_name,
                            'old_url': current_static_url,
                            'error': result.stderr,
                            'status': 'failed'
                        })
                        print(f"  ❌ 移动失败: {result.stderr}")
            else:
                # 已经是正确格式
                print(f"\n商户 {idx+1}: {merchant_name}")
                print(f"  ✅ URL已经是正确格式: {current_static_url}")
    
    # 保存更新后的JSON
    if updated_count > 0:
        # 保存到本地
        local_output = json_file_path.replace('.json', '_updated.json')
        with open(local_output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\n更新了 {updated_count} 个商户的静态地图URL")
        print(f"本地文件已保存: {local_output}")
        
        # 上传到S3
        upload_cmd = ['aws', 's3', 'cp', local_output, s3_json_path]
        result = subprocess.run(upload_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 成功上传到S3: {s3_json_path}")
        else:
            print(f"❌ 上传失败: {result.stderr}")
    else:
        print("\n无需更新任何URL")
    
    return migration_logs

def main():
    print("=== 修正cowork分类静态地图路径 ===")
    
    # 处理dev环境
    dev_logs = process_cowork_environment(
        '/Users/troy/开发文档/Baliciaga/backend/scripts/cowork-dev.json',
        's3://baliciaga-database/data/cowork-dev.json',
        'cowork-image-dev'
    )
    
    # 处理prod环境
    prod_logs = process_cowork_environment(
        '/Users/troy/开发文档/Baliciaga/backend/scripts/cowork.json',
        's3://baliciaga-database/data/cowork.json',
        'cowork-image-prod'
    )
    
    # 生成最终报告
    print("\n" + "="*80)
    print("最终报告")
    print("="*80)
    
    # 显示一个例子
    if dev_logs:
        for log in dev_logs:
            if log.get('status') in ['success', 'already_exists']:
                print(f"\n示例 - 商户: {log['merchant']}")
                print(f"修改前: {log['old_url']}")
                print(f"修改后: {log['new_url']}")
                break
    
    # 总结
    dev_success = sum(1 for log in dev_logs if log.get('status') in ['success', 'already_exists'])
    prod_success = sum(1 for log in prod_logs if log.get('status') in ['success', 'already_exists'])
    
    print(f"\nDev环境: 成功处理 {dev_success} 个商户")
    print(f"Prod环境: 成功处理 {prod_success} 个商户")
    
    # 保存详细日志
    with open('cowork_migration_log.json', 'w', encoding='utf-8') as f:
        json.dump({
            'dev_logs': dev_logs,
            'prod_logs': prod_logs
        }, f, ensure_ascii=False, indent=2)
    
    print("\n详细日志已保存到: cowork_migration_log.json")

if __name__ == "__main__":
    main()