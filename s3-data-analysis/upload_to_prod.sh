#!/bin/bash
# CCt#31: 上传静态地图到PROD相册

echo '步骤1: 上传新生成的静态地图到PROD相册'

echo '上传 Hippie Fish Pererenan Beach...'
aws s3 cp hippie-fish-pererenan-beach_staticmap.png s3://baliciaga-database/bar-image-prod/hippie-fish-pererenan-beach/staticmap.png

echo '上传 Miss Fish Bali...'
aws s3 cp miss-fish-bali_staticmap.png s3://baliciaga-database/bar-image-prod/miss-fish-bali/staticmap.png

echo '\n步骤2: 全量同步PROD到DEV相册'
echo '开始同步...'
aws s3 sync s3://baliciaga-database/bar-image-prod/ s3://baliciaga-database/bar-image-dev/
echo '同步完成！'
