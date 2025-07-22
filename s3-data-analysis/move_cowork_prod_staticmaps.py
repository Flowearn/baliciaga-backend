#!/usr/bin/env python3
import subprocess

# 定义需要移动的文件映射
moves = [
    {
        'merchant': 'B Work Bali',
        'source': 's3://baliciaga-database/cowork-image-prod/b-work-bali_ChIJ6fBvIpg50i0R8764BCFFN60/b-work-bali_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/b-work-bali/staticmap.webp'
    },
    {
        'merchant': 'Ducat Space',
        'source': 's3://baliciaga-database/cowork-image-prod/ducat-space_ChIJCd9etMVH0i0RNkfYsSkhmZg/ducat-space_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/ducat-space/staticmap.webp'
    },
    {
        'merchant': 'Genesis Creative Centre',
        'source': 's3://baliciaga-database/cowork-image-prod/genesis-creative-centre_ChIJSW0wnj9H0i0RBi6QO_C6M_o/genesis-creative-centre_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/genesis-creative-centre/staticmap.webp'
    },
    {
        'merchant': 'Karya Co-working Bali',
        'source': 's3://baliciaga-database/cowork-image-prod/karya-coworking-bali_ChIJQeo_7VxH0i0RmnzEcibuEb8/karya-coworking-bali_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/karya-coworking-bali/staticmap.webp'
    },
    {
        'merchant': 'Nebula Entrepreneur Coworking Space',
        'source': 's3://baliciaga-database/cowork-image-prod/nebula-entrepreneur-coworking-space_ChIJY1RJ9Zs50i0R5x8HN0qZa9g/nebula-entrepreneur-coworking-space_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/nebula-entrepreneur-coworking-space/staticmap.webp'
    },
    {
        'merchant': 'PUCO Rooftop Coworking space & Eatery',
        'source': 's3://baliciaga-database/cowork-image-prod/puco-rooftop-coworking-space-eatery_ChIJOy4VgxU50i0R8mawVCoFiRw/puco-rooftop-coworking-space-eatery_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/puco-rooftop-coworking-space-eatery/staticmap.webp'
    },
    {
        'merchant': 'SETTER Coworking & Private Offices',
        'source': 's3://baliciaga-database/cowork-image-prod/setter-coworking-private-offices_ChIJc5xIUklH0i0R-2R5iW_1nx0/setter-coworking-private-offices_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/setter-coworking-private-offices/staticmap.webp'
    },
    {
        'merchant': 'Tropical Nomad Coworking Space',
        'source': 's3://baliciaga-database/cowork-image-prod/tropical-nomad-coworking-space_ChIJvf4Cf7pF0i0RGVMhsUCiNBY/tropical-nomad-coworking-space_static.webp',
        'target': 's3://baliciaga-database/cowork-image-prod/tropical-nomad-coworking-space/staticmap.webp'
    }
]

print("=== 移动cowork-prod静态地图到商户主相册 ===")

success_count = 0
for move in moves:
    print(f"\n处理: {move['merchant']}")
    
    # 执行移动操作
    cmd = ['aws', 's3', 'mv', move['source'], move['target']]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"  ✅ 成功移动到商户主相册")
        success_count += 1
    else:
        # 检查目标文件是否已存在
        check_cmd = ['aws', 's3', 'ls', move['target']]
        check_result = subprocess.run(check_cmd, capture_output=True, text=True)
        
        if check_result.returncode == 0:
            print(f"  ✅ 文件已在正确位置")
            success_count += 1
        else:
            print(f"  ❌ 移动失败: {result.stderr}")

print(f"\n总结: 成功处理 {success_count}/{len(moves)} 个文件")