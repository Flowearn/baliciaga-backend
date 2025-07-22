#!/bin/bash
# CCt#33: 上传真实静态地图到PROD并同步到DEV

echo '步骤1: 上传新生成的静态地图到PROD相册'

echo '上传 Hippie Fish Pererenan Beach...'
aws s3 cp hippie-fish-pererenan-beach_staticmap.webp s3://baliciaga-database/bar-image-prod/hippie-fish-pererenan-beach/staticmap.png
echo '  ✓ 完成'

echo '上传 Miss Fish Bali...'
aws s3 cp miss-fish-bali_staticmap.webp s3://baliciaga-database/bar-image-prod/miss-fish-bali/staticmap.png
echo '  ✓ 完成'

echo '\n步骤2: 全量同步PROD到DEV相册'
echo '开始同步...'
aws s3 sync s3://baliciaga-database/bar-image-prod/ s3://baliciaga-database/bar-image-dev/
echo '✓ 同步完成！'
