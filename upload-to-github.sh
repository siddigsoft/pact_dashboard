#!/bin/bash

echo "🚀 Uploading Documentation to GitHub via API"
echo "   (Bypassing git corruption issue)"
echo ""
echo "Repository: siddigsoft/PACT-Siddig"
echo "Method: GitHub REST API (direct upload)"
echo ""
echo "=" | tr '=' '=' | head -c 60; echo ""
echo ""

# Run the Node.js uploader script
node scripts/upload-docs-to-github.js

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ All documentation uploaded successfully!"
  echo ""
  echo "🔗 View your repository:"
  echo "   https://github.com/siddigsoft/PACT-Siddig"
  echo ""
else
  echo ""
  echo "❌ Upload failed. Please check errors above."
  echo ""
  exit 1
fi
