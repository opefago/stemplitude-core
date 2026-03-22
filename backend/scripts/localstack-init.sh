#!/bin/bash
awslocal s3 mb s3://stemplitude-assets
awslocal s3api put-bucket-cors --bucket stemplitude-assets --cors-configuration '{
  "CORSRules": [{"AllowedOrigins": ["*"], "AllowedMethods": ["GET","PUT","POST"], "AllowedHeaders": ["*"]}]
}'
echo "LocalStack S3 bucket created with CORS."
