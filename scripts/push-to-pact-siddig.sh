#!/bin/bash

echo "🚀 Pushing code to PACT-Siddig repository..."
echo ""

# Add the new remote
echo "📍 Adding remote for PACT-Siddig..."
git remote add pact-siddig https://github.com/siddigsoft/PACT-Siddig.git 2>/dev/null || echo "Remote already exists"

# Show current remotes
echo ""
echo "📋 Current remotes:"
git remote -v

# Push to the new repository
echo ""
echo "⬆️  Pushing code to PACT-Siddig..."
git push pact-siddig main 2>/dev/null || git push pact-siddig master

echo ""
echo "✅ Done! Your code has been pushed to:"
echo "🔗 https://github.com/siddigsoft/PACT-Siddig"
