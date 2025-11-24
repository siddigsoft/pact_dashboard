#!/bin/bash

# PACT Payment System Guide - GitHub Push Script
# Automatically commits PAYMENT_SYSTEM_GUIDE.md to your GitHub repository

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 PACT Payment Guide - GitHub Push Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if file exists
if [ ! -f "PAYMENT_SYSTEM_GUIDE.md" ]; then
    echo "❌ ERROR: PAYMENT_SYSTEM_GUIDE.md not found!"
    echo "   Please ensure the file exists in the current directory."
    exit 1
fi

echo "📖 Found PAYMENT_SYSTEM_GUIDE.md"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "⚠ Git repository not initialized."
    echo "🔧 Initializing git repository..."
    git init
    echo "✓ Git initialized"
    echo ""
fi

# Check if remote is configured
if ! git remote | grep -q "origin"; then
    echo "⚠ No remote repository configured."
    echo ""
    echo "Please add your GitHub repository as a remote:"
    echo "  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
    echo ""
    echo "Or if using SSH:"
    echo "  git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git"
    echo ""
    exit 1
fi

REMOTE_URL=$(git remote get-url origin)
echo "📁 Remote repository: $REMOTE_URL"
echo ""

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "🌿 Current branch: $CURRENT_BRANCH"
echo ""

# Stage the file
echo "📝 Staging PAYMENT_SYSTEM_GUIDE.md..."
git add PAYMENT_SYSTEM_GUIDE.md

if [ $? -ne 0 ]; then
    echo "❌ Failed to stage file"
    exit 1
fi
echo "✓ File staged"
echo ""

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "ℹ No changes to commit (file already up to date)"
    exit 0
fi

# Commit the file
echo "💾 Committing changes..."
COMMIT_MSG="docs: Add comprehensive payment system guide

This guide includes:
- Complete payment flow architecture
- User roles & permissions matrix
- Management pages documentation
- Transaction types & examples
- Fee calculation system
- Withdrawal process workflows
- Admin operations guide
- Database schema reference
- API reference with code examples
- Security & compliance guidelines
- Troubleshooting guide"

git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo "❌ Failed to commit changes"
    exit 1
fi
echo "✓ Changes committed"
echo ""

# Push to remote
echo "📤 Pushing to GitHub..."
git push origin "$CURRENT_BRANCH"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Failed to push to GitHub"
    echo ""
    echo "Common solutions:"
    echo "  1. Ensure you have push access to the repository"
    echo "  2. Check your GitHub authentication (PAT or SSH key)"
    echo "  3. Try: git push origin $CURRENT_BRANCH --force (if safe)"
    echo ""
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SUCCESS!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Payment System Guide successfully pushed to GitHub!"
echo ""
echo "🔗 View your repository:"
echo "   $REMOTE_URL"
echo ""
echo "📄 File location in repo:"
echo "   PAYMENT_SYSTEM_GUIDE.md"
echo ""
