#!/bin/bash

# Upload all fixed JSON files to S3
echo "Uploading fixed JSON files to S3..."

# Upload dining-dev.json
echo "Uploading dining-dev.json..."
aws s3 cp dining-dev.json s3://baliciaga-database/dining-dev.json

# Upload dining.json 
echo "Uploading dining.json..."
aws s3 cp dining.json s3://baliciaga-database/dining.json

# Upload bars-dev.json
echo "Uploading bars-dev.json..."
aws s3 cp bars-dev.json s3://baliciaga-database/bars-dev.json

# Upload bars.json (as bars-updated.json)
echo "Uploading bars.json..."
aws s3 cp bars-updated.json s3://baliciaga-database/bars.json

echo "All JSON files uploaded successfully!"