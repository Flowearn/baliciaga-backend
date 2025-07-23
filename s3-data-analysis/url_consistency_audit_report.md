# JSON文件URL一致性审计报告

## 审计时间：2025-07-09

## 总体结果

- 审计文件总数：8
- ✅ 一致的文件：4
- ❌ 不一致的文件：4

## 详细审计结果

### cafes-dev.json

- **预期路径**: `cafe-image-dev`
- **商户总数**: 38
- **图片URL总数**: 231
- **静态地图URL总数**: 38
- **结果**: ✅ 一致

### cafes.json

- **预期路径**: `cafe-image-prod`
- **商户总数**: 38
- **图片URL总数**: 231
- **静态地图URL总数**: 38
- **结果**: ✅ 一致

### dining-dev.json

- **预期路径**: `dining-image-dev`
- **商户总数**: 20
- **图片URL总数**: 161
- **静态地图URL总数**: 20
- **结果**: ❌ 不一致（发现 25 个错误）

**错误的URL列表**:

1. **商户**: Lusa By/Suka
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_1.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Lusa By/Suka
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_3.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Lusa By/Suka
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_4.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Lusa By/Suka
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_2.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Lusa By/Suka
   - **字段**: photos[4]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_a.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Lusa By/Suka
   - **字段**: staticMapS3Url
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/lusa-bysuka_static.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Bokashi Berawa
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_a.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Bokashi Berawa
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_b.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Bokashi Berawa
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_c.webp`
   - **应包含路径**: `dining-image-dev`

1. **商户**: Bokashi Berawa
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_d.webp`
   - **应包含路径**: `dining-image-dev`

... 还有 15 个错误


### dining.json

- **预期路径**: `dining-image-prod`
- **商户总数**: 20
- **图片URL总数**: 161
- **静态地图URL总数**: 20
- **结果**: ❌ 不一致（发现 25 个错误）

**错误的URL列表**:

1. **商户**: Lusa By/Suka
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_1.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Lusa By/Suka
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_3.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Lusa By/Suka
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_4.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Lusa By/Suka
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_2.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Lusa By/Suka
   - **字段**: photos[4]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/photo_a.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Lusa By/Suka
   - **字段**: staticMapS3Url
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/lusa-bysuka_ChIJcYpksxVH0i0RCDMFafUy5N4/lusa-bysuka_static.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Bokashi Berawa
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_a.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Bokashi Berawa
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_b.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Bokashi Berawa
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_c.webp`
   - **应包含路径**: `dining-image-prod`

1. **商户**: Bokashi Berawa
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/image-v2/bokashi-berawa_ChIJqdO8SytH0i0RkcWicB2oqxQ/photo_d.webp`
   - **应包含路径**: `dining-image-prod`

... 还有 15 个错误


### bars-dev.json

- **预期路径**: `bar-image-dev`
- **商户总数**: 14
- **图片URL总数**: 106
- **静态地图URL总数**: 14
- **结果**: ❌ 不一致（发现 85 个错误）

**错误的URL列表**:

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_g.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_h.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_i.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_a.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[4]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_b.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[5]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_c.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[6]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_d.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[7]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_e.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: Honeycomb Hookah & Eatery
   - **字段**: photos[8]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/honeycomb-hookah-eatery/photo_f.webp`
   - **应包含路径**: `bar-image-dev`

1. **商户**: LONGTIME | Modern Asian Restaurant & Bar Bali
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/bar-image/longtime-modern-asian-restaurant-bar-bali/photo_a.webp`
   - **应包含路径**: `bar-image-dev`

... 还有 75 个错误


### bars.json

- **预期路径**: `bar-image-prod`
- **商户总数**: 14
- **图片URL总数**: 106
- **静态地图URL总数**: 14
- **结果**: ❌ 不一致（发现 27 个错误）

**错误的URL列表**:

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[0]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_a.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[1]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_b.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[2]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_c.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[3]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_d.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[4]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_e.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[5]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_f.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[6]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_g.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[7]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_h.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[8]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_i.webp`
   - **应包含路径**: `bar-image-prod`

1. **商户**: Hippie Fish Pererenan Beach
   - **字段**: photos[9]
   - **错误URL**: `https://d2cmxnft4myi1k.cloudfront.net/dining-image-dev/hippie-fish-pererenan-beach/photo_j.webp`
   - **应包含路径**: `bar-image-prod`

... 还有 17 个错误


### cowork-dev.json

- **预期路径**: `cowork-image-dev`
- **商户总数**: 8
- **图片URL总数**: 48
- **静态地图URL总数**: 8
- **结果**: ✅ 一致

### cowork.json

- **预期路径**: `cowork-image-prod`
- **商户总数**: 8
- **图片URL总数**: 48
- **静态地图URL总数**: 8
- **结果**: ✅ 一致
