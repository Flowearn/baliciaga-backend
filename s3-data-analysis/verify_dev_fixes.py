#!/usr/bin/env python3
import subprocess
import json

# 验证修复的6个路径不匹配问题
fixes_to_verify = [
    {
        'category': 'dining-image-dev',
        'merchant': 'La Baracca Bali (Seminyak)',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/la-baracca-bali-seminyak_ChIJj0tR_mpH0i0RP5h_ieNuzAs/la-baracca-bali-seminyak_static.webp'
    },
    {
        'category': 'bar-image-dev',
        'merchant': 'The Barn Pub & Kitchen',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/bar-image-dev/the-barn-gastropub_ChIJe7KSn4dH0i0RsfzzpwFhwpQ/the-barn-gastropub_static.webp'
    },
    {
        'category': 'bar-image-dev', 
        'merchant': 'Potato Head Beach Club',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/bar-image-dev/potato-head-beach-club_ChIJ_XZL_xFH0i0RTo0EWBqsnRs/potato-head-beach-club_static.webp'
    },
    {
        'category': 'bar-image-dev',
        'merchant': 'The Lawn Canggu Beach Club',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/bar-image-dev/the-lawn-canggu-beach-club_ChIJiQdg1YdH0i0R8ANUMzZizN0/the-lawn-canggu-beach-club_static.webp'
    },
    {
        'category': 'cowork-image-dev',
        'merchant': 'Ducat Space',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/cowork-image-dev/ducat-space-cafe-offices-co-working-meeting-rooms_ChIJCd9etMVH0i0RNkfYsSkhmZg/ducat-space-cafe-offices-co-working-meeting-rooms_static.webp'
    },
    {
        'category': 'cowork-image-dev',
        'merchant': 'Karya Co-working Bali',
        'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/cowork-image-dev/karya-co-working-bali_ChIJQeo_7VxH0i0RmnzEcibuEb8/karya-co-working-bali_static.webp'
    }
]

# 验证新创建的Te'amo静态地图
teamo_check = {
    'category': 'dining-image-dev',
    'merchant': "Te'amo",
    'expected_url': 'https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/teamo_ChIJk3IjCVU50i0RDCA0u-V4WAs/teamo_static.webp'
}

# 验证已删除的旧格式文件
old_file_check = {
    'path': 's3://baliciaga-database/dining-image-dev/teamo/staticmap.webp',
    'should_exist': False
}

def check_url_accessible(url):
    """检查URL是否可访问"""
    cmd = ['curl', '-I', '-s', url]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return 'HTTP/2 200' in result.stdout or 'HTTP/1.1 200' in result.stdout

def check_s3_file_exists(s3_path):
    """检查S3文件是否存在"""
    cmd = ['aws', 's3', 'ls', s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

print("验证dev环境修复结果")
print("=" * 80)

# 1. 验证路径修复
print("\n1. 验证路径修复（6个）：")
success_count = 0
for fix in fixes_to_verify:
    accessible = check_url_accessible(fix['expected_url'])
    status = "✅" if accessible else "❌"
    print(f"{status} {fix['merchant']}")
    if accessible:
        success_count += 1
    else:
        print(f"   期待URL: {fix['expected_url']}")

print(f"\n路径修复成功: {success_count}/{len(fixes_to_verify)}")

# 2. 验证Te'amo静态地图
print("\n2. 验证新创建的Te'amo静态地图：")
teamo_accessible = check_url_accessible(teamo_check['expected_url'])
status = "✅" if teamo_accessible else "❌"
print(f"{status} {teamo_check['merchant']}")
if not teamo_accessible:
    print(f"   期待URL: {teamo_check['expected_url']}")

# 3. 验证旧文件删除
print("\n3. 验证旧格式文件删除：")
old_file_exists = check_s3_file_exists(old_file_check['path'])
status = "✅" if not old_file_exists else "❌"
print(f"{status} 旧文件已删除: {old_file_check['path']}")

# 总结
print("\n" + "=" * 80)
print("总结：")
total_checks = len(fixes_to_verify) + 2  # 6个路径修复 + 1个新文件 + 1个删除
passed_checks = success_count + (1 if teamo_accessible else 0) + (1 if not old_file_exists else 0)
print(f"✅ 通过验证: {passed_checks}/{total_checks}")

if passed_checks == total_checks:
    print("\n🎉 所有dev环境数据不一致问题已成功修复！")
else:
    print(f"\n⚠️  还有 {total_checks - passed_checks} 个问题需要处理")