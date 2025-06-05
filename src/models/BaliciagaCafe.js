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
    this.name = newApiPlaceDetailsData.displayName?.text || newApiPlaceDetailsData.displayName || existingData.name || '';
    
    // Location coordinates - ensure proper mapping from API location field
    this.latitude = newApiPlaceDetailsData.location?.latitude || existingData.latitude || 0;
    this.longitude = newApiPlaceDetailsData.location?.longitude || existingData.longitude || 0;
    
    // Photos - EXCLUSIVELY from existingData (S3 WebP URLs), never from Google API
    this.photos = (existingData.photos && Array.isArray(existingData.photos)) ? existingData.photos : [];
    
    // Store Google photo references separately (not for JSON output)
    this.googleApiPhotoReferences = newApiPlaceDetailsData.photos || [];

    // Opening hours - use regularOpeningHours from new API
    this.openingHours = newApiPlaceDetailsData.regularOpeningHours?.weekdayDescriptions || 
                        existingData.openingHours || [];
    
    // Opening periods - structured time data for precise status calculation
    this.openingPeriods = newApiPlaceDetailsData.regularOpeningHours?.periods || 
                          existingData.openingPeriods || [];
    
    // Current open status
    this.isOpenNow = newApiPlaceDetailsData.regularOpeningHours?.openNow ?? 
                     newApiPlaceDetailsData.currentOpeningHours?.openNow ?? 
                     existingData.isOpenNow ?? 
                     false;

    // Website and contact information - use correct API field names
    this.website = newApiPlaceDetailsData.websiteUri || existingData.website || '';
    this.phoneNumber = newApiPlaceDetailsData.nationalPhoneNumber || existingData.phoneNumber || '';

    // Rating information - use correct API field name
    this.rating = newApiPlaceDetailsData.rating || existingData.rating || 0;
    this.userRatingsTotal = newApiPlaceDetailsData.userRatingCount || existingData.userRatingsTotal || 0;

    // Business status
    this.businessStatus = newApiPlaceDetailsData.businessStatus || existingData.businessStatus || '';
    
    // Google Maps URI for direct linking
    this.googleMapsUri = newApiPlaceDetailsData.googleMapsUri || existingData.googleMapsUri || '';
    
    // Static map image from S3
    this.staticMapS3Url = existingData.staticMapS3Url || '';
    
    // NEW ATTRIBUTES - Handle the three new boolean fields from 13-field API response
    this.allowsDogs = newApiPlaceDetailsData.allowsDogs ?? existingData.allowsDogs ?? null;
    this.outdoorSeating = newApiPlaceDetailsData.outdoorSeating ?? existingData.outdoorSeating ?? null;
    this.servesVegetarianFood = newApiPlaceDetailsData.servesVegetarianFood ?? existingData.servesVegetarianFood ?? null;

    // Social media and delivery - non-API data, manually provided
    this.instagramUrl = existingData.instagramUrl || existingData.instagram || '';
    this.gofoodUrl = existingData.gofoodUrl || '';

    // Table reservation - manually provided
    this.tableUrl = existingData.tableUrl || '';

    // Menu URL - manually provided
    this.menuUrl = existingData.menuUrl || '';

    // Region information (provided by caller)
    if (region) {
      this.region = region;
    } else if (newApiPlaceDetailsData.region) {
      this.region = newApiPlaceDetailsData.region;
    } else if (existingData.region) {
      this.region = existingData.region;
    }
    
    // EXCLUDED FIELDS - These are intentionally NOT assigned to class properties:
    // - this.address (formattedAddress from API) - excluded per user requirements
    // - this.priceLevel (priceLevel from API) - excluded per user requirements  
    // - this.types (types from API) - excluded per user requirements
    // - this.attributions - excluded per user requirements
  }

  /**
   * 将对象转换为JSON字符串
   * @returns {string} - JSON字符串
   */
  toJSON() {
    // Return a plain object representation for JSON.stringify
    // Includes all desired fields and excludes unwanted fields (address, priceLevel, types, attributions)
    return {
      placeId: this.placeId,
      name: this.name,
      latitude: this.latitude,
      longitude: this.longitude,
      photos: this.photos,
      openingHours: this.openingHours,
      openingPeriods: this.openingPeriods,
      isOpenNow: this.isOpenNow,
      website: this.website,
      phoneNumber: this.phoneNumber,
      rating: this.rating,
      userRatingsTotal: this.userRatingsTotal,
      region: this.region,
      businessStatus: this.businessStatus,
      googleMapsUri: this.googleMapsUri,
      staticMapS3Url: this.staticMapS3Url,
      allowsDogs: this.allowsDogs,
      outdoorSeating: this.outdoorSeating,
      servesVegetarianFood: this.servesVegetarianFood,
      instagramUrl: this.instagramUrl,
      gofoodUrl: this.gofoodUrl,
      "tableUrl": this.tableUrl,
      "menuUrl": this.menuUrl
      // EXCLUDED FIELDS (not included in output):
      // - address (formattedAddress from API)
      // - priceLevel  
      // - types
      // - attributions
      // - googleApiPhotoReferences (internal Google photo references)
      // - instagram (deprecated, use instagramUrl instead)
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