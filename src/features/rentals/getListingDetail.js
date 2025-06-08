/**
 * Get Listing Detail Lambda Function
 * Handles GET /listings/{listingId} - Retrieve complete listing details
 * 
 * Features:
 * - Public endpoint (no authentication required)
 * - Multi-table data aggregation
 * - Fetch listing, initiator profile, and accepted roommates
 * - Complete listing detail response
 * - CORS support
 */

const AWS = require('aws-sdk');

// Initialize DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏠 getListingDetail Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract and validate listingId from path parameters
        const { listingId } = parsePathParameters(event);
        
        // 2. Get main listing data
        const listing = await getListingById(listingId);
        
        // 3. Aggregate related data in parallel for efficiency
        const [initiatorProfile, acceptedRoommates] = await Promise.all([
            getUserProfile(listing.initiatorId),
            getAcceptedRoommates(listingId)
        ]);

        // 4. Build complete listing detail response
        const completeListingDetail = buildCompleteResponse(listing, initiatorProfile, acceptedRoommates);

        // 5. Return success response
        console.log(`✅ Listing detail retrieved successfully: ${listingId}`);
        return createResponse(200, {
            success: true,
            data: completeListingDetail
        });

    } catch (error) {
        console.error('❌ Error in getListingDetail:', error);
        
        // Handle different error types
        if (error.statusCode) {
            return createResponse(error.statusCode, {
                success: false,
                error: {
                    code: error.code,
                    message: error.message
                }
            });
        }

        // Unknown error
        return createResponse(500, {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred while retrieving listing details'
            }
        });
    }
};

/**
 * Parse and validate path parameters
 */
function parsePathParameters(event) {
    const pathParams = event.pathParameters || {};
    const listingId = pathParams.listingId;

    if (!listingId || typeof listingId !== 'string' || listingId.trim().length === 0) {
        throw createError(400, 'INVALID_LISTING_ID', 'listingId is required and must be a valid string');
    }

    console.log(`🔍 Retrieving details for listing: ${listingId}`);
    return { listingId: listingId.trim() };
}

/**
 * Get listing by ID from DynamoDB
 */
async function getListingById(listingId) {
    console.log(`🔎 Querying listing: ${listingId}`);

    const params = {
        TableName: LISTINGS_TABLE,
        Key: { listingId }
    };

    try {
        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            console.log(`❌ Listing not found: ${listingId}`);
            throw createError(404, 'LISTING_NOT_FOUND', 'The requested listing was not found');
        }

        console.log(`✅ Listing found: ${listingId}`);
        return result.Item;

    } catch (error) {
        if (error.statusCode) {
            throw error; // Re-throw our custom errors
        }
        console.error('❌ DynamoDB get error:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to retrieve listing from database');
    }
}

/**
 * Get user profile by userId
 */
async function getUserProfile(userId) {
    console.log(`👤 Querying user profile: ${userId}`);

    if (!USERS_TABLE) {
        console.warn('⚠️ USERS_TABLE not configured, skipping user profile lookup');
        return null;
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: userId
        }
    };

    try {
        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            console.warn(`⚠️ User profile not found: ${userId}`);
            return null;
        }

        const user = result.Item;
        
        // Return only public profile information
        return {
            userId: user.userId,
            profile: {
                name: user.profile?.name,
                nationality: user.profile?.nationality,
                age: user.profile?.age,
                // Note: Do not include sensitive info like whatsApp, email
            }
        };

    } catch (error) {
        console.error('❌ Error getting user profile:', error);
        return null; // Don't fail the whole request if user lookup fails
    }
}

/**
 * Get accepted roommates for a listing
 */
async function getAcceptedRoommates(listingId) {
    console.log(`🤝 Querying accepted roommates for listing: ${listingId}`);

    if (!APPLICATIONS_TABLE) {
        console.warn('⚠️ APPLICATIONS_TABLE not configured, skipping roommates lookup');
        return [];
    }

    // Note: This assumes an Applications table with ListingStatusIndex GSI exists
    // The GSI would have: listingId (HASH) + status (RANGE) or similar structure
    const params = {
        TableName: APPLICATIONS_TABLE,
        IndexName: 'ListingStatusIndex',
        KeyConditionExpression: 'listingId = :listingId AND #status = :status',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':listingId': listingId,
            ':status': 'accepted'
        }
    };

    try {
        const result = await dynamodb.query(params).promise();
        
        if (!result.Items || result.Items.length === 0) {
            console.log(`📋 No accepted applications found for listing: ${listingId}`);
            return [];
        }

        console.log(`📋 Found ${result.Items.length} accepted applications for listing: ${listingId}`);

        // Get user profiles for all accepted applicants in parallel
        const roommateProfiles = await Promise.all(
            result.Items.map(application => getUserProfile(application.applicantId))
        );

        // Filter out any null profiles and return valid ones
        return roommateProfiles.filter(profile => profile !== null);

    } catch (error) {
        console.error('❌ Error getting accepted roommates:', error);
        return []; // Don't fail the whole request if roommates lookup fails
    }
}

/**
 * Build complete listing detail response according to API design
 */
function buildCompleteResponse(listing, initiatorProfile, acceptedRoommates) {
    // Build the complete response structure based on prompt#87 API design
    const response = {
        // Main listing information
        listingId: listing.listingId,
        listingType: listing.listingType,
        status: listing.status,
        locationName: listing.locationName,
        locationCoords: listing.locationCoords,
        
        // Property details
        propertyDetails: listing.propertyDetails,
        
        // Lease details
        leaseDetails: listing.leaseDetails,
        
        // Description and amenities
        description: listing.description,
        amenities: listing.amenities || [],
        
        // Preferences
        preferences: listing.preferences,
        
        // Images
        images: listing.images || [],
        
        // Contact info (if available)
        contactInfo: listing.contactInfo,
        
        // Timestamps
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        
        // Aggregated data
        initiator: initiatorProfile || {
            userId: listing.initiatorId,
            profile: {
                name: 'Profile not available'
            }
        },
        
        // Accepted roommates
        acceptedRoommates: acceptedRoommates,
        
        // Summary stats
        summary: {
            totalRoommates: acceptedRoommates.length,
            availableSpots: calculateAvailableSpots(listing, acceptedRoommates.length)
        }
    };

    return response;
}

/**
 * Calculate available spots based on property details and current roommates
 */
function calculateAvailableSpots(listing, currentRoommatesCount) {
    const totalBedrooms = listing.propertyDetails?.bedrooms || 1;
    
    // For "seeking_roommate" type, initiator takes one spot
    // For "seeking_accommodation" type, initiator is looking for a spot
    if (listing.listingType === 'seeking_roommate') {
        return Math.max(0, totalBedrooms - 1 - currentRoommatesCount); // -1 for initiator
    } else {
        return Math.max(0, totalBedrooms - currentRoommatesCount);
    }
}

/**
 * Create standardized error object
 */
function createError(statusCode, code, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
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
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 