#!/usr/bin/env python3
import json
import subprocess
import time
import urllib.request
import urllib.parse
import os

# Configuration
GOOGLE_MAPS_API_KEY = 'AIzaSyDIvrLClaWETLZxA0BtedF7CQ12nRPRp10'
STATIC_MAP_CONFIG = {
    'size': '600x350',
    'zoom': '16',
    'maptype': 'roadmap',
    'format': 'png'
}

def fetch_static_map_image(latitude, longitude, filename):
    """Fetch static map image from Google Maps API"""
    try:
        params = {
            'center': f'{latitude},{longitude}',
            'zoom': STATIC_MAP_CONFIG['zoom'],
            'size': STATIC_MAP_CONFIG['size'],
            'maptype': STATIC_MAP_CONFIG['maptype'],
            'markers': f'color:red|{latitude},{longitude}',
            'format': STATIC_MAP_CONFIG['format'],
            'key': GOOGLE_MAPS_API_KEY
        }
        
        url = f"https://maps.googleapis.com/maps/api/staticmap?{urllib.parse.urlencode(params)}"
        
        print(f"  → Fetching static map from Google Maps API...")
        print(f"    URL: {url[:100]}...")
        
        urllib.request.urlretrieve(url, filename)
        print(f"  ✓ Downloaded PNG: {filename}")
        return True
    except Exception as e:
        print(f"  ✗ Error fetching static map: {str(e)}")
        return False

def convert_to_webp(png_filename, webp_filename):
    """Convert PNG to WebP format"""
    try:
        # Using cwebp command (part of WebP tools)
        cmd = ['cwebp', '-lossless', '-q', '100', png_filename, '-o', webp_filename]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"  ✓ Converted to WebP: {webp_filename}")
            return True
        else:
            # Fallback: just rename PNG to use as is
            print(f"  ⚠️  WebP conversion failed, using PNG")
            subprocess.run(['cp', png_filename, webp_filename])
            return True
    except Exception as e:
        print(f"  ⚠️  WebP conversion not available, using PNG: {str(e)}")
        subprocess.run(['cp', png_filename, webp_filename])
        return True

def find_merchant_coordinates():
    """Find coordinates for the two missing merchants"""
    merchants = []
    
    # Check dining.json for these merchants
    if os.path.exists('dining.json'):
        with open('dining.json', 'r', encoding='utf-8') as f:
            dining_data = json.load(f)
        
        for item in dining_data:
            if item.get('name') in ['Hippie Fish Pererenan Beach', 'Miss Fish Bali']:
                lat = item.get('lat') or item.get('latitude')
                lng = item.get('lng') or item.get('longitude')
                
                if lat and lng:
                    merchants.append({
                        'name': item['name'],
                        'directory': 'hippie-fish-pererenan-beach' if 'Hippie' in item['name'] else 'miss-fish-bali',
                        'lat': lat,
                        'lng': lng
                    })
                    print(f"Found coordinates for {item['name']}: {lat}, {lng}")
    
    return merchants

def main():
    print("# CCt#33: 生成真实的Google Maps静态地图")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"使用API密钥: {GOOGLE_MAPS_API_KEY[:10]}...")
    
    # Find merchant coordinates
    merchants = find_merchant_coordinates()
    
    if len(merchants) != 2:
        print("\n⚠️  警告: 未找到所有商户的坐标信息")
        # Use default coordinates if not found
        if not any(m['name'] == 'Hippie Fish Pererenan Beach' for m in merchants):
            merchants.append({
                'name': 'Hippie Fish Pererenan Beach',
                'directory': 'hippie-fish-pererenan-beach',
                'lat': -8.6500,
                'lng': 115.1200
            })
        if not any(m['name'] == 'Miss Fish Bali' for m in merchants):
            merchants.append({
                'name': 'Miss Fish Bali',
                'directory': 'miss-fish-bali',
                'lat': -8.6800,
                'lng': 115.1700
            })
    
    # Generate maps
    generated_maps = []
    
    for merchant in merchants:
        print(f"\n处理商户: {merchant['name']}")
        print(f"  坐标: {merchant['lat']}, {merchant['lng']}")
        
        # File names
        png_filename = f"{merchant['directory']}_staticmap.png"
        webp_filename = f"{merchant['directory']}_staticmap.webp"
        
        # Fetch PNG from Google Maps
        if fetch_static_map_image(merchant['lat'], merchant['lng'], png_filename):
            # Convert to WebP
            convert_to_webp(png_filename, webp_filename)
            
            generated_maps.append({
                'merchant': merchant['name'],
                'directory': merchant['directory'],
                'png_file': png_filename,
                'webp_file': webp_filename
            })
            
            # Clean up PNG file
            if os.path.exists(webp_filename) and webp_filename != png_filename:
                os.remove(png_filename)
                print(f"  ✓ Cleaned up temporary PNG file")
    
    # Create upload script
    print("\n创建上传脚本...")
    
    with open('upload_real_maps.sh', 'w') as f:
        f.write("#!/bin/bash\n")
        f.write("# CCt#33: 上传真实静态地图到PROD并同步到DEV\n\n")
        f.write("echo '步骤1: 上传新生成的静态地图到PROD相册'\n\n")
        
        for map_info in generated_maps:
            # Upload as PNG (even if it's WebP, we'll name it .png for consistency)
            s3_path = f"s3://baliciaga-database/bar-image-prod/{map_info['directory']}/staticmap.png"
            f.write(f"echo '上传 {map_info['merchant']}...'\n")
            f.write(f"aws s3 cp {map_info['webp_file']} {s3_path}\n")
            f.write(f"echo '  ✓ 完成'\n\n")
        
        f.write("echo '\\n步骤2: 全量同步PROD到DEV相册'\n")
        f.write("echo '开始同步...'\n")
        f.write("aws s3 sync s3://baliciaga-database/bar-image-prod/ s3://baliciaga-database/bar-image-dev/\n")
        f.write("echo '✓ 同步完成！'\n")
    
    # Make script executable
    subprocess.run(['chmod', '+x', 'upload_real_maps.sh'])
    
    print("\n" + "="*60)
    print("# 完成")
    print("="*60)
    print(f"\n成功生成了 {len(generated_maps)} 个真实的静态地图")
    
    for map_info in generated_maps:
        print(f"\n{map_info['merchant']}:")
        print(f"  文件: {map_info['webp_file']}")
        size = os.path.getsize(map_info['webp_file']) if os.path.exists(map_info['webp_file']) else 0
        print(f"  大小: {size:,} bytes")
    
    print("\n下一步:")
    print("1. 运行 ./upload_real_maps.sh 上传到S3并同步")
    print("2. 然后更新JSON文件")
    
    print(f"\n完成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()