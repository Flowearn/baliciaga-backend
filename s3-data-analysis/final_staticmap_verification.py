#!/usr/bin/env python3
import subprocess
import random

# 测试样本
test_samples = [
    # Bar
    ('bar-image-dev', 'platonic_ChIJkYxdu3E50i0RrFJjPHk8LqI', 'platonic_static.webp'),
    ('bar-image-dev', 'honeycomb-hookah-eatery_ChIJN5xTyos50i0RiGBQWrCPinA', 'honeycomb-hookah-eatery_static.webp'),
    ('bar-image-prod', 'longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ_3U', 'longtime-modern-asian-restaurant-bar-bali_static.webp'),
    
    # Dining
    ('dining-image-dev', 'm-mason-bar-grill-canggu_ChIJBWxfWhA50i0Rzb3CWOIu8tA', 'm-mason-bar-grill-canggu_static.webp'),
    ('dining-image-prod', 'luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ_ByVyakQkc', 'luigis-hot-pizza-canggu_static.webp'),
    ('dining-image-dev', 'la-baracca_ChIJj0tR_mpH0i0RP5h_ieNuzAs', 'la-baracca_static.webp'),
    
    # Cowork
    ('cowork-image-dev', 'setter-coworking-private-offices_ChIJc5xIUklH0i0R-2R5iW_1nx0', 'setter-coworking-private-offices_static.webp'),
    ('cowork-image-prod', 'puco-rooftop-coworking-space-eatery_ChIJOy4VgxU50i0R8mawVCoFiRw', 'puco-rooftop-coworking-space-eatery_static.webp'),
    
    # Cafe
    ('cafe-image-dev', 'amolas-cafe_ChIJD63X4IU50i0RFkjm_Q5AwGs', 'amolas-cafe_static.webp'),
]

def verify_staticmap_access():
    """验证静态地图文件的可访问性"""
    print("最终验证：测试静态地图文件的可访问性")
    print("=" * 80)
    
    success_count = 0
    fail_count = 0
    
    for album, folder, filename in test_samples:
        url = f"https://d2cmxnft4myi1k.cloudfront.net/{album}/{folder}/{filename}"
        
        # 测试HTTP响应
        cmd = ['curl', '-I', '-s', url]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if 'HTTP/2 200' in result.stdout:
            print(f"✅ {album}/{folder}/{filename}")
            success_count += 1
        else:
            print(f"❌ {album}/{folder}/{filename}")
            print(f"   URL: {url}")
            # 打印响应头的前3行
            headers = result.stdout.split('\n')[:3]
            for header in headers:
                if header.strip():
                    print(f"   {header}")
            fail_count += 1
    
    print("\n" + "=" * 80)
    print(f"验证结果：")
    print(f"✅ 成功: {success_count}/{len(test_samples)}")
    print(f"❌ 失败: {fail_count}/{len(test_samples)}")
    
    if fail_count == 0:
        print("\n🎉 所有测试的静态地图文件都可以正常访问！")
    else:
        print("\n⚠️  部分文件无法访问，请检查上述失败的URL")
    
    # 列出仍然存在的旧格式文件
    print("\n检查是否还有旧格式的staticmap文件...")
    
    albums = ['cafe-image-dev', 'cafe-image-prod', 'dining-image-dev', 'dining-image-prod', 
              'bar-image-dev', 'bar-image-prod', 'cowork-image-dev', 'cowork-image-prod']
    
    old_format_count = 0
    for album in albums:
        cmd = ['aws', 's3', 'ls', f's3://baliciaga-database/{album}/', '--recursive']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        for line in result.stdout.splitlines():
            if '/staticmap.webp' in line or '/staticmap.png' in line:
                old_format_count += 1
                print(f"  旧格式: {line.split()[-1]}")
    
    if old_format_count == 0:
        print("  ✅ 没有发现旧格式的staticmap文件")
    else:
        print(f"  ⚠️  发现 {old_format_count} 个旧格式文件")

if __name__ == "__main__":
    verify_staticmap_access()