# CORS Testing Guide for Baliciaga Backend

## Important Fix Applied
Fixed environment variable mismatch: Changed `LISTINGS_TABLE_NAME` to `LISTINGS_TABLE` in getListings.js to match serverless.yml configuration.

## Manual Browser Testing Steps

### 1. Deploy the Updated Backend
```bash
cd /Users/troy/开发文档/Baliciaga/backend
serverless deploy --stage dev
```

Note the API Gateway URL from the deployment output.

### 2. Test from the Frontend Website

1. Navigate to: https://baliciaga-frontend-kxpx3yl8c-ride-da-wave.vercel.app/
2. Open Developer Tools (F12)
3. Go to Network tab and clear it
4. Login with your test credentials
5. Navigate to Rental -> All Listings
6. Observe the network requests

### 3. What to Check in DevTools

#### Network Tab:
- Look for requests to `/listings`
- Check the Status Code (should be 200)
- Click on the request and check:
  - **Request Headers**: Should include Origin header
  - **Response Headers**: Must include:
    - `Access-Control-Allow-Origin: *`
    - `Access-Control-Allow-Credentials: true`

#### Console Tab:
- Look for any CORS error messages like:
  - "Access to fetch at ... has been blocked by CORS policy"
  - "No 'Access-Control-Allow-Origin' header is present"

### 4. Browser Console Test Script

Open the browser console while on your frontend website and run:

```javascript
// Replace with your actual API Gateway URL
const API_URL = 'https://YOUR-API-ID.execute-api.ap-southeast-1.amazonaws.com/dev/listings';

fetch(API_URL)
  .then(response => {
    console.log('Status:', response.status);
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': response.headers.get('access-control-allow-origin'),
      'Access-Control-Allow-Credentials': response.headers.get('access-control-allow-credentials')
    });
    return response.json();
  })
  .then(data => console.log('Data:', data))
  .catch(error => console.error('Error:', error));
```

### 5. cURL Test from Terminal

```bash
# Replace with your actual API Gateway URL
API_URL="https://YOUR-API-ID.execute-api.ap-southeast-1.amazonaws.com/dev/listings"

# Test with Origin header
curl -i -H "Origin: https://baliciaga-frontend-kxpx3yl8c-ride-da-wave.vercel.app" \
     -H "Content-Type: application/json" \
     $API_URL
```

Look for these headers in the response:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

## Common Issues and Solutions

### Issue 1: "CORS policy: No 'Access-Control-Allow-Origin' header"
- **Cause**: Lambda function is failing before returning CORS headers
- **Solution**: Check CloudWatch logs for the Lambda function

### Issue 2: "CORS policy: The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true'"
- **Cause**: Missing or incorrect CORS headers in Lambda response
- **Solution**: Ensure all return statements include proper CORS headers

### Issue 3: OPTIONS preflight failing
- **Cause**: API Gateway not configured for OPTIONS method
- **Solution**: Already configured in serverless.yml for /listings endpoint

## CloudWatch Logs Check

1. Go to AWS Console -> CloudWatch -> Log Groups
2. Find: `/aws/lambda/baliciaga-backend-dev-getListings`
3. Check recent log streams for errors

## Expected Successful Response

```json
{
  "success": true,
  "data": {
    "listings": [...],
    "pagination": {
      "hasMore": false,
      "nextCursor": null,
      "totalCount": X
    }
  }
}
```

## Next Steps if Issues Persist

1. **Check Lambda Environment Variables**:
   - Verify LISTINGS_TABLE is set correctly in Lambda console
   
2. **Check DynamoDB Table**:
   - Ensure table `Baliciaga-Listings-dev` exists
   - Verify Lambda has proper IAM permissions

3. **Enable API Gateway Logging**:
   - Can help identify if requests are reaching Lambda

4. **Test Lambda Directly**:
   - Use AWS Console to test the Lambda function directly
   - This bypasses API Gateway to isolate the issue