#!/bin/bash

echo "🧪 Testing Permission Fix for Cancel/Finalize operations"
echo "======================================================="

# Test user credentials
USER_SUB="f227b488-2c81-466f-862f-38f91c951891"
USER_EMAIL="troyzhy@gmail.com"
LISTING_ID="53c347aa-20f0-437f-b412-0e7b68d0dedd"

# API base URL
API_BASE="http://localhost:3006/dev"

echo "📋 Test Setup:"
echo "  - User: $USER_EMAIL"
echo "  - User Sub: $USER_SUB"
echo "  - Listing ID: $LISTING_ID"
echo "  - API Base: $API_BASE"
echo ""

# Function to make API call with test headers
make_api_call() {
    local method=$1
    local endpoint=$2
    local description=$3
    
    echo "🔄 Testing: $description"
    echo "   Method: $method"
    echo "   Endpoint: $endpoint"
    
    response=$(curl -s -w "\n%{http_code}" -X $method \
        -H "Content-Type: application/json" \
        -H "x-test-user-sub: $USER_SUB" \
        -H "x-test-user-email: $USER_EMAIL" \
        "$API_BASE$endpoint")
    
    # Extract response body and status code
    body=$(echo "$response" | head -n -1)
    status=$(echo "$response" | tail -n 1)
    
    echo "   Status: $status"
    
    if [ "$status" == "200" ]; then
        echo "   ✅ Success!"
    elif [ "$status" == "403" ]; then
        echo "   ❌ Forbidden - Permission denied"
        echo "   Response: $body"
    else
        echo "   ⚠️  Status: $status"
        echo "   Response: $body"
    fi
    echo ""
}

# Test 1: Get listing details
echo "📍 Test 1: Verify listing ownership"
make_api_call "GET" "/listings/$LISTING_ID" "Get listing details"

# Test 2: Try to cancel the listing
echo "📍 Test 2: Cancel listing"
make_api_call "PATCH" "/listings/$LISTING_ID/cancel" "Cancel listing"

# Test 3: Try to finalize the listing
echo "📍 Test 3: Finalize listing"
make_api_call "PATCH" "/listings/$LISTING_ID/finalize" "Finalize listing"

echo "🏁 Test completed!"