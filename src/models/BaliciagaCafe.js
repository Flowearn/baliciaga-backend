/**
 * BaliciagaCafe 模型
 * 处理咖啡馆数据的标准化，完全基于新版 Google Places API (New) 的原始字段名和数据结构
 */
const { getPhotoUrl } = require('../api/placesApiService');

/**
 * BaliciagaCafe 类
 * 直接消费从新版Google Places API (New)获取的原始地点详情数据
 */
class BaliciagaCafe {
  /**
   * 从新版Google Places API (New) 的原始地点详情数据创建BaliciagaCafe实例
   * @param {Object} newApiPlaceDetailsData - 从 placesApiService.getPlaceDetails() 直接返回的、未经转换的新版API原始地点详情对象。
   * @param {string|Object} regionOrExistingData - 可选，区域信息(字符串)，例如 'canggu'；或者包含现有数据的对象(含可能的instagram字段)
   */
  constructor(newApiPlaceDetailsData, regionOrExistingData = null) {
    // 处理第二个参数，它可能是字符串(region)或对象(existingData)
    let region = null;
    let existingData = {};
    
    if (typeof regionOrExistingData === 'string') {
      region = regionOrExistingData;
    } else if (regionOrExistingData && typeof regionOrExistingData === 'object') {
      existingData = regionOrExistingData;
      region = existingData.region;
    }
    
    this.placeId = newApiPlaceDetailsData.id || existingData.placeId || '';
    this.name = newApiPlaceDetailsData.displayName?.text || existingData.name || '';
    this.address = newApiPlaceDetailsData.formattedAddress || existingData.address || '';
    this.latitude = newApiPlaceDetailsData.location?.latitude || existingData.latitude || 0;
    this.longitude = newApiPlaceDetailsData.location?.longitude || existingData.longitude || 0;
    
    // 照片处理 - 恢复为存储照片URL字符串数组
    this.photos = []; // Initialize as an empty array
    if (newApiPlaceDetailsData.photos && Array.isArray(newApiPlaceDetailsData.photos)) {
      this.photos = newApiPlaceDetailsData.photos.map(photo => {
      if (photo.name) {
          return getPhotoUrl(photo.name, 800); // Generate URL string
        }
        return null; // Handle cases where photo.name might be missing
      }).filter(url => url !== null); // Filter out any null URLs
    } else if (existingData.photos && Array.isArray(existingData.photos)) {
      this.photos = existingData.photos;
    }

    // 营业时间 - 使用新版API的 regularOpeningHours.weekdayDescriptions
    this.openingHours = newApiPlaceDetailsData.regularOpeningHours?.weekdayDescriptions || 
                        existingData.openingHours || [];
    
    // 营业时间 - 结构化时段数据 (用于精确计算营业状态)
    this.openingPeriods = newApiPlaceDetailsData.regularOpeningHours?.periods || 
                          existingData.openingPeriods || [];
    
    // 当前是否开放 - 优先使用 regularOpeningHours.openNow，其次 currentOpeningHours.openNow (来自TextSearch)
    this.isOpenNow = newApiPlaceDetailsData.regularOpeningHours?.openNow ?? 
                     newApiPlaceDetailsData.currentOpeningHours?.openNow ?? 
                     existingData.isOpenNow ?? 
                     false;

    // Instagram 账号信息 - 非API数据，由用户手动提供
    this.instagram = existingData.instagram || '';

    // 网站和电话
    this.website = newApiPlaceDetailsData.websiteUri || existingData.website || '';
    this.phoneNumber = newApiPlaceDetailsData.nationalPhoneNumber || existingData.phoneNumber || '';

    // 价格等级 - 转换新版API的枚举字符串为数字
    this.priceLevel = this._transformPriceLevel(newApiPlaceDetailsData.priceLevel) || 
                      existingData.priceLevel || 0;
    
    // 类型 - 直接使用新版API的 types 数组
    this.types = newApiPlaceDetailsData.types || existingData.types || [];

    // 评分信息
    this.rating = newApiPlaceDetailsData.rating || existingData.rating || 0;
    this.userRatingsTotal = newApiPlaceDetailsData.userRatingCount || existingData.userRatingsTotal || 0;

    // 区域信息 (由调用方提供)
    if (region) {
      this.region = region;
    } else if (newApiPlaceDetailsData.region) { // 如果API数据包含region
      this.region = newApiPlaceDetailsData.region;
    } else if (existingData.region) { // 如果现有数据包含region
      this.region = existingData.region;
    }
    
    // businessStatus might be useful for frontend, e.g. "OPERATIONAL", "CLOSED_TEMPORARILY"
    this.businessStatus = newApiPlaceDetailsData.businessStatus || existingData.businessStatus || '';
    
    // Google Maps URI for direct linking
    this.googleMapsUri = newApiPlaceDetailsData.googleMapsUri || existingData.googleMapsUri || '';
    
    // Static map image from S3
    this.staticMapS3Url = existingData.staticMapS3Url || '';
  }

  /**
   * 将新版Google Places API的priceLevel枚举字符串转换为数字 (0-4)。
   * 例如: "PRICE_LEVEL_FREE" -> 0, "PRICE_LEVEL_INEXPENSIVE" -> 1, ..., "PRICE_LEVEL_VERY_EXPENSIVE" -> 4
   * @param {string} priceLevelString - 来自新版API的priceLevel枚举字符串。
   * @returns {number} - 对应的数字价格等级，未知则返回 -1 或其他默认值。
   */
  _transformPriceLevel(priceLevelString) {
    if (!priceLevelString) return 0; // Default to 0 if undefined or null
    switch (priceLevelString) {
      case 'PRICE_LEVEL_FREE':
        return 0;
      case 'PRICE_LEVEL_INEXPENSIVE':
        return 1;
      case 'PRICE_LEVEL_MODERATE':
        return 2;
      case 'PRICE_LEVEL_EXPENSIVE':
        return 3;
      case 'PRICE_LEVEL_VERY_EXPENSIVE':
        return 4;
      default:
        return 0; // Default for unknown or unhandled values
    }
  }
  
  /**
   * 将对象转换为JSON字符串
   * @returns {string} - JSON字符串
   */
  toJSON() {
    // Return a plain object representation for JSON.stringify
    return {
      placeId: this.placeId,
      name: this.name,
      latitude: this.latitude,
      longitude: this.longitude,
      photos: this.photos,
      openingHours: this.openingHours,
      openingPeriods: this.openingPeriods,
      isOpenNow: this.isOpenNow,
      instagram: this.instagram,
      website: this.website,
      phoneNumber: this.phoneNumber,
      rating: this.rating,
      userRatingsTotal: this.userRatingsTotal,
      region: this.region,
      businessStatus: this.businessStatus,
      googleMapsUri: this.googleMapsUri,
      staticMapS3Url: this.staticMapS3Url
    };
  }
  
  /**
   * 从JSON创建BaliciagaCafe实例
   * @param {string|Object} json - JSON字符串或对象
   * @returns {BaliciagaCafe} - BaliciagaCafe实例
   */
  static fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    // 创建实例时，需要确保构造函数参数匹配。
    // 我们将data作为第二个参数传递，这样它会被视为existingData
    const cafe = new BaliciagaCafe({}, data);
    return cafe;
  }
}

module.exports = BaliciagaCafe; 