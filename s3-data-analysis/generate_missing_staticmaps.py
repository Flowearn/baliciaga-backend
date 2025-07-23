#!/usr/bin/env python3
import json
import subprocess
import time
import urllib.request
import urllib.parse

def download_static_map(lat, lng, filename, zoom=15, size="600x400"):
    """使用Google Maps Static API生成静态地图"""
    # Google Maps Static API参数
    base_url = "https://maps.googleapis.com/maps/api/staticmap"
    
    # 构建参数
    params = {
        'center': f'{lat},{lng}',
        'zoom': zoom,
        'size': size,
        'scale': 2,  # 高分辨率
        'format': 'png',
        'maptype': 'roadmap',
        'markers': f'color:red|{lat},{lng}',
        'key': 'YOUR_API_KEY_HERE'  # 需要有效的API密钥
    }
    
    # 构建完整URL
    url = base_url + '?' + urllib.parse.urlencode(params)
    
    print(f"下载地图: {filename}")
    print(f"  坐标: {lat}, {lng}")
    
    # 下载地图
    try:
        urllib.request.urlretrieve(url, filename)
        print(f"  成功: {filename}")
        return True
    except Exception as e:
        print(f"  失败: {str(e)}")
        return False

def find_merchant_info(bars_data, merchant_name):
    """在bars数据中查找商户信息"""
    for item in bars_data:
        if item.get('name') == merchant_name:
            return item
    return None

def main():
    print("# CCt#31: 生成缺失的静态地图")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 读取bars.json获取商户信息
    with open('bars.json', 'r', encoding='utf-8') as f:
        bars_data = json.load(f)
    
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
    
    # 查找商户信息并生成地图
    generated_maps = []
    
    for merchant in missing_merchants:
        print(f"\n处理商户: {merchant['name']}")
        
        # 查找商户信息
        merchant_info = find_merchant_info(bars_data, merchant['name'])
        
        if not merchant_info:
            print(f"  警告: 在bars.json中未找到商户信息")
            continue
        
        # 获取坐标
        lat = merchant_info.get('lat')
        lng = merchant_info.get('lng')
        
        if not lat or not lng:
            print(f"  警告: 商户缺少坐标信息")
            continue
        
        # 生成地图文件名
        filename = f"{merchant['directory']}_staticmap.png"
        
        # 由于没有实际的API密钥，这里创建一个占位文件
        # 在实际使用时，需要替换为真实的Google Maps Static API调用
        print(f"  注意: 需要有效的Google Maps API密钥来生成真实地图")
        print(f"  坐标: {lat}, {lng}")
        print(f"  目标文件: {filename}")
        
        # 创建占位文件（实际使用时替换为API调用）
        with open(filename, 'w') as f:
            f.write(f"Placeholder for {merchant['name']} static map\n")
            f.write(f"Location: {lat}, {lng}\n")
        
        generated_maps.append({
            'merchant': merchant['name'],
            'directory': merchant['directory'],
            'filename': filename,
            'lat': lat,
            'lng': lng
        })
    
    # 生成上传脚本
    print("\n生成上传脚本...")
    
    with open('upload_staticmaps.sh', 'w') as f:
        f.write("#!/bin/bash\n")
        f.write("# CCt#31: 上传静态地图到PROD相册\n\n")
        
        for map_info in generated_maps:
            s3_path = f"s3://baliciaga-database/bar-image-prod/{map_info['directory']}/staticmap.png"
            f.write(f"echo '上传 {map_info['merchant']} 的静态地图...'\n")
            f.write(f"aws s3 cp {map_info['filename']} {s3_path}\n\n")
    
    # 设置脚本可执行
    subprocess.run(['chmod', '+x', 'upload_staticmaps.sh'])
    
    print("\n" + "="*60)
    print("# 总结")
    print("="*60)
    print(f"\n准备生成的地图数: {len(generated_maps)}")
    
    for map_info in generated_maps:
        print(f"\n商户: {map_info['merchant']}")
        print(f"  坐标: {map_info['lat']}, {map_info['lng']}")
        print(f"  文件: {map_info['filename']}")
        print(f"  目标: s3://baliciaga-database/bar-image-prod/{map_info['directory']}/staticmap.png")
    
    print("\n注意事项:")
    print("1. 需要有效的Google Maps API密钥来生成真实的静态地图")
    print("2. 当前创建的是占位文件，包含了商户的坐标信息")
    print("3. 生成真实地图后，运行 ./upload_staticmaps.sh 上传到S3")
    
    print(f"\n完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()