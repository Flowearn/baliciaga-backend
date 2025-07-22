#!/usr/bin/env python3
import json
import re
from collections import defaultdict

# 读取JSON文件
with open('backup/cafes.json', 'r') as f:
    data = json.load(f)

# 分析图片URL
image_paths = defaultdict(list)
total_images = 0

for cafe in data:
    if 'photos' in cafe and cafe['photos']:
        for photo_url in cafe['photos']:
            total_images += 1
            # 提取路径信息
            match = re.search(r'cloudfront\.net/(.+?)$', photo_url)
            if match:
                path = match.group(1)
                # 提取目录结构
                parts = path.split('/')
                if len(parts) >= 2:
                    directory = parts[0]
                    subdirectory = parts[1]
                    image_paths[f"{directory}/{subdirectory}"].append(photo_url)

print(f"Total cafes: {len(data)}")
print(f"Total images: {total_images}")
print(f"\nUnique directory patterns found:")
for pattern, urls in sorted(image_paths.items()):
    print(f"  {pattern}: {len(urls)} images")

# 输出前5个示例URL
print(f"\nFirst 5 example URLs:")
count = 0
for cafe in data:
    if 'photos' in cafe and cafe['photos']:
        for photo_url in cafe['photos']:
            print(f"  {photo_url}")
            count += 1
            if count >= 5:
                break
    if count >= 5:
        break