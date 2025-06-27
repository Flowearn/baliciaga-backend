/**
 * Utility function to create standardized HTTP responses
 * @param {number} statusCode - HTTP status code
 * @param {object} body - Response body object
 * @returns {object} - Formatted Lambda response object
 */
const sendResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
};

module.exports = { sendResponse }; 