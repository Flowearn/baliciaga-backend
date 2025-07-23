#!/usr/bin/env python3
import os
import sys
import requests
import subprocess
from urllib.parse import quote
import json

# Te'amo商户信息
merchant_info = {
    "name": "Te'amo",
    "placeId": "ChIJk3IjCVU50i0RDCA0u-V4WAs",
    "latitude": -8.654581,
    "longitude": 115.12967710000001,
    "folder": "teamo"
}

def get_api_key():
    """尝试从多个来源获取API密钥"""
    # 1. 环境变量
    api_key = os.environ.get('GOOGLE_MAPS_API_KEY')
    if api_key:
        print("✅ 从环境变量获取到API密钥")
        return api_key
    
    # 2. 命令行参数
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
        print("✅ 从命令行参数获取到API密钥")
        return api_key
    
    # 3. 本地配置文件
    config_file = os.path.expanduser('~/.baliciaga/config.json')
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
                api_key = config.get('google_maps_api_key')
                if api_key:
                    print("✅ 从配置文件获取到API密钥")
                    return api_key
        except:
            pass
    
    return None

def generate_real_static_map(api_key):
    """生成真实的静态地图"""
    print(f"\n正在为 {merchant_info['name']} 生成真实静态地图...")
    print(f"坐标: {merchant_info['latitude']}, {merchant_info['longitude']}")
    
    # Google Static Maps API URL
    base_url = "https://maps.googleapis.com/maps/api/staticmap"
    
    # 参数配置 - 600x350尺寸
    params = {
        'center': f"{merchant_info['latitude']},{merchant_info['longitude']}",
        'zoom': '16',
        'size': '600x350',  # 按要求的尺寸
        'maptype': 'roadmap',
        'markers': f"color:red|{merchant_info['latitude']},{merchant_info['longitude']}",
        'key': api_key,
        'format': 'png',
        'scale': '2'  # 高分辨率
    }
    
    # 构建完整URL
    query_string = '&'.join([f"{k}={quote(str(v))}" for k, v in params.items()])
    url = f"{base_url}?{query_string}"
    
    print("正在从Google Maps API下载地图...")
    
    try:
        # 下载地图
        response = requests.get(url, timeout=30)
        
        # 检查响应
        if response.status_code != 200:
            print(f"❌ API请求失败: HTTP {response.status_code}")
            if response.status_code == 403:
                print("   可能是API密钥无效或配额已用完")
            return None
        
        # 检查是否返回了图片
        content_type = response.headers.get('content-type', '')
        if 'image' not in content_type:
            print(f"❌ 返回的不是图片: {content_type}")
            print(f"   响应内容: {response.text[:200]}...")
            return None
        
        # 保存为PNG
        png_path = 'teamo_real_static.png'
        with open(png_path, 'wb') as f:
            f.write(response.content)
        
        print(f"✅ 成功下载静态地图 (大小: {len(response.content) / 1024:.1f} KB)")
        
        # 转换为WebP
        webp_path = 'teamo_static.webp'
        convert_cmd = ['cwebp', '-q', '90', png_path, '-o', webp_path]
        
        print("正在转换为WebP格式...")
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 成功转换为WebP格式")
            # 删除PNG文件
            os.remove(png_path)
            
            # 检查文件大小
            file_size = os.path.getsize(webp_path) / 1024
            print(f"   文件大小: {file_size:.1f} KB")
            
            return webp_path
        else:
            print(f"❌ WebP转换失败: {result.stderr}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ 网络请求失败: {e}")
        return None
    except Exception as e:
        print(f"❌ 生成地图失败: {e}")
        return None

def upload_to_s3(local_path):
    """上传到S3"""
    if not local_path or not os.path.exists(local_path):
        print("❌ 本地文件不存在")
        return False
    
    # S3路径
    s3_path = f"s3://baliciaga-database/dining-image-dev/{merchant_info['folder']}_{merchant_info['placeId']}/{merchant_info['folder']}_static.webp"
    
    print(f"\n正在上传到S3...")
    print(f"目标路径: {s3_path}")
    
    cmd = ['aws', 's3', 'cp', local_path, s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✅ 成功上传到S3")
        
        # CloudFront URL
        cf_url = f"https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/{merchant_info['folder']}_{merchant_info['placeId']}/{merchant_info['folder']}_static.webp"
        print(f"\n📍 地图URL: {cf_url}")
        
        return True
    else:
        print(f"❌ 上传失败: {result.stderr}")
        return False

def verify_upload():
    """验证上传结果"""
    url = f"https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/{merchant_info['folder']}_{merchant_info['placeId']}/{merchant_info['folder']}_static.webp"
    
    print("\n验证上传结果...")
    cmd = ['curl', '-I', '-s', url]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if 'HTTP/2 200' in result.stdout or 'HTTP/1.1 200' in result.stdout:
        print("✅ 文件可以正常访问")
        return True
    else:
        print("❌ 文件无法访问")
        return False

def main():
    print("=== 生成Te'amo真实静态地图 ===")
    print(f"商户: {merchant_info['name']}")
    print(f"PlaceId: {merchant_info['placeId']}")
    
    # 获取API密钥
    api_key = get_api_key()
    
    if not api_key:
        print("\n❌ 错误: 未找到Google Maps API密钥")
        print("\n请通过以下方式之一提供API密钥:")
        print("1. 设置环境变量: export GOOGLE_MAPS_API_KEY='your-key'")
        print("2. 命令行参数: python generate_real_teamo_map.py 'your-key'")
        print("3. 配置文件: ~/.baliciaga/config.json")
        return
    
    # 生成地图
    webp_file = generate_real_static_map(api_key)
    
    if webp_file:
        # 上传到S3
        if upload_to_s3(webp_file):
            # 清理本地文件
            os.remove(webp_file)
            
            # 验证
            verify_upload()
            
            print("\n✅ 任务完成！真实地图已成功上传")
        else:
            print("\n❌ 上传失败")
    else:
        print("\n❌ 生成地图失败")

if __name__ == "__main__":
    main()