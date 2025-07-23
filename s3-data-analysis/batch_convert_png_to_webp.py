#!/usr/bin/env python3
import subprocess
import json
import os
import tempfile
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

def check_dependencies():
    """检查必要的依赖"""
    # 检查cwebp
    try:
        subprocess.run(['cwebp', '-version'], capture_output=True, check=True)
        print("✓ cwebp 已安装")
        return 'cwebp'
    except:
        print("⚠️  cwebp 未安装，尝试使用 ImageMagick...")
        try:
            subprocess.run(['convert', '-version'], capture_output=True, check=True)
            print("✓ ImageMagick 已安装")
            return 'imagemagick'
        except:
            print("❌ 未找到图片转换工具，尝试安装...")
            # 尝试安装cwebp
            try:
                subprocess.run(['brew', 'install', 'webp'], check=True)
                print("✓ 成功安装 cwebp")
                return 'cwebp'
            except:
                print("❌ 无法安装必要的工具")
                return None

def convert_single_file(file_info, converter, temp_dir):
    """转换单个PNG文件到WebP"""
    try:
        s3_path = file_info['path']
        key = file_info['key']
        album = file_info['album']
        
        # 生成本地临时文件路径
        merchant_name = key.split('/')[-2]
        png_path = os.path.join(temp_dir, f"{album}_{merchant_name}_staticmap.png")
        webp_path = os.path.join(temp_dir, f"{album}_{merchant_name}_staticmap.webp")
        
        # 1. 下载PNG文件
        download_cmd = ['aws', 's3', 'cp', s3_path, png_path]
        result = subprocess.run(download_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return f"❌ 下载失败 {key}: {result.stderr}"
        
        # 2. 转换PNG到WebP
        if converter == 'cwebp':
            # 使用cwebp，质量设置为90
            convert_cmd = ['cwebp', '-q', '90', png_path, '-o', webp_path]
        else:
            # 使用ImageMagick
            convert_cmd = ['convert', png_path, '-quality', '90', webp_path]
        
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return f"❌ 转换失败 {key}: {result.stderr}"
        
        # 3. 上传WebP文件到相同路径
        webp_s3_path = s3_path.replace('staticmap.png', 'staticmap.webp')
        upload_cmd = ['aws', 's3', 'cp', webp_path, webp_s3_path]
        result = subprocess.run(upload_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return f"❌ 上传失败 {key}: {result.stderr}"
        
        # 4. 删除原始PNG文件
        delete_cmd = ['aws', 's3', 'rm', s3_path]
        result = subprocess.run(delete_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return f"⚠️  删除PNG失败 {key}: {result.stderr} (WebP已上传)"
        
        # 5. 清理临时文件
        os.remove(png_path)
        os.remove(webp_path)
        
        return f"✅ 成功 {key}"
        
    except Exception as e:
        return f"❌ 错误 {file_info['key']}: {str(e)}"

def batch_convert_all():
    """批量转换所有PNG文件"""
    # 检查依赖
    converter = check_dependencies()
    if not converter:
        print("无法继续，缺少必要的转换工具")
        return
    
    # 加载文件列表
    with open('staticmap_pngs_to_convert.json', 'r', encoding='utf-8') as f:
        files = json.load(f)
    
    print(f"\n准备转换 {len(files)} 个文件...")
    
    # 创建临时目录
    temp_dir = tempfile.mkdtemp(prefix='png_to_webp_')
    print(f"临时目录: {temp_dir}")
    
    # 记录开始时间
    start_time = datetime.now()
    
    # 使用线程池并行处理
    successful = 0
    failed = 0
    results = []
    
    print("\n开始批量转换...")
    print("=" * 80)
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        # 提交所有任务
        future_to_file = {
            executor.submit(convert_single_file, file_info, converter, temp_dir): file_info 
            for file_info in files
        }
        
        # 处理完成的任务
        for future in as_completed(future_to_file):
            file_info = future_to_file[future]
            result = future.result()
            results.append(result)
            
            if result.startswith("✅"):
                successful += 1
            else:
                failed += 1
            
            # 实时显示进度
            total_processed = successful + failed
            print(f"[{total_processed}/{len(files)}] {result}")
    
    # 清理临时目录
    shutil.rmtree(temp_dir)
    
    # 计算耗时
    elapsed = datetime.now() - start_time
    
    # 最终报告
    print("\n" + "=" * 80)
    print(f"转换完成！耗时: {elapsed}")
    print(f"✅ 成功: {successful} 个文件")
    print(f"❌ 失败: {failed} 个文件")
    
    # 保存详细结果
    with open('conversion_results.json', 'w', encoding='utf-8') as f:
        json.dump({
            'total': len(files),
            'successful': successful,
            'failed': failed,
            'elapsed': str(elapsed),
            'details': results
        }, f, ensure_ascii=False, indent=2)
    
    print("\n详细结果已保存到 conversion_results.json")
    
    return successful, failed

# 执行批量转换
if __name__ == "__main__":
    batch_convert_all()