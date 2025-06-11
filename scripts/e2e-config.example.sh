#!/bin/bash

# Baliciaga E2E Test Configuration
# Copy this file to e2e-config.sh and update with your actual values

# API Configuration
export API_BASE_URL="https://your-api-gateway-url.amazonaws.com/dev"

# AWS/Cognito Configuration
export AWS_REGION="ap-southeast-1"
export COGNITO_USER_POOL_ID="ap-southeast-1_XXXXXXXXX"
export COGNITO_USER_POOL_CLIENT_ID="your-cognito-client-id"

# AWS Credentials (if not using IAM roles)
# export AWS_ACCESS_KEY_ID="your-access-key"
# export AWS_SECRET_ACCESS_KEY="your-secret-key"

echo "✅ E2E Test environment variables loaded"
echo "📋 Config:"
echo "   API_BASE_URL: $API_BASE_URL"
echo "   AWS_REGION: $AWS_REGION" 
echo "   USER_POOL_ID: $COGNITO_USER_POOL_ID"
echo "   CLIENT_ID: $COGNITO_USER_POOL_CLIENT_ID" 