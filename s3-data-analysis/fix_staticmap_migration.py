#!/usr/bin/env python3
import subprocess
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

def normalize_merchant_name(name):
    """标准化商户名称为kebab-case"""
    # 转换为小写并替换空格
    name = name.lower().replace(' ', '-')
    # 处理特殊字符
    name = name.replace('|', '').replace('/', '-').replace('&', 'and')
    name = name.replace('---', '-').replace('--', '-')
    # 去除首尾的连字符
    return name.strip('-')

def load_all_json_data():
    """加载所有JSON文件以获取完整的placeId映射"""
    merchant_map = {}
    
    # 定义所有需要加载的JSON文件
    json_configs = [
        # Bar相关
        ('bars-dev.json', 'bar-image-dev'),
        ('bars.json', 'bar-image-prod'),
        ('bars-updated.json', 'bar-image-prod'),  # 可能的备份文件
        
        # Dining相关
        ('dining-dev.json', 'dining-image-dev'),
        ('dining.json', 'dining-image-prod'),
        ('new-dining-dev.json', 'dining-image-dev'),  # 可能的新文件
        
        # Cafe相关
        ('cafes-dev.json', 'cafe-image-dev'),
        ('cafes.json', 'cafe-image-prod'),
        
        # Cowork相关
        ('cowork-dev.json', 'cowork-image-dev'),
        ('cowork-dev-ske.json', 'cowork-image-dev'),  # 可能的备份
    ]
    
    scripts_dir = '/Users/troy/开发文档/Baliciaga/backend/scripts'
    
    for json_file, album in json_configs:
        filepath = os.path.join(scripts_dir, json_file)
        if os.path.exists(filepath):
            print(f"加载 {json_file}...")
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # 处理数据
                for item in data:
                    if 'name' in item and 'placeId' in item:
                        # 原始名称和标准化名称
                        original_name = item['name']
                        normalized_name = normalize_merchant_name(original_name)
                        
                        # 创建多个可能的键值（处理命名不一致的情况）
                        possible_names = [
                            normalized_name,
                            normalized_name.replace('and', ''),
                            normalized_name.replace('the-', ''),
                            normalized_name.replace('-the', ''),
                            # 特殊情况处理
                            'patato-head-beach-club' if 'potato-head' in normalized_name else None,
                            'barn-gastropub' if 'barn-pub' in normalized_name else None,
                            'the-lawn' if 'lawn-canggu' in normalized_name else None,
                        ]
                        
                        # 为每个可能的名称创建映射
                        for name in possible_names:
                            if name:
                                key = f"{album}/{name}"
                                merchant_map[key] = {
                                    'placeId': item['placeId'],
                                    'originalName': original_name,
                                    'normalizedName': normalized_name,
                                    'staticMapUrl': item.get('staticMapS3Url', '')
                                }
                
                print(f"  从 {json_file} 加载了 {len([i for i in data if 'placeId' in i])} 个商户")
                
            except Exception as e:
                print(f"  警告: 无法加载 {json_file}: {e}")
    
    # 特殊情况：为prod环境复制dev环境的数据（如果prod缺失）
    for dev_key in list(merchant_map.keys()):
        if '-dev/' in dev_key:
            prod_key = dev_key.replace('-dev/', '-prod/')
            if prod_key not in merchant_map:
                merchant_map[prod_key] = merchant_map[dev_key].copy()
    
    return merchant_map

def migrate_single_file(file_info, merchant_map):
    """迁移单个静态地图文件到正确路径"""
    try:
        album = file_info['album']
        key = file_info['key']
        
        # 提取商户文件夹名称
        parts = key.split('/')
        if len(parts) < 3:
            return f"❌ 无效路径: {key}"
        
        merchant_folder = parts[1]
        
        # 尝试多种查找方式
        lookup_keys = [
            f"{album}/{merchant_folder}",
            f"{album}/{merchant_folder.replace('the-', '')}",
            f"{album}/the-{merchant_folder}",
        ]
        
        merchant_info = None
        used_key = None
        
        for lookup_key in lookup_keys:
            if lookup_key in merchant_map:
                merchant_info = merchant_map[lookup_key]
                used_key = lookup_key
                break
        
        if not merchant_info:
            # 打印所有可用的键供调试
            available = [k for k in merchant_map.keys() if album in k]
            return f"⚠️  未找到映射: {merchant_folder} in {album} (尝试过: {lookup_keys})"
        
        place_id = merchant_info['placeId']
        
        # 构建新路径
        new_folder = f"{merchant_folder}_{place_id}"
        new_filename = f"{merchant_folder}_static.webp"
        new_key = f"{album}/{new_folder}/{new_filename}"
        
        # S3路径
        source_path = f"s3://baliciaga-database/{key}"
        dest_path = f"s3://baliciaga-database/{new_key}"
        
        # 检查目标是否已存在
        check_cmd = ['aws', 's3', 'ls', dest_path]
        result = subprocess.run(check_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            # 目标已存在，直接删除源文件
            delete_cmd = ['aws', 's3', 'rm', source_path]
            result = subprocess.run(delete_cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                return f"✅ 目标已存在，删除源文件: {merchant_folder}"
            else:
                return f"⚠️  目标已存在，但删除源文件失败: {merchant_folder}"
        
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
    print("加载所有商户PlaceId映射...")
    merchant_map = load_all_json_data()
    print(f"\n总共加载了 {len(merchant_map)} 个商户映射\n")
    
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
    with open('migration_results_fixed.json', 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(files_to_migrate),
            'successful': successful,
            'failed': failed,
            'results': results
        }, f, ensure_ascii=False, indent=2)
    
    print("\n详细结果已保存到 migration_results_fixed.json")

if __name__ == "__main__":
    main()