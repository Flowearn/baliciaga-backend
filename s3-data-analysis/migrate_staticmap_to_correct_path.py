#!/usr/bin/env python3
import subprocess
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

def load_json_data():
    """加载所有JSON文件以获取placeId映射"""
    merchant_place_id_map = {}
    
    json_files = [
        ('bars-dev.json', 'bar-image-dev'),
        ('bars.json', 'bar-image-prod'),
        ('dining-dev.json', 'dining-image-dev'),
        ('dining.json', 'dining-image-prod'),
        ('cowork-dev.json', 'cowork-image-dev'),
        ('cafes-dev.json', 'cafe-image-dev')
    ]
    
    for json_file, album in json_files:
        filepath = f'/Users/troy/开发文档/Baliciaga/backend/scripts/{json_file}'
        if os.path.exists(filepath):
            print(f"加载 {json_file}...")
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for item in data:
                if 'name' in item and 'placeId' in item:
                    # 转换商户名称为kebab-case
                    merchant_name = item['name'].lower().replace(' ', '-').replace('|', '').replace('/', '-')
                    # 清理特殊字符
                    merchant_name = merchant_name.replace('&', '').replace('--', '-').strip('-')
                    
                    # 存储映射关系
                    key = f"{album}/{merchant_name}"
                    merchant_place_id_map[key] = {
                        'placeId': item['placeId'],
                        'name': item['name'],
                        'staticMapUrl': item.get('staticMapS3Url', '')
                    }
    
    return merchant_place_id_map

def migrate_single_file(file_info, merchant_map):
    """迁移单个静态地图文件到正确路径"""
    try:
        album = file_info['album']
        key = file_info['key']
        
        # 提取商户名称
        parts = key.split('/')
        if len(parts) < 3:
            return f"❌ 无效路径: {key}"
        
        merchant_folder = parts[1]
        lookup_key = f"{album}/{merchant_folder}"
        
        # 查找对应的placeId
        if lookup_key not in merchant_map:
            # 尝试其他变体
            alt_names = [
                merchant_folder.replace('-', ''),
                merchant_folder.replace('patato', 'potato'),  # 修正拼写错误
                merchant_folder.replace('longtime', 'longtime-modern-asian-restaurant-bar-bali'),
                merchant_folder.replace('the-barn-gastropub', 'barn-gastropub'),
                merchant_folder.replace('the-lawn', 'the-lawn-canggu-beach-club')
            ]
            
            for alt_name in alt_names:
                alt_key = f"{album}/{alt_name}"
                if alt_key in merchant_map:
                    lookup_key = alt_key
                    break
            else:
                return f"⚠️  未找到placeId: {merchant_folder} in {album}"
        
        merchant_info = merchant_map[lookup_key]
        place_id = merchant_info['placeId']
        
        # 构建新路径
        new_folder = f"{merchant_folder}_{place_id}"
        new_filename = f"{merchant_folder}_static.webp"
        new_key = f"{album}/{new_folder}/{new_filename}"
        
        # S3路径
        source_path = f"s3://baliciaga-database/{key}"
        dest_path = f"s3://baliciaga-database/{new_key}"
        
        # 复制文件到新路径
        copy_cmd = ['aws', 's3', 'cp', source_path, dest_path]
        result = subprocess.run(copy_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return f"❌ 复制失败 {merchant_folder}: {result.stderr}"
        
        # 删除旧文件
        delete_cmd = ['aws', 's3', 'rm', source_path]
        result = subprocess.run(delete_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return f"⚠️  复制成功但删除失败 {merchant_folder}: {result.stderr}"
        
        return f"✅ 成功迁移 {merchant_folder} -> {new_folder}/{new_filename}"
        
    except Exception as e:
        return f"❌ 错误 {file_info['key']}: {str(e)}"

def main():
    """主函数"""
    print("加载商户PlaceId映射...")
    merchant_map = load_json_data()
    print(f"加载了 {len(merchant_map)} 个商户映射\n")
    
    # 加载需要迁移的文件
    with open('all_staticmap_files.json', 'r', encoding='utf-8') as f:
        all_files = json.load(f)
    
    # 筛选出需要迁移的文件（simple_webp模式）
    files_to_migrate = [f for f in all_files if f.get('pattern') == 'simple_webp']
    
    print(f"找到 {len(files_to_migrate)} 个需要迁移的文件\n")
    
    if not files_to_migrate:
        print("没有需要迁移的文件")
        return
    
    # 使用线程池并行处理
    successful = 0
    failed = 0
    results = []
    
    print("开始迁移...")
    print("=" * 80)
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_file = {
            executor.submit(migrate_single_file, file_info, merchant_map): file_info 
            for file_info in files_to_migrate
        }
        
        for future in as_completed(future_to_file):
            result = future.result()
            results.append(result)
            
            if result.startswith("✅"):
                successful += 1
            else:
                failed += 1
            
            total_processed = successful + failed
            print(f"[{total_processed}/{len(files_to_migrate)}] {result}")
    
    # 最终报告
    print("\n" + "=" * 80)
    print(f"迁移完成！")
    print(f"✅ 成功: {successful} 个文件")
    print(f"❌ 失败/警告: {failed} 个文件")
    
    # 保存结果
    with open('migration_results.json', 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(files_to_migrate),
            'successful': successful,
            'failed': failed,
            'results': results
        }, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()