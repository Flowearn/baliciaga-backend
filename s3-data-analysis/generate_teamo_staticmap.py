#!/usr/bin/env python3
import os
import requests
import subprocess
from urllib.parse import quote

# Te'amo商户信息
merchant_info = {
    "name": "Te'amo",
    "placeId": "ChIJk3IjCVU50i0RDCA0u-V4WAs",
    "latitude": -8.654581,
    "longitude": 115.12967710000001,
    "folder": "teamo"
}

def generate_static_map():
    """生成静态地图"""
    # 尝试使用环境变量中的API密钥
    api_key = os.environ.get('GOOGLE_MAPS_API_KEY')
    
    if not api_key:
        print("警告: 未找到GOOGLE_MAPS_API_KEY环境变量")
        print("将使用默认参数生成静态地图...")
        # 如果没有API密钥，我们使用一个占位图片
        return generate_placeholder_map()
    
    # Google Static Maps API参数
    base_url = "https://maps.googleapis.com/maps/api/staticmap"
    
    params = {
        'center': f"{merchant_info['latitude']},{merchant_info['longitude']}",
        'zoom': '16',
        'size': '600x400',
        'maptype': 'roadmap',
        'markers': f"color:red|{merchant_info['latitude']},{merchant_info['longitude']}",
        'key': api_key,
        'format': 'png'
    }
    
    # 构建URL
    query_string = '&'.join([f"{k}={quote(str(v))}" for k, v in params.items()])
    url = f"{base_url}?{query_string}"
    
    print(f"正在从Google Maps API获取静态地图...")
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # 保存为PNG
        png_path = 'teamo_static.png'
        with open(png_path, 'wb') as f:
            f.write(response.content)
        
        print(f"✅ 成功下载静态地图: {png_path}")
        
        # 转换为WebP
        webp_path = 'teamo_static.webp'
        convert_cmd = ['cwebp', '-q', '90', png_path, '-o', webp_path]
        
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 成功转换为WebP: {webp_path}")
            # 删除PNG文件
            os.remove(png_path)
            return webp_path
        else:
            print(f"❌ WebP转换失败: {result.stderr}")
            return None
            
    except Exception as e:
        print(f"❌ 获取静态地图失败: {e}")
        return generate_placeholder_map()

def generate_placeholder_map():
    """生成占位地图"""
    print("生成占位静态地图...")
    
    # 使用ImageMagick创建一个简单的占位图
    webp_path = 'teamo_static.webp'
    
    # 创建一个600x400的灰色图片，带有文字
    cmd = [
        'convert',
        '-size', '600x400',
        'xc:lightgray',
        '-gravity', 'center',
        '-pointsize', '24',
        '-fill', 'black',
        '-annotate', '+0+0', 'Te\'amo\n-8.654581, 115.129677',
        '-quality', '90',
        webp_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ 成功创建占位地图: {webp_path}")
            return webp_path
        else:
            print(f"❌ 创建占位地图失败: {result.stderr}")
            return None
    except Exception as e:
        print(f"❌ 创建占位地图失败: {e}")
        return None

def upload_to_s3(local_path):
    """上传到S3"""
    if not local_path or not os.path.exists(local_path):
        print("❌ 本地文件不存在")
        return False
    
    # S3路径
    s3_path = f"s3://baliciaga-database/dining-image-dev/{merchant_info['folder']}_{merchant_info['placeId']}/{merchant_info['folder']}_static.webp"
    
    print(f"正在上传到S3: {s3_path}")
    
    cmd = ['aws', 's3', 'cp', local_path, s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✅ 成功上传到S3")
        # 验证上传
        verify_url = f"https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/{merchant_info['folder']}_{merchant_info['placeId']}/{merchant_info['folder']}_static.webp"
        print(f"   URL: {verify_url}")
        return True
    else:
        print(f"❌ 上传失败: {result.stderr}")
        return False

def main():
    print("=== 生成Te'amo静态地图 ===")
    print(f"商户: {merchant_info['name']}")
    print(f"PlaceId: {merchant_info['placeId']}")
    print(f"坐标: {merchant_info['latitude']}, {merchant_info['longitude']}")
    print()
    
    # 生成地图
    webp_file = generate_static_map()
    
    if webp_file:
        # 上传到S3
        if upload_to_s3(webp_file):
            # 清理本地文件
            os.remove(webp_file)
            print("\n✅ 任务完成！")
        else:
            print("\n❌ 上传失败")
    else:
        print("\n❌ 生成地图失败")

if __name__ == "__main__":
    main()