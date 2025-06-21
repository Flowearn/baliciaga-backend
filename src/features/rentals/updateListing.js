/**
 * Update Listing Lambda Function
 * Handles PUT/PATCH /listings/{listingId} - Update existing rental listing
 * 
 * Features:
 * - JWT token validation via Cognito
 * - Owner authorization (only listing creator can update)
 * - Support for photo URL updates
 * - DynamoDB listing update
 * - Standardized error handling
 * - CORS support
 */

const dynamodb = require('../../utils/dynamoDbClient');

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('🏠 updateListing Lambda triggered');
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // 1. Extract listingId from path parameters
        const listingId = event.pathParameters?.listingId;
        if (!listingId) {
            throw createError(400, 'MISSING_LISTING_ID', 'Listing ID is required');
        }

        // 2. Extract and validate authentication
        const { userId, cognitoSub, cognitoGroups } = await validateAuthentication(event);
        
        // 3. Verify listing exists and user is the owner
        const existingListing = await verifyListingOwnership(listingId, userId, cognitoSub);
        
        // 4. Parse and validate request body
        const updateData = await parseAndValidateRequest(event);
        
        // 5. Validate platform role permission if posterRole is being updated
        if (updateData.posterRole === 'platform' && !cognitoGroups.includes('InternalStaff')) {
            console.log('❌ User attempted to update listing to platform role without InternalStaff permission');
            throw createError(403, 'FORBIDDEN', 'You do not have permission to set platform role');
        }
        
        // 6. Update listing in DynamoDB
        const updatedListing = await updateListing(listingId, updateData);

        // 6. Return success response
        console.log(`✅ Listing updated successfully: ${listingId}`);
        return createResponse(200, {
            success: true,
            data: {
                listingId: listingId,
                message: 'Listing updated successfully',
                listing: updatedListing
            }
        });

    } catch (error) {
        console.error('❌ Error in updateListing:', error);
        
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
                message: 'An internal error occurred while updating the listing'
            }
        });
    }
};

/**
 * Validate authentication and extract user information
 */
async function validateAuthentication(event) {
    const { getAuthenticatedUser } = require('../../utils/authUtils');
    
    const userClaims = getAuthenticatedUser(event);
    if (!userClaims || !userClaims.sub) {
        console.log('❌ Missing or invalid authentication');
        throw createError(401, 'UNAUTHORIZED', 'Missing or invalid authentication token');
    }

    const cognitoSub = userClaims.sub;
    const cognitoGroups = userClaims['cognito:groups'] || [];

    // Get the actual userId from our Users table
    try {
        const userQuery = {
            TableName: process.env.USERS_TABLE,
            IndexName: 'CognitoSubIndex',
            KeyConditionExpression: 'cognitoSub = :cognitoSub',
            ExpressionAttributeValues: {
                ':cognitoSub': cognitoSub
            }
        };

        const userResult = await dynamodb.query(userQuery).promise();
        if (!userResult.Items || userResult.Items.length === 0) {
            console.log('❌ User not found in database:', cognitoSub);
            throw createError(403, 'USER_NOT_FOUND', 'User profile not found. Please create your profile first.');
        }

        const userId = userResult.Items[0].userId;
        console.log(`🔐 Authenticated user - CognitoSub: ${cognitoSub}, UserId: ${userId}, Groups: ${JSON.stringify(cognitoGroups)}`);

        return { userId, cognitoSub, cognitoGroups };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        console.error('❌ Error fetching user profile:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to verify user profile');
    }
}

/**
 * Verify listing exists and user is the owner
 */
async function verifyListingOwnership(listingId, userId, cognitoSub) {
    console.log(`🔍 Verifying listing ownership: ${listingId} by user ${userId} (cognitoSub: ${cognitoSub})`);
    
    try {
        const params = {
            TableName: LISTINGS_TABLE,
            Key: { listingId }
        };

        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            throw createError(404, 'LISTING_NOT_FOUND', 'Listing not found');
        }

        const listing = result.Item;
        
        // Check ownership against both userId and cognitoSub for flexibility
        const isOwner = listing.initiatorId === userId || listing.initiatorId === cognitoSub;
        if (!isOwner) {
            console.log(`❌ User ${userId} (cognitoSub: ${cognitoSub}) is not the owner of listing ${listingId} (owner: ${listing.initiatorId})`);
            throw createError(403, 'FORBIDDEN', 'You can only update your own listings');
        }

        console.log(`✅ Listing ownership verified`);
        return listing;
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }
        console.error('❌ Error verifying listing ownership:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to verify listing ownership');
    }
}

/**
 * Parse and validate the incoming request for update
 */
async function parseAndValidateRequest(event) {
    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (error) {
        throw createError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }

    console.log('Update request body:', JSON.stringify(body, null, 2));

    const errors = [];
    const updateData = {};

    // Optional field validation - only validate provided fields
    if (body.posterRole !== undefined) {
        if (!body.posterRole || typeof body.posterRole !== 'string') {
            errors.push('posterRole must be a string if provided');
        } else if (body.posterRole !== 'tenant' && body.posterRole !== 'landlord' && body.posterRole !== 'platform') {
            errors.push('posterRole must be either "tenant", "landlord", or "platform" if provided');
        } else {
            updateData.posterRole = body.posterRole;
        }
    }

    if (body.title !== undefined) {
        if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
            errors.push('title must be a non-empty string if provided');
        } else {
            updateData.title = body.title.trim();
        }
    }

    if (body.address !== undefined) {
        if (!body.address || typeof body.address !== 'string' || body.address.trim().length === 0) {
            errors.push('address must be a non-empty string if provided');
        } else {
            updateData.address = body.address.trim();
        }
    }

    if (body.monthlyRent !== undefined) {
        if (!Number.isInteger(body.monthlyRent) || body.monthlyRent <= 0) {
            errors.push('monthlyRent must be a positive integer if provided');
        } else {
            updateData.monthlyRent = body.monthlyRent;
        }
    }

    if (body.currency !== undefined) {
        if (!body.currency || typeof body.currency !== 'string') {
            errors.push('currency must be a string if provided');
        } else {
            updateData.currency = body.currency;
        }
    }

    // Numeric field validation
    if (body.deposit !== undefined) {
        if (!Number.isInteger(body.deposit) || body.deposit < 0) {
            errors.push('deposit must be a non-negative integer if provided');
        } else {
            updateData.deposit = body.deposit;
        }
    }

    if (body.utilities !== undefined) {
        if (!Number.isInteger(body.utilities) || body.utilities < 0) {
            errors.push('utilities must be a non-negative integer if provided');
        } else {
            updateData.utilities = body.utilities;
        }
    }

    if (body.bedrooms !== undefined) {
        if (!Number.isInteger(body.bedrooms) || body.bedrooms < 0) {
            errors.push('bedrooms must be a non-negative integer if provided');
        } else {
            updateData.bedrooms = body.bedrooms;
        }
    }

    if (body.bathrooms !== undefined) {
        if (!Number.isInteger(body.bathrooms) || body.bathrooms < 0) {
            errors.push('bathrooms must be a non-negative integer if provided');
        } else {
            updateData.bathrooms = body.bathrooms;
        }
    }

    if (body.squareFootage !== undefined) {
        if (body.squareFootage !== null && (!Number.isInteger(body.squareFootage) || body.squareFootage <= 0)) {
            errors.push('squareFootage must be a positive integer or null if provided');
        } else {
            updateData.squareFootage = body.squareFootage;
        }
    }

    if (body.minimumStay !== undefined) {
        if (!Number.isInteger(body.minimumStay) || body.minimumStay <= 0) {
            errors.push('minimumStay must be a positive integer if provided');
        } else {
            updateData.minimumStay = body.minimumStay;
        }
    }

    // Boolean field validation
    if (body.furnished !== undefined) {
        if (typeof body.furnished !== 'boolean') {
            errors.push('furnished must be a boolean if provided');
        } else {
            updateData.furnished = body.furnished;
        }
    }

    if (body.petFriendly !== undefined) {
        if (typeof body.petFriendly !== 'boolean') {
            errors.push('petFriendly must be a boolean if provided');
        } else {
            updateData.petFriendly = body.petFriendly;
        }
    }

    if (body.smokingAllowed !== undefined) {
        if (typeof body.smokingAllowed !== 'boolean') {
            errors.push('smokingAllowed must be a boolean if provided');
        } else {
            updateData.smokingAllowed = body.smokingAllowed;
        }
    }

    if (body.description !== undefined) {
        if (typeof body.description !== 'string') {
            errors.push('description must be a string if provided');
        } else {
            updateData.description = body.description;
        }
    }

    if (body.amenities !== undefined) {
        if (typeof body.amenities === 'string') {
            // Convert comma-separated string to array for DynamoDB
            updateData.amenities = body.amenities.split(',').map(a => a.trim()).filter(Boolean);
        } else if (!Array.isArray(body.amenities) || !body.amenities.every(item => typeof item === 'string')) {
            errors.push('amenities must be an array of strings or comma-separated string if provided');
        } else {
            updateData.amenities = body.amenities;
        }
    }

    // Photos validation with security check
    if (body.photos !== undefined) {
        if (!Array.isArray(body.photos) || !body.photos.every(item => typeof item === 'string')) {
            errors.push('photos must be an array of strings if provided');
        } else {
                         // Validate photo URLs are from our S3 bucket
             const validPhotoUrls = body.photos.filter(url => {
                 return url.startsWith('https://baliciaga-listing-images-dev') || 
                        url.startsWith('https://baliciaga-listing-images-prod');
             });
            
            if (validPhotoUrls.length !== body.photos.length) {
                errors.push('all photo URLs must be from authorized S3 bucket');
            } else {
                updateData.photos = body.photos;
            }
        }
    }

    if (body.availableFrom !== undefined) {
        if (typeof body.availableFrom !== 'string') {
            errors.push('availableFrom must be a string if provided');
        } else {
            updateData.availableFrom = body.availableFrom;
        }
    }

    // If any validation errors, throw
    if (errors.length > 0) {
        throw createError(400, 'VALIDATION_ERROR', 'Listing update validation failed', errors);
    }

    return updateData;
}

/**
 * Update listing in DynamoDB
 */
async function updateListing(listingId, updateData) {
    console.log('💾 Updating listing in DynamoDB:', listingId);
    console.log('Update data:', JSON.stringify(updateData, null, 2));
    
    if (Object.keys(updateData).length === 0) {
        throw createError(400, 'NO_UPDATE_DATA', 'No valid update data provided');
    }

    // Build update expression dynamically
    const updateExpressions = [];
    const attributeNames = {};
    const attributeValues = {};
    
    // Always update the updatedAt timestamp
    updateData.updatedAt = new Date().toISOString();
    
    Object.keys(updateData).forEach((key, index) => {
        const attributeName = `#attr${index}`;
        const attributeValue = `:val${index}`;
        
        updateExpressions.push(`${attributeName} = ${attributeValue}`);
        attributeNames[attributeName] = key;
        attributeValues[attributeValue] = updateData[key];
    });

    const params = {
        TableName: LISTINGS_TABLE,
        Key: { listingId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: attributeNames,
        ExpressionAttributeValues: attributeValues,
        ReturnValues: 'ALL_NEW'
    };

    try {
        const result = await dynamodb.update(params).promise();
        console.log('✅ Listing updated successfully');
        return result.Attributes;
    } catch (error) {
        console.error('❌ Error updating listing:', error);
        throw createError(500, 'DATABASE_ERROR', 'Failed to update listing in database');
    }
}

/**
 * Create standardized error object
 */
function createError(statusCode, code, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    if (details) error.details = details;
    return error;
}

/**
 * Create standardized API response
 */
function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'PUT,PATCH,OPTIONS',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
}