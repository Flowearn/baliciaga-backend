#!/bin/bash

# Example: How to run the E2E test
# 这个脚本展示了如何运行E2E测试

echo "🧪 Baliciaga E2E Test Runner Example"
echo "===================================="

# Method 1: Using environment variables directly
echo ""
echo "📋 Method 1: Direct environment variables"
echo "API_BASE_URL=\"https://your-api.amazonaws.com/dev\" \\"
echo "COGNITO_USER_POOL_ID=\"ap-southeast-1_XXXXXXXXX\" \\"
echo "COGNITO_USER_POOL_CLIENT_ID=\"your-client-id\" \\"
echo "node scripts/e2e-test.js"

# Method 2: Using config file
echo ""
echo "📋 Method 2: Using configuration file"
echo "1. cp scripts/e2e-config.example.sh scripts/e2e-config.sh"
echo "2. # Edit scripts/e2e-config.sh with your actual values"
echo "3. source scripts/e2e-config.sh && node scripts/e2e-test.js"

# Method 3: Using npm script
echo ""
echo "📋 Method 3: Using npm script"
echo "npm run e2e-test"

echo ""
echo "⚠️  Remember to:"
echo "   1. Deploy your backend: npx serverless deploy"
echo "   2. Get your API URL: npx serverless info"
echo "   3. Get Cognito config from AWS Console"
echo "   4. Set proper environment variables"

echo ""
echo "🔍 For detailed instructions, see: scripts/E2E-TEST-README.md" 