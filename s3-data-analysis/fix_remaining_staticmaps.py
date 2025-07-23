#!/usr/bin/env python3
import subprocess
import json

# 手动映射剩余的文件
remaining_mappings = [
    # Bar相关 - 这些实际上已经在正确位置了
    {
        'source': 'bar-image-dev/honeycomb-hookah-eatery/staticmap.webp',
        'target': 'bar-image-dev/honeycomb-hookah-eatery_ChIJN5xTyos50i0RiGBQWrCPinA/honeycomb-hookah-eatery_static.webp',
        'placeId': 'ChIJN5xTyos50i0RiGBQWrCPinA'
    },
    {
        'source': 'bar-image-prod/honeycomb-hookah-eatery/staticmap.webp',
        'target': 'bar-image-prod/honeycomb-hookah-eatery_ChIJN5xTyos50i0RiGBQWrCPinA/honeycomb-hookah-eatery_static.webp',
        'placeId': 'ChIJN5xTyos50i0RiGBQWrCPinA'
    },
    {
        'source': 'bar-image-dev/longtime-modern-asian-restaurant-bar-bali/staticmap.webp',
        'target': 'bar-image-dev/longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ_3U/longtime-modern-asian-restaurant-bar-bali_static.webp',
        'placeId': 'ChIJk4MaNPo50i0R4vfuHDwZ_3U'
    },
    {
        'source': 'bar-image-prod/longtime-modern-asian-restaurant-bar-bali/staticmap.webp',
        'target': 'bar-image-prod/longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ_3U/longtime-modern-asian-restaurant-bar-bali_static.webp',
        'placeId': 'ChIJk4MaNPo50i0R4vfuHDwZ_3U'
    },
    
    # Dining相关
    {
        'source': 'dining-image-dev/m-mason-bar-grill-canggu/staticmap.webp',
        'target': 'dining-image-dev/m-mason-bar-grill-canggu_ChIJBWxfWhA50i0Rzb3CWOIu8tA/m-mason-bar-grill-canggu_static.webp',
        'placeId': 'ChIJBWxfWhA50i0Rzb3CWOIu8tA'
    },
    {
        'source': 'dining-image-prod/m-mason-bar-grill-canggu/staticmap.webp',
        'target': 'dining-image-prod/m-mason-bar-grill-canggu_ChIJBWxfWhA50i0Rzb3CWOIu8tA/m-mason-bar-grill-canggu_static.webp',
        'placeId': 'ChIJBWxfWhA50i0Rzb3CWOIu8tA'
    },
    {
        'source': 'dining-image-dev/luigis-hot-pizza-canggu/staticmap.webp',
        'target': 'dining-image-dev/luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ_ByVyakQkc/luigis-hot-pizza-canggu_static.webp',
        'placeId': 'ChIJV8j8ZXk40i0RQ_ByVyakQkc'
    },
    {
        'source': 'dining-image-prod/luigis-hot-pizza-canggu/staticmap.webp',
        'target': 'dining-image-prod/luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ_ByVyakQkc/luigis-hot-pizza-canggu_static.webp',
        'placeId': 'ChIJV8j8ZXk40i0RQ_ByVyakQkc'
    },
    {
        'source': 'dining-image-dev/la-baracca/staticmap.webp',
        'target': 'dining-image-dev/la-baracca_ChIJj0tR_mpH0i0RP5h_ieNuzAs/la-baracca_static.webp',
        'placeId': 'ChIJj0tR_mpH0i0RP5h_ieNuzAs'
    },
    {
        'source': 'dining-image-prod/la-baracca/staticmap.webp',
        'target': 'dining-image-prod/la-baracca_ChIJj0tR_mpH0i0RP5h_ieNuzAs/la-baracca_static.webp',
        'placeId': 'ChIJj0tR_mpH0i0RP5h_ieNuzAs'
    },
    
    # Cowork相关
    {
        'source': 'cowork-image-dev/setter-coworking-private-offices/staticmap.webp',
        'target': 'cowork-image-dev/setter-coworking-private-offices_ChIJc5xIUklH0i0R-2R5iW_1nx0/setter-coworking-private-offices_static.webp',
        'placeId': 'ChIJc5xIUklH0i0R-2R5iW_1nx0'
    },
    {
        'source': 'cowork-image-prod/setter-coworking-private-offices/staticmap.webp',
        'target': 'cowork-image-prod/setter-coworking-private-offices_ChIJc5xIUklH0i0R-2R5iW_1nx0/setter-coworking-private-offices_static.webp',
        'placeId': 'ChIJc5xIUklH0i0R-2R5iW_1nx0'
    },
    {
        'source': 'cowork-image-dev/puco-rooftop-coworking-space-eatery/staticmap.webp',
        'target': 'cowork-image-dev/puco-rooftop-coworking-space-eatery_ChIJOy4VgxU50i0R8mawVCoFiRw/puco-rooftop-coworking-space-eatery_static.webp',
        'placeId': 'ChIJOy4VgxU50i0R8mawVCoFiRw'
    },
    {
        'source': 'cowork-image-prod/puco-rooftop-coworking-space-eatery/staticmap.webp',
        'target': 'cowork-image-prod/puco-rooftop-coworking-space-eatery_ChIJOy4VgxU50i0R8mawVCoFiRw/puco-rooftop-coworking-space-eatery_static.webp',
        'placeId': 'ChIJOy4VgxU50i0R8mawVCoFiRw'
    },
    {
        'source': 'cowork-image-dev/karya-coworking-bali/staticmap.webp',
        'target': 'cowork-image-dev/karya-coworking-bali_ChIJQeo_7VxH0i0RmnzEcibuEb8/karya-coworking-bali_static.webp',
        'placeId': 'ChIJQeo_7VxH0i0RmnzEcibuEb8'
    },
    {
        'source': 'cowork-image-prod/karya-coworking-bali/staticmap.webp',
        'target': 'cowork-image-prod/karya-coworking-bali_ChIJQeo_7VxH0i0RmnzEcibuEb8/karya-coworking-bali_static.webp',
        'placeId': 'ChIJQeo_7VxH0i0RmnzEcibuEb8'
    },
    
    # Teamo相关 - 需要找到teamo的数据（如果没有就跳过）
    {
        'source': 'dining-image-dev/teamo/staticmap.webp',
        'target': None,  # 待确认
        'skip': True,
        'reason': '未在JSON中找到teamo商户数据'
    },
    {
        'source': 'dining-image-prod/teamo/staticmap.webp',
        'target': None,  # 待确认
        'skip': True,
        'reason': '未在JSON中找到teamo商户数据'
    }
]

def process_remaining_files():
    """处理剩余的静态地图文件"""
    successful = 0
    failed = 0
    skipped = 0
    
    print("处理剩余的静态地图文件...")
    print("=" * 80)
    
    for mapping in remaining_mappings:
        if mapping.get('skip'):
            print(f"⏭️  跳过: {mapping['source']} - {mapping['reason']}")
            skipped += 1
            continue
        
        source_path = f"s3://baliciaga-database/{mapping['source']}"
        target_path = f"s3://baliciaga-database/{mapping['target']}"
        
        # 检查源文件是否存在
        check_cmd = ['aws', 's3', 'ls', source_path]
        result = subprocess.run(check_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            # 源文件不存在，可能已经被处理了
            # 检查目标是否存在
            check_target_cmd = ['aws', 's3', 'ls', target_path]
            target_result = subprocess.run(check_target_cmd, capture_output=True, text=True)
            
            if target_result.returncode == 0:
                print(f"✅ 已存在: {mapping['target']}")
                successful += 1
            else:
                print(f"❌ 源文件和目标文件都不存在: {mapping['source']}")
                failed += 1
            continue
        
        # 复制文件到新位置
        copy_cmd = ['aws', 's3', 'cp', source_path, target_path]
        result = subprocess.run(copy_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ 复制失败: {mapping['source']} -> {mapping['target']}")
            print(f"   错误: {result.stderr}")
            failed += 1
            continue
        
        # 删除源文件
        delete_cmd = ['aws', 's3', 'rm', source_path]
        result = subprocess.run(delete_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"⚠️  复制成功但删除失败: {mapping['source']}")
            successful += 1
        else:
            print(f"✅ 成功迁移: {mapping['source']} -> {mapping['target']}")
            successful += 1
    
    print("\n" + "=" * 80)
    print(f"处理完成！")
    print(f"✅ 成功: {successful} 个文件")
    print(f"❌ 失败: {failed} 个文件")
    print(f"⏭️  跳过: {skipped} 个文件")
    
    # 如果有teamo的文件，提示需要手动处理
    if skipped > 0:
        print("\n注意: teamo商户的静态地图需要手动处理，因为在JSON文件中未找到对应数据")

if __name__ == "__main__":
    process_remaining_files()