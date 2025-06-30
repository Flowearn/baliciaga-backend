/**
 * Response Utilities
 * Shared data transformation functions for consistent API responses
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const APPLICATIONS_TABLE_NAME = process.env.APPLICATIONS_TABLE_NAME;
const USERS_TABLE_NAME = process.env.USERS_TABLE;

/**
 * Build complete listing response according to frontend Listing interface
 * This ensures consistent data structure across all APIs
 */
const buildCompleteResponse = async (listing) => {
    if (!listing) return null;

    // --- NEW: Asynchronously get the count of accepted applications ---
    const getAcceptedCount = async (listingId) => {
        try {
            const params = {
                TableName: APPLICATIONS_TABLE_NAME,
                IndexName: 'ListingStatusIndex', // Assumes a GSI on listingId and status
                KeyConditionExpression: 'listingId = :listingId and #status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':listingId': listingId,
                    ':status': 'accepted',
                },
                Select: 'COUNT',
            };
            const result = await docClient.send(new QueryCommand(params));
            return result.Count || 0;
        } catch (error) {
            console.error(`Error fetching accepted count for listing ${listingId}:`, error);
            return 0;
        }
    };
    
    const acceptedApplicantsCount = await getAcceptedCount(listing.listingId);
    
    // Calculate filled spots considering poster role
    // For backward compatibility, treat missing posterRole as 'landlord' (no additional spot)
    const initiatorIsTenant = listing.posterRole === 'tenant' ? 1 : 0;
    const filledSpots = acceptedApplicantsCount + initiatorIsTenant;

    // Get initiator profile information
    const initiatorProfile = await getInitiatorProfile(listing.initiatorId);

    return {
        // Main listing information
        listingId: listing.listingId,
        title: listing.title || listing.locationName || 'Property Listing',
        description: listing.description || '',
        
        // Location object (nested structure expected by frontend)
        location: {
            address: listing.location?.address || listing.address || 'Address not available',
            coordinates: {
                latitude: listing.location?.coordinates?.latitude || 0,
                longitude: listing.location?.coordinates?.longitude || 0
            },
            area: listing.location?.locationArea || listing.locationArea,
        },
        
        // Pricing object (nested structure expected by frontend)
        pricing: {
            monthlyRent: listing.pricing?.monthlyRent || 0,
            yearlyRent: listing.pricing?.yearlyRent || 0,
            deposit: listing.pricing?.deposit || 0,
            utilities: listing.pricing?.utilities || 0,
            currency: listing.pricing?.currency || 'IDR'
        },
        
        // Details object (nested structure expected by frontend)
        details: {
            bedrooms: listing.details?.bedrooms || 1,
            bathrooms: listing.details?.bathrooms || 1,
            squareFootage: listing.details?.squareFootage || null,
            furnished: listing.details?.furnished || false,
            petFriendly: listing.details?.petFriendly || false,
            smokingAllowed: listing.details?.smokingAllowed || false,
            amenities: listing.amenities || [],
            otherFeatures: listing.otherFeatures,
            otherAmenities: listing.otherAmenities,
        },
        
        // Photos array (frontend expects 'photos' not 'images')
        photos: listing.photos || listing.images || [],
        
        // Availability object (nested structure expected by frontend)
        availability: {
            availableFrom: listing.availability?.availableFrom || new Date().toISOString(),
            minimumStay: listing.availability?.minimumStay || 1,
            maximumStay: listing.availability?.maximumStay || null,
            leaseDuration: listing.availability?.leaseDuration || null
        },
        
        // Status (map backend status to frontend status)
        status: mapStatusToFrontend(listing.status),
        
        // Other fields
        initiatorId: listing.initiatorId,
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
        
        // --- NEW FIELDS ---
        acceptedApplicantsCount: filledSpots, // Use new calculation that includes poster role
        totalSpots: listing.totalSpots || listing.details?.bedrooms || 1, // Use totalSpots if available, otherwise bedrooms
        
        // Initiator information
        initiator: {
            id: listing.initiatorId,
            name: initiatorProfile?.name || 'Anonymous User',
            profilePictureUrl: initiatorProfile?.profilePictureUrl || null,
            role: listing.posterRole || 'landlord', // tenant or landlord
            whatsApp: initiatorProfile?.whatsApp || null
        }
        // ---
    };
};

/**
 * Get initiator profile information
 */
const getInitiatorProfile = async (initiatorId) => {
    try {
        const params = {
            TableName: USERS_TABLE_NAME,
            Key: { userId: initiatorId }
        };
        
        const result = await docClient.send(new GetCommand(params));
        
        if (!result.Item) {
            console.log(`User profile not found for initiatorId: ${initiatorId}`);
            return null;
        }

        // Return only the public profile information
        return {
            name: result.Item.profile?.name || result.Item.name || 'Anonymous User',
            profilePictureUrl: result.Item.profile?.profilePictureUrl || result.Item.profilePictureUrl || null,
            whatsApp: result.Item.profile?.whatsApp || result.Item.whatsApp || null
        };
    } catch (error) {
        console.error(`Error fetching initiator profile for ${initiatorId}:`, error);
        return null;
    }
};

/**
 * Map backend status to frontend expected status
 */
function mapStatusToFrontend(backendStatus) {
    const statusMap = {
        'open': 'active',
        'closed': 'closed',
        'cancelled': 'cancelled',
        'finalized': 'finalized'
    };
    
    return statusMap[backendStatus] || 'active';
}

module.exports = {
    buildCompleteResponse,
    mapStatusToFrontend
}; 