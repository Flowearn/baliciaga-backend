/**
 * Standard CORS headers for all Lambda function responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
};

/**
 * Helper function to create a response with CORS headers
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body (will be stringified)
 * @returns {Object} Response object with CORS headers
 */
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: corsHeaders,
        body: JSON.stringify(body)
    };
};

module.exports = {
    corsHeaders,
    createResponse
};