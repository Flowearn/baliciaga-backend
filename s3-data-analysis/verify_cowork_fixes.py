#!/usr/bin/env python3
import subprocess
import json

def verify_url_accessible(url):
    """验证URL是否可访问"""
    cmd = ['curl', '-I', '-s', url]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return 'HTTP/2 200' in result.stdout or 'HTTP/1.1 200' in result.stdout

def verify_environment(env_name, json_file_path):
    """验证环境的修复结果"""
    print(f"\n{'='*60}")
    print(f"验证 {env_name} 环境")
    print(f"{'='*60}")
    
    # 读取JSON文件
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    success_count = 0
    total_count = 0
    
    for merchant in data:
        merchant_name = merchant.get('name', 'Unknown')
        static_url = merchant.get('staticMapS3Url', '')
        
        if static_url:
            total_count += 1
            accessible = verify_url_accessible(static_url)
            
            if accessible:
                success_count += 1
                print(f"✅ {merchant_name}")
                print(f"   URL: {static_url}")
            else:
                print(f"❌ {merchant_name}")
                print(f"   URL: {static_url}")
    
    print(f"\n结果: {success_count}/{total_count} 个URL可访问")
    
    # 检查URL格式
    print("\nURL格式检查:")
    correct_format = 0
    for merchant in data:
        static_url = merchant.get('staticMapS3Url', '')
        if static_url:
            # 应该使用正确的CloudFront域名和webp格式
            if 'd2cmxnft4myi1k.cloudfront.net' in static_url and static_url.endswith('.webp'):
                correct_format += 1
    
    print(f"✅ 正确格式: {correct_format}/{total_count}")
    
    return success_count, total_count

def main():
    print("=== 验证cowork分类修复结果 ===")
    
    # 验证dev环境
    dev_success, dev_total = verify_environment(
        'DEV',
        '/Users/troy/开发文档/Baliciaga/backend/scripts/cowork-dev_updated.json'
    )
    
    # 验证prod环境
    prod_success, prod_total = verify_environment(
        'PROD',
        '/Users/troy/开发文档/Baliciaga/backend/scripts/cowork_updated.json'
    )
    
    # 总结
    print("\n" + "="*60)
    print("总结")
    print("="*60)
    print(f"Dev环境: {dev_success}/{dev_total} 个静态地图可访问")
    print(f"Prod环境: {prod_success}/{prod_total} 个静态地图可访问")
    
    if dev_success == dev_total and prod_success == prod_total:
        print("\n🎉 所有修复已成功完成！")
    else:
        print("\n⚠️  仍有部分URL无法访问")

if __name__ == "__main__":
    main()