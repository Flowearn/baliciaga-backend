#!/usr/bin/env python3
import json
import subprocess
import os
from PIL import Image, ImageDraw, ImageFont

def create_placeholder_map(merchant_name, lat, lng, filename):
    """创建一个占位静态地图"""
    # 创建600x400的图像
    img = Image.new('RGB', (600, 400), color='#f0f0f0')
    draw = ImageDraw.Draw(img)
    
    # 绘制边框
    draw.rectangle([0, 0, 599, 399], outline='#cccccc', width=2)
    
    # 添加文字
    text_lines = [
        f"{merchant_name}",
        f"Location: {lat:.6f}, {lng:.6f}",
        "Static Map Placeholder"
    ]
    
    y_offset = 150
    for line in text_lines:
        # 使用默认字体
        bbox = draw.textbbox((0, 0), line)
        text_width = bbox[2] - bbox[0]
        x = (600 - text_width) // 2
        draw.text((x, y_offset), line, fill='#333333')
        y_offset += 30
    
    # 保存图像
    img.save(filename, 'PNG')
    print(f"创建占位地图: {filename}")

def find_merchant_in_data(merchant_name):
    """在dining和bars数据中查找商户信息"""
    # 先在dining.json中查找
    if os.path.exists('dining.json'):
        with open('dining.json', 'r', encoding='utf-8') as f:
            dining_data = json.load(f)
        for item in dining_data:
            if item.get('name') == merchant_name:
                return item, 'dining'
    
    # 再在bars.json中查找
    if os.path.exists('bars.json'):
        with open('bars.json', 'r', encoding='utf-8') as f:
            bars_data = json.load(f)
        for item in bars_data:
            if item.get('name') == merchant_name:
                return item, 'bar'
    
    return None, None

def main():
    print("# CCt#31: 创建缺失的静态地图占位图")
    print("="*60)
    
    # 要处理的两个商户
    missing_merchants = [
        {
            'name': 'Hippie Fish Pererenan Beach',
            'directory': 'hippie-fish-pererenan-beach'
        },
        {
            'name': 'Miss Fish Bali',
            'directory': 'miss-fish-bali'
        }
    ]
    
    created_maps = []
    
    for merchant in missing_merchants:
        print(f"\n处理商户: {merchant['name']}")
        
        # 查找商户信息
        merchant_info, category = find_merchant_in_data(merchant['name'])
        
        if merchant_info:
            lat = merchant_info.get('lat', -8.6500)  # 默认巴厘岛坐标
            lng = merchant_info.get('lng', 115.2200)
            print(f"  找到商户信息 (分类: {category})")
            print(f"  坐标: {lat}, {lng}")
        else:
            # 使用默认巴厘岛坐标
            lat = -8.6500
            lng = 115.2200
            print(f"  未找到商户信息，使用默认坐标")
        
        # 创建占位地图
        filename = f"{merchant['directory']}_staticmap.png"
        create_placeholder_map(merchant['name'], lat, lng, filename)
        
        created_maps.append({
            'merchant': merchant['name'],
            'directory': merchant['directory'],
            'filename': filename
        })
    
    # 创建上传脚本
    print("\n创建上传脚本...")
    
    with open('upload_to_prod.sh', 'w') as f:
        f.write("#!/bin/bash\n")
        f.write("# CCt#31: 上传静态地图到PROD相册\n\n")
        f.write("echo '步骤1: 上传新生成的静态地图到PROD相册'\n\n")
        
        for map_info in created_maps:
            s3_path = f"s3://baliciaga-database/bar-image-prod/{map_info['directory']}/staticmap.png"
            f.write(f"echo '上传 {map_info['merchant']}...'\n")
            f.write(f"aws s3 cp {map_info['filename']} {s3_path}\n\n")
        
        f.write("echo '\\n步骤2: 全量同步PROD到DEV相册'\n")
        f.write("echo '开始同步...'\n")
        f.write("aws s3 sync s3://baliciaga-database/bar-image-prod/ s3://baliciaga-database/bar-image-dev/\n")
        f.write("echo '同步完成！'\n")
    
    # 设置脚本可执行
    subprocess.run(['chmod', '+x', 'upload_to_prod.sh'])
    
    print("\n" + "="*60)
    print("# 完成")
    print("="*60)
    print(f"\n创建了 {len(created_maps)} 个占位静态地图")
    print("\n下一步:")
    print("1. 运行 ./upload_to_prod.sh 执行上传和同步")
    print("2. 然后运行更新JSON的脚本")

if __name__ == "__main__":
    main()