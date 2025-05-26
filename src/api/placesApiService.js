/**
 * Google Places API服务
 * 封装对Google Places API新版(New)的调用
 */
const axios = require('axios');
const appConfig = require('../utils/appConfig');

const COMMON_FIELD_MASK = 'id,displayName,types,location,businessStatus,googleMapsUri,photos,viewport';
const MAX_PAGES_TO_FETCH = 5;
const PAGINATION_DELAY_MS = 2000;

/**
 * Performs a "Nearby Search" using the Google Places API.
 * @param {Object} searchParams - Search parameters.
 * @param {string[]} searchParams.includedTypes - Array of types to include (e.g., ["cafe"]).
 * @param {string[]} [searchParams.excludedTypes] - Array of types to exclude.
 * @param {Object} searchParams.locationRestriction - Geographic restriction.
 * @param {Object} searchParams.locationRestriction.circle - Circle definition.
 * @param {Object} searchParams.locationRestriction.circle.center - Center of the circle.
 * @param {number} searchParams.locationRestriction.circle.center.latitude - Latitude.
 * @param {number} searchParams.locationRestriction.circle.center.longitude - Longitude.
 * @param {number} searchParams.locationRestriction.circle.radius - Radius in meters.
 * @returns {Promise<Object>} - Object containing all found places: { places: Array }.
 */
async function searchNearbyPlaces(searchParams) {
  const config = await appConfig.getConfig();
  const apiKey = config.MAPS_API_KEY;
  
  // Log 1: Incoming searchParams (Kept from prompt#33)
  console.log('searchNearbyPlaces received searchParams:', JSON.stringify(searchParams, null, 2));

  let allPlaces = [];
  let currentPageToken = null;
  let pagesFetched = 0;

  // Initialize baseRequestBody without locationRestriction initially
  const baseRequestBody = {
    includedTypes: searchParams.includedTypes, // Assuming searchParams provides this, as per pererenanNearbyTest config
      maxResultCount: 20,
      languageCode: "en",
    // rankPreference is not set, so it defaults to POPULARITY for Nearby Search.
  };

  if (searchParams.excludedTypes && searchParams.excludedTypes.length > 0) {
    baseRequestBody.excludedTypes = searchParams.excludedTypes;
  }

  // Log values used for building locationRestriction
  console.log('For locationRestriction construction - searchParams.location:', searchParams.location);
  console.log('For locationRestriction construction - searchParams.radius:', searchParams.radius);
    
  // Construct locationRestriction if location and radius are valid
  if (searchParams.location && typeof searchParams.radius === 'number') {
    const [latStr, lngStr] = String(searchParams.location).split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    // Ensure radius is treated as a number, even if it's a string in searchParams (though typeof check helps)
    const radiusNum = parseFloat(String(searchParams.radius));

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(radiusNum) && radiusNum > 0) {
      baseRequestBody.locationRestriction = {
        circle: {
          center: {
            latitude: lat,
            longitude: lng
          },
          radius: radiusNum
        }
      };
      console.log('Successfully constructed locationRestriction:', JSON.stringify(baseRequestBody.locationRestriction, null, 2));
    } else {
      console.error('Error: Invalid parsed values for location or radius. Latitude:', lat, 'Longitude:', lng, 'Radius:', radiusNum, '. locationRestriction will NOT be added.');
      // Nearby Search will likely fail if locationRestriction is missing.
    }
  } else {
    console.warn('Warning: searchParams.location or searchParams.radius is missing, or radius is not a number. locationRestriction will NOT be added for Nearby Search. API call will likely fail.');
  }

  // Log 3: Constructed baseRequestBody (Kept from prompt#33, now shows correctly built locationRestriction)
  console.log('Constructed baseRequestBody for Nearby Search (before pageToken):', JSON.stringify(baseRequestBody, null, 2));

  console.log(`Using API key starting with: ${apiKey ? apiKey.substring(0, 4) : 'N/A'}*** for Nearby Search`);

  do {
    const requestBody = { ...baseRequestBody };
    if (currentPageToken) {
      requestBody.pageToken = currentPageToken;
    }

    console.log(`Requesting page ${pagesFetched + 1} for Nearby Search. Body:`, JSON.stringify(requestBody));

    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchNearby',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': COMMON_FIELD_MASK
        }
      }
    );

      console.log(`Nearby Search - Google API Response Data for Page ${pagesFetched + 1}:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.places) {
        allPlaces = allPlaces.concat(response.data.places);
        console.log(`Nearby Search - Page ${pagesFetched + 1} fetched ${response.data.places.length} places. Total accumulated: ${allPlaces.length}`);
      }

      currentPageToken = response.data.nextPageToken || null;
      pagesFetched++;

      if (currentPageToken && pagesFetched < MAX_PAGES_TO_FETCH) {
        console.log(`Nearby Search - Delaying for ${PAGINATION_DELAY_MS / 1000} seconds before fetching page ${pagesFetched + 1}...`);
        await new Promise(resolve => setTimeout(resolve, PAGINATION_DELAY_MS));
      }

    } catch (error) {
      console.error(`Error fetching page ${pagesFetched + 1} of Nearby Search results:`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else {
        console.error('Error message:', error.message);
      }
      currentPageToken = null;
      break;
    }
  } while (currentPageToken && pagesFetched < MAX_PAGES_TO_FETCH);

  console.log(`Finished fetching Nearby Search results. Total pages fetched: ${pagesFetched}. Total places: ${allPlaces.length}`);
  return { places: allPlaces };
}

/**
 * Performs a "Text Search" using the Google Places API.
 * @param {Object} searchParams - Search parameters.
 * @param {string} searchParams.textQuery - The text query to search for.
 * @param {Object} [searchParams.locationBias] - Optional geographic bias.
 * @param {Object} [searchParams.locationBias.circle] - Circle definition for bias.
 * @param {Object} [searchParams.locationBias.circle.center] - Center of the circle.
 * @param {number} [searchParams.locationBias.circle.center.latitude] - Latitude.
 * @param {number} [searchParams.locationBias.circle.center.longitude] - Longitude.
 * @param {number} [searchParams.locationBias.circle.radius] - Radius in meters.
 * @returns {Promise<Object>} - Object containing all found places: { places: Array }.
 */
async function searchTextPlaces(searchParams) { // Renamed from getAllTextSearchResults
  const config = await appConfig.getConfig();
  const apiKey = config.MAPS_API_KEY;
  const fieldMask = 'places.id,places.displayName,places.formattedAddress'; // Using a minimal field mask specific for searchText

  let allPlaces = [];
  let currentPageToken = null;
  let pagesFetched = 0;
  // const MAX_PAGES_TO_FETCH and PAGINATION_DELAY_MS are defined globally

  const baseRequestBody = {
    textQuery: searchParams.textQuery,
    maxResultCount: 20,
    languageCode: "en",
    // No rankPreference for Text Search (New)
    // No includedTypes as top-level parameter for Text Search (New)
  };

  if (searchParams.locationBias) { // Expecting locationBias, as per prompt#31
    baseRequestBody.locationBias = searchParams.locationBias;
  } else if (searchParams.location && searchParams.radius) { // Fallback for older structure, convert to locationBias
    console.warn("Warning: 'location' and 'radius' params received for searchTextPlaces, converting to 'locationBias'. Prefer 'locationBias' directly.");
    const [lat, lng] = searchParams.location.split(',');
    baseRequestBody.locationBias = {
      circle: {
        center: {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng)
        },
        radius: parseFloat(searchParams.radius)
      }
    };
  } else {
    console.warn('Warning: locationBias is recommended for Text Search for more relevant results if a specific area is targeted.');
  }

  console.log(`Using API key starting with: ${apiKey ? apiKey.substring(0, 4) : 'N/A'}*** for Text Search`);

  do {
    const requestBody = { ...baseRequestBody };
    if (currentPageToken) {
      requestBody.pageToken = currentPageToken;
    }

    console.log(`Requesting page ${pagesFetched + 1} for Text Search. Body:`, JSON.stringify(requestBody));

    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': fieldMask
          }
        }
      );
      
      console.log(`Text Search - Google API Response Data for Page ${pagesFetched + 1}:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.places) {
        allPlaces = allPlaces.concat(response.data.places);
        console.log(`Text Search - Page ${pagesFetched + 1} fetched ${response.data.places.length} places. Total accumulated: ${allPlaces.length}`);
      }
      
      currentPageToken = response.data.nextPageToken || null;
      pagesFetched++;

      if (currentPageToken && pagesFetched < MAX_PAGES_TO_FETCH) {
        console.log(`Text Search - Delaying for ${PAGINATION_DELAY_MS / 1000} seconds before fetching page ${pagesFetched + 1}...`);
        await new Promise(resolve => setTimeout(resolve, PAGINATION_DELAY_MS));
      }

  } catch (error) {
      console.error(`Error fetching page ${pagesFetched + 1} of Text Search results:`);
    if (error.response) {
        console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      } else {
        console.error('Error message:', error.message);
    }
      currentPageToken = null;
      break;
  }
  } while (currentPageToken && pagesFetched < MAX_PAGES_TO_FETCH);

  console.log(`Finished fetching Text Search results. Total pages fetched: ${pagesFetched}. Total places: ${allPlaces.length}`);
  return { places: allPlaces };
}

/**
 * 获取地点详情 (使用Places API New)
 * @param {string} placeId - Google Places API的地点ID
 * @returns {Promise<Object>} - 地点详情
 */
async function getPlaceDetails(placeId) {
  const config = await appConfig.getConfig();
  const apiKey = config.MAPS_API_KEY;
  // Updated field mask with 13 essential fields including new attributes
  const fieldMask = 'id,displayName,location,googleMapsUri,businessStatus,regularOpeningHours,nationalPhoneNumber,websiteUri,rating,userRatingCount,allowsDogs,outdoorSeating,servesVegetarianFood';
  
  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('获取地点详情错误:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Error message:', error.message);
    }
    throw error;
  }
}

/**
 * 生成照片URL (使用Places API New)
 * @param {string} photoName - 照片引用名称
 * @param {number} maxWidth - 最大宽度
 * @param {number} maxHeight - 最大高度
 * @param {boolean} skipHttpRedirect - 是否跳过HTTP重定向
 * @returns {Promise<string>} - 照片URL
 */
async function getPhotoUrl(photoName, maxWidth = 800, maxHeight, skipHttpRedirect = false) {
  const config = await appConfig.getConfig();
  const apiKey = config.MAPS_API_KEY;

  if (!photoName) {
    throw new Error('photoName is required');
  }
  
  let url = `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxWidthPx=${maxWidth}`;
  
  if (maxHeight) {
    url += `&maxHeightPx=${maxHeight}`;
  }
  
  if (skipHttpRedirect) {
    return url;
  }
  
  try {
    // Get the redirect URL
    const response = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });
    
    if (response.headers.location) {
      return response.headers.location;
    }
    
    // If no redirect, return original URL
    return url;
  } catch (error) {
    console.error('Error getting photo URL:', error);
    throw error;
  }
}

module.exports = {
  searchNearbyPlaces,
  searchTextPlaces,
  getPlaceDetails,
  getPhotoUrl
}; 