/**
 * Create Listing Lambda Function
 * Handles POST /listings - Create new rental listing
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Comprehensive input validation according to PRD v1.1
 * - Geocoding API integration for location coordinates
 * - DynamoDB listing storage
 * - Standardized error handling
 * - CORS support
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const https = require('https');

// Initialize DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const GEOCODING_API_KEY = process.env.GEOCODING_API_KEY;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏠 createListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate authentication
        const { userId } = await validateAuthentication(event);
        
        // 2. Parse and validate request body
        const listingData = await parseAndValidateRequest(event);
        
        // 3. Geocode the location
        const locationCoords = await geocodeLocation(listingData.locationName);
        
        // 4. Prepare listing object
        const now = new Date().toISOString();
        const listing = {
            listingId: uuidv4(),
            initiatorId: userId,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            ...listingData,
            locationCoords
        };

        // 5. Save to DynamoDB
        await saveListing(listing);

        // 6. Return success response
        console.log(`✅ Listing created successfully: ${listing.listingId}`);
        return createResponse(201, {
            success: true,
            data: listing
        });

    } catch (error) {
        console.error('❌ Error in createListing:', error);
        
        // Handle different error types
        if (error.statusCode) {
            return createResponse(error.statusCode, {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.details && { details: error.details })
                }
            });
        }

        // Unknown error
        return createResponse(500, {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred while creating the listing'
            }
        });
    }
};

/**
 * Validate Cognito authentication and extract user information
 */
async function validateAuthentication(event) {
    const claims = event.requestContext?.authorizer?.claims;
    
    if (!claims || !claims.sub) {
        console.log('❌ Missing or invalid Cognito claims');
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    // For listings, we need to get the actual userId from our Users table
    // For now, we'll use the cognitoSub as userId (this could be enhanced later)
    const userId = claims.sub;

    console.log(`🔐 Authenticated user - UserId: ${userId}`);

    return { userId };
}

/**
 * Parse and validate the incoming request according to PRD v1.1
 */
async function parseAndValidateRequest(event) {
    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    const errors = [];

    // Validate listingType
    if (!body.listingType || !['seeking_roommate', 'seeking_accommodation'].includes(body.listingType)) {
        errors.push('listingType must be either "seeking_roommate" or "seeking_accommodation"');
    }

    // Validate locationName
    if (!body.locationName || typeof body.locationName !== 'string' || body.locationName.trim().length === 0) {
        errors.push('locationName is required and must be a non-empty string');
    }

    // Validate propertyDetails
    if (!body.propertyDetails || typeof body.propertyDetails !== 'object') {
        errors.push('propertyDetails is required and must be an object');
    } else {
        const { propertyType, bedrooms, bathrooms, rent, utilities } = body.propertyDetails;
        
        if (!propertyType || !['apartment', 'house', 'villa'].includes(propertyType)) {
            errors.push('propertyDetails.propertyType must be one of: apartment, house, villa');
        }
        
        if (bedrooms === undefined || !Number.isInteger(bedrooms) || bedrooms < 1 || bedrooms > 10) {
            errors.push('propertyDetails.bedrooms must be an integer between 1 and 10');
        }
        
        if (bathrooms === undefined || !Number.isInteger(bathrooms) || bathrooms < 1 || bathrooms > 10) {
            errors.push('propertyDetails.bathrooms must be an integer between 1 and 10');
        }
        
        if (!rent || typeof rent !== 'object') {
            errors.push('propertyDetails.rent is required and must be an object');
        } else {
            if (!rent.amount || !Number.isInteger(rent.amount) || rent.amount <= 0) {
                errors.push('propertyDetails.rent.amount must be a positive integer');
            }
            if (!rent.currency || typeof rent.currency !== 'string') {
                errors.push('propertyDetails.rent.currency is required and must be a string');
            }
            if (!rent.period || !['monthly', 'weekly', 'daily'].includes(rent.period)) {
                errors.push('propertyDetails.rent.period must be one of: monthly, weekly, daily');
            }
        }
        
        if (utilities !== undefined && typeof utilities !== 'boolean') {
            errors.push('propertyDetails.utilities must be a boolean if provided');
        }
    }

    // Validate leaseDetails
    if (!body.leaseDetails || typeof body.leaseDetails !== 'object') {
        errors.push('leaseDetails is required and must be an object');
    } else {
        const { moveInDate, minimumStay, maximumStay } = body.leaseDetails;
        
        if (!moveInDate || !isValidDate(moveInDate)) {
            errors.push('leaseDetails.moveInDate is required and must be a valid date (YYYY-MM-DD)');
        }
        
        if (minimumStay !== undefined && (!Number.isInteger(minimumStay) || minimumStay < 1)) {
            errors.push('leaseDetails.minimumStay must be a positive integer if provided');
        }
        
        if (maximumStay !== undefined && (!Number.isInteger(maximumStay) || maximumStay < 1)) {
            errors.push('leaseDetails.maximumStay must be a positive integer if provided');
        }
        
        if (minimumStay && maximumStay && minimumStay > maximumStay) {
            errors.push('leaseDetails.minimumStay cannot be greater than maximumStay');
        }
    }

    // Validate optional fields
    if (body.description && typeof body.description !== 'string') {
        errors.push('description must be a string if provided');
    }

    if (body.amenities && (!Array.isArray(body.amenities) || !body.amenities.every(item => typeof item === 'string'))) {
        errors.push('amenities must be an array of strings if provided');
    }

    if (body.preferences && typeof body.preferences !== 'object') {
        errors.push('preferences must be an object if provided');
    }

    // If any validation errors, throw
    if (errors.length > 0) {
        throw createError(400, 'VALIDATION_ERROR', 'Listing validation failed', errors);
    }

    // Return cleaned and validated data
    return {
        listingType: body.listingType,
        locationName: body.locationName.trim(),
        propertyDetails: body.propertyDetails,
        leaseDetails: body.leaseDetails,
        ...(body.description && { description: body.description.trim() }),
        ...(body.amenities && { amenities: body.amenities }),
        ...(body.preferences && { preferences: body.preferences }),
        ...(body.images && { images: body.images }),
        ...(body.contactInfo && { contactInfo: body.contactInfo })
    };
}

/**
 * Geocode location name to coordinates using Google Geocoding API
 * TODO: Implement actual geocoding API call
 */
async function geocodeLocation(locationName) {
    console.log(`🌍 Geocoding location: ${locationName}`);
    
    // Check if API key is available
    if (!GEOCODING_API_KEY) {
        console.warn('⚠️ GEOCODING_API_KEY not configured, using mock coordinates');
        // Return mock coordinates for Canggu, Bali as fallback
        return {
            lat: -8.6482,
            lng: 115.1375,
            formatted_address: locationName
        };
    }

    try {
        // TODO: Replace this with actual Google Geocoding API call
        // Example implementation:
        /*
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationName)}&key=${GEOCODING_API_KEY}`;
        
        const response = await makeHttpsRequest(url);
        const data = JSON.parse(response);
        
        if (data.status === 'OK' && data.results.length > 0) {
            const result = data.results[0];
            return {
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                formatted_address: result.formatted_address
            };
        } else {
            throw new Error(`Geocoding failed: ${data.status}`);
        }
        */

        // For now, return mock coordinates based on common Bali locations
        const locationMap = {
            'canggu': { lat: -8.6482, lng: 115.1375 },
            'seminyak': { lat: -8.6881, lng: 115.1725 },
            'ubud': { lat: -8.5069, lng: 115.2624 },
            'denpasar': { lat: -8.6705, lng: 115.2126 },
            'sanur': { lat: -8.6878, lng: 115.2614 }
        };

        const normalizedLocation = locationName.toLowerCase();
        for (const [key, coords] of Object.entries(locationMap)) {
            if (normalizedLocation.includes(key)) {
                return {
                    ...coords,
                    formatted_address: locationName
                };
            }
        }

        // Default to Canggu coordinates
        return {
            lat: -8.6482,
            lng: 115.1375,
            formatted_address: locationName
        };

    } catch (error) {
        console.error('❌ Geocoding error:', error);
        // Fallback to default coordinates
        return {
            lat: -8.6482,
            lng: 115.1375,
            formatted_address: locationName
        };
    }
}

/**
 * Save listing to DynamoDB
 */
async function saveListing(listing) {
    console.log(`💾 Saving listing to DynamoDB: ${listing.listingId}`);

    const params = {
        TableName: LISTINGS_TABLE,
        Item: listing,
        ConditionExpression: 'attribute_not_exists(listingId)'
    };

    try {
        await dynamodb.put(params).promise();
        console.log(`✅ Listing saved successfully: ${listing.listingId}`);
    } catch (error) {
        console.error('❌ DynamoDB save error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to save listing to database');
    }
}

/**
 * Utility function to validate date format (YYYY-MM-DD)
 */
function isValidDate(dateString) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
}

/**
 * Make HTTPS request (utility for geocoding API)
 */
function makeHttpsRequest(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => resolve(data));
        });
        
        request.on('error', reject);
        request.setTimeout(10000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Create standardized error object
 */
function createError(statusCode, code, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    if (details) {
        error.details = details;
    }
    return error;
}

/**
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 