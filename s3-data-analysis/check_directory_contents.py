#!/usr/bin/env python3
import subprocess

def list_directory_contents(s3_path):
    """列出S3目录的内容"""
    cmd = ['aws', 's3', 'ls', s3_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()
    else:
        return f"Error: {result.stderr}"

# 检查几个例子
test_dirs = [
    ('s3://baliciaga-database/bar-image-dev/Honeycomb Hookah & Eatery/', 'Original (with spaces)'),
    ('s3://baliciaga-database/bar-image-dev/honeycomb-hookah-eatery/', 'Kebab-case version'),
    ('s3://baliciaga-database/bar-image-dev/PLATONIC/', 'Original (uppercase)'),
    ('s3://baliciaga-database/bar-image-dev/platonic/', 'Kebab-case version'),
]

for dir_path, desc in test_dirs:
    print(f"\n{desc}: {dir_path}")
    print("-" * 60)
    contents = list_directory_contents(dir_path)
    if contents:
        print(contents)
    else:
        print("Directory is empty or doesn't exist")