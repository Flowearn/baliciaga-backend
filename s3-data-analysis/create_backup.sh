#!/bin/bash

# 创建备份目录
echo "Creating backup directory..."
mkdir -p backup

# 下载并备份JSON文件
echo "Downloading cafes.json and cafes-dev.json from S3..."
aws s3 cp s3://baliciaga-database/data/cafes.json ./backup/
aws s3 cp s3://baliciaga-database/data/cafes-dev.json ./backup/

echo "Backup completed!"
ls -la ./backup/