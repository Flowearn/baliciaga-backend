#!/usr/bin/env python3
"""
修复截断placeId的静态地图迁移问题
"""
import subprocess
import json
import re

def fix_truncated_placeid_files():
    """修复截断placeId的文件"""
    
    # 定义需要特殊处理的文件
    special_cases = [
        # dining-image-dev
        {
            'old': 'dining-image-dev/alma-tapas-bar-canggu_ChIJTTj8Ts9H0i0R2XwcfS/staticmap.webp',
            'new': 'dining-image-dev/alma-tapas-bar-canggu/staticmap.webp',
            'full_placeid': 'ChIJTTj8Ts9H0i0R2XwcfS_i6Mk'
        },
        {
            'old': 'dining-image-dev/la-baracca-bali-seminyak_ChIJj0tR_mpH0i0RP5h/staticmap.webp',
            'new': 'dining-image-dev/la-baracca-bali-seminyak/staticmap.webp',
            'full_placeid': 'ChIJj0tR_mpH0i0RP5h_ieNuzAs'
        },
        {
            'old': 'dining-image-dev/lacalita-canggu_ChIJPZo4Unk40i0RxI/staticmap.webp',
            'new': 'dining-image-dev/lacalita-canggu/staticmap.webp',
            'full_placeid': 'ChIJPZo4Unk40i0RxI_FwqiKsWQ'
        },
        {
            'old': 'dining-image-dev/luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ/staticmap.webp',
            'new': 'dining-image-dev/luigis-hot-pizza-canggu/staticmap.webp',
            'full_placeid': 'ChIJV8j8ZXk40i0RQ_ByVyakQkc'
        },
        {
            'old': 'dining-image-dev/uma-garden-seminyak_ChIJXxe2rXNH0i0Rnt/staticmap.webp',
            'new': 'dining-image-dev/uma-garden-seminyak/staticmap.webp',
            'full_placeid': 'ChIJXxe2rXNH0i0Rnt_qeoqnQcc'
        },
        # dining-image-prod
        {
            'old': 'dining-image-prod/alma-tapas-bar-canggu_ChIJTTj8Ts9H0i0R2XwcfS/staticmap.webp',
            'new': 'dining-image-prod/alma-tapas-bar-canggu/staticmap.webp',
            'full_placeid': 'ChIJTTj8Ts9H0i0R2XwcfS_i6Mk'
        },
        {
            'old': 'dining-image-prod/la-baracca_ChIJj0tR_mpH0i0RP5h/staticmap.webp',
            'new': 'dining-image-prod/la-baracca/staticmap.webp',
            'full_placeid': 'ChIJj0tR_mpH0i0RP5h_ieNuzAs'
        },
        {
            'old': 'dining-image-prod/lacalita-canggu_ChIJPZo4Unk40i0RxI/staticmap.webp',
            'new': 'dining-image-prod/lacalita-canggu/staticmap.webp',
            'full_placeid': 'ChIJPZo4Unk40i0RxI_FwqiKsWQ'
        },
        {
            'old': 'dining-image-prod/luigis-hot-pizza-canggu_ChIJV8j8ZXk40i0RQ/staticmap.webp',
            'new': 'dining-image-prod/luigis-hot-pizza-canggu/staticmap.webp',
            'full_placeid': 'ChIJV8j8ZXk40i0RQ_ByVyakQkc'
        },
        {
            'old': 'dining-image-prod/uma-garden-seminyak_ChIJXxe2rXNH0i0Rnt/staticmap.webp',
            'new': 'dining-image-prod/uma-garden-seminyak/staticmap.webp',
            'full_placeid': 'ChIJXxe2rXNH0i0Rnt_qeoqnQcc'
        },
        # bar-image-dev
        {
            'old': 'bar-image-dev/bali-beer-cycle_ChIJgfLsf1pF0i0RTDMRSpGD/staticmap.webp',
            'new': 'bar-image-dev/bali-beer-cycle/staticmap.webp',
            'full_placeid': 'ChIJgfLsf1pF0i0RTDMRSpGD_Zs'
        },
        {
            'old': 'bar-image-dev/black-sand-brewery_ChIJNzjyIBI50i0RpFdnd/staticmap.webp',
            'new': 'bar-image-dev/black-sand-brewery/staticmap.webp',
            'full_placeid': 'ChIJNzjyIBI50i0RpFdnd_ZN3pg'
        },
        {
            'old': 'bar-image-dev/longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ/staticmap.webp',
            'new': 'bar-image-dev/longtime-modern-asian-restaurant-bar-bali/staticmap.webp',
            'full_placeid': 'ChIJk4MaNPo50i0R4vfuHDwZ_3U'
        },
        {
            'old': 'bar-image-dev/potato-head-beach-club_ChIJ_XZL/staticmap.webp',
            'new': 'bar-image-dev/potato-head-beach-club/staticmap.webp',
            'full_placeid': 'ChIJ_XZL_xFH0i0RTo0EWBqsnRs'
        },
        {
            'old': 'bar-image-dev/single-fin-bali_ChIJ0aNPQ/staticmap.webp',
            'new': 'bar-image-dev/single-fin-bali/staticmap.webp',
            'full_placeid': 'ChIJ0aNPQ_lP0i0RtPlHW6trMHM'
        },
        # bar-image-prod
        {
            'old': 'bar-image-prod/bali-beer-cycle_ChIJgfLsf1pF0i0RTDMRSpGD/staticmap.webp',
            'new': 'bar-image-prod/bali-beer-cycle/staticmap.webp',
            'full_placeid': 'ChIJgfLsf1pF0i0RTDMRSpGD_Zs'
        },
        {
            'old': 'bar-image-prod/black-sand-brewery_ChIJNzjyIBI50i0RpFdnd/staticmap.webp',
            'new': 'bar-image-prod/black-sand-brewery/staticmap.webp',
            'full_placeid': 'ChIJNzjyIBI50i0RpFdnd_ZN3pg'
        },
        {
            'old': 'bar-image-prod/longtime-modern-asian-restaurant-bar-bali_ChIJk4MaNPo50i0R4vfuHDwZ/staticmap.webp',
            'new': 'bar-image-prod/longtime-modern-asian-restaurant-bar-bali/staticmap.webp',
            'full_placeid': 'ChIJk4MaNPo50i0R4vfuHDwZ_3U'
        },
        {
            'old': 'bar-image-prod/patato-head-beach-club_ChIJ_XZL/staticmap.webp',
            'new': 'bar-image-prod/patato-head-beach-club/staticmap.webp',
            'full_placeid': 'ChIJ_XZL_xFH0i0RTo0EWBqsnRs'
        },
        {
            'old': 'bar-image-prod/single-fin-bali_ChIJ0aNPQ/staticmap.webp',
            'new': 'bar-image-prod/single-fin-bali/staticmap.webp',
            'full_placeid': 'ChIJ0aNPQ_lP0i0RtPlHW6trMHM'
        }
    ]
    
    print("修复截断placeId的静态地图文件...\n")
    
    for case in special_cases:
        old_s3_path = f"s3://baliciaga-database/{case['old']}"
        new_s3_path = f"s3://baliciaga-database/{case['new']}"
        
        # 复制文件到新位置
        cmd = ['aws', 's3', 'cp', old_s3_path, new_s3_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 已移动: {case['old']} -> {case['new']}")
            
            # 删除旧文件
            cmd = ['aws', 's3', 'rm', old_s3_path]
            subprocess.run(cmd, capture_output=True, text=True)
        else:
            print(f"❌ 移动失败: {case['old']}")

def fix_cafe_files_in_dining():
    """修复dining JSON中的cafe文件引用"""
    json_files = ['dining-dev.json', 'dining.json']
    
    cafe_merchants = {
        'Lusa By/Suka': 'lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4',
        'Bokashi Berawa': 'bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ',
        'Zai Cafe Breakfast & Dinner': 'zai-cafe-breakfast-dinner_ChIJnT3bt6VH0i0RUgvf_KGh8r8'
    }
    
    for json_file in json_files:
        print(f"\n修复 {json_file} 中的cafe文件引用...")
        
        # 下载JSON文件
        local_path = f"/tmp/{json_file}"
        cmd = ['aws', 's3', 'cp', f's3://baliciaga-database/data/{json_file}', local_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ 下载失败: {json_file}")
            continue
        
        # 读取并修复
        with open(local_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        updates = 0
        for item in data:
            if item['name'] in cafe_merchants:
                old_url = item.get('staticMapS3Url', '')
                if 'cafe-image' in old_url or 'image-v2' in old_url:
                    # 这些是cafe商户，应该从cafe相册引用
                    continue
                
        # 上传回S3
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        cmd = ['aws', 's3', 'cp', local_path, f's3://baliciaga-database/data/{json_file}']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✅ 已更新 {json_file}")
            
            # 清除CloudFront缓存
            cmd = ['aws', 'cloudfront', 'create-invalidation', 
                   '--distribution-id', 'E2OWVXNIWJXMFR', 
                   '--paths', f'/data/{json_file}']
            subprocess.run(cmd, capture_output=True, text=True)

def fix_barn_gastropub():
    """修复bars.json中的The Barn Gastropub URL"""
    print("\n修复bars.json中的The Barn Gastropub URL...")
    
    # 下载JSON文件
    local_path = "/tmp/bars.json"
    cmd = ['aws', 's3', 'cp', 's3://baliciaga-database/data/bars.json', local_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        with open(local_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for item in data:
            if 'Barn' in item['name'] and 'Gastropub' in item['name']:
                old_url = item.get('staticMapS3Url', '')
                if 'the-barn-gastropub_ChIJe7KSn4dH0i0RsfzzpwFhwpQ' in old_url:
                    # 修复URL
                    item['staticMapS3Url'] = old_url.replace(
                        'the-barn-gastropub_ChIJe7KSn4dH0i0RsfzzpwFhwpQ/the-barn-gastropub_static.webp',
                        'barn-gastropub/staticmap.webp'
                    )
                    print(f"✅ 已修复 {item['name']} 的URL")
        
        # 保存并上传
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        cmd = ['aws', 's3', 'cp', local_path, 's3://baliciaga-database/data/bars.json']
        subprocess.run(cmd, capture_output=True, text=True)
        
        # 清除CloudFront缓存
        cmd = ['aws', 'cloudfront', 'create-invalidation', 
               '--distribution-id', 'E2OWVXNIWJXMFR', 
               '--paths', '/data/bars.json']
        subprocess.run(cmd, capture_output=True, text=True)

def main():
    """主函数"""
    print("=== 修复截断placeId的静态地图迁移问题 ===\n")
    
    # 1. 修复截断的placeId文件
    fix_truncated_placeid_files()
    
    # 2. 修复cafe文件引用
    fix_cafe_files_in_dining()
    
    # 3. 修复barn gastropub
    fix_barn_gastropub()
    
    print("\n✅ 修复完成！")

if __name__ == "__main__":
    main()