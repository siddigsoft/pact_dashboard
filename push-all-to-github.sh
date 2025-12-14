#!/bin/bash

echo "🚀 PACT System - Check, Commit & Push to GitHub"
echo "================================================"
echo ""
echo "This script will check for changes, show a summary, and push to GitHub"
echo "Repository: https://github.com/siddigsoft/PACT-Siddig"
echo ""

# Remove any lock files
echo "1. Cleaning git locks..."
rm -f .git/index.lock .git/objects/pack/tmp_pack_* 2>/dev/null
echo "   ✓ Locks removed"
echo ""

# Check git status and show changes
echo "2. Checking for changes..."
GIT_STATUS=$(git status --porcelain)
if [ -z "$GIT_STATUS" ]; then
    echo "   ℹ️  No changes detected in the repository."
    echo "   Nothing to commit or push."
    exit 0
fi

echo "   📝 Changes found:"
echo "$GIT_STATUS" | while read -r line; do
    echo "      $line"
done
echo ""

# Show diff summary (optional, user can skip if too verbose)
echo "3. Summary of changes (press Enter to continue, or Ctrl+C to cancel):"
read -p ""
echo ""

# Count files
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
MODIFIED=$(git diff --name-only | wc -l)
STAGED=$(git diff --cached --name-only | wc -l)
echo "   📊 Summary:"
echo "      - Modified files: $MODIFIED"
echo "      - Untracked files: $UNTRACKED"
echo "      - Staged files: $STAGED"
echo ""

# Confirm before proceeding
read -p "   Do you want to proceed with adding, committing, and pushing these changes? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   ❌ Operation cancelled by user."
    exit 1
fi

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
  cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Production
build/
dist/

# Misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local
*.log

# IDE
.vscode/
.idea/

# Git
.git/index.lock

# Replit
.replit
.upm/
EOF
  echo "   ✓ Created .gitignore"
fi

# Add all files
echo "4. Staging all changes..."
git add .
echo "   ✓ All changes staged"
echo ""

# Create commit with dynamic message based on changes
echo "5. Creating commit..."
CHANGED_FILES=$(git diff --cached --name-only | head -10)
if [ $(echo "$CHANGED_FILES" | wc -l) -gt 10 ]; then
    FILE_LIST="and $(($(echo "$CHANGED_FILES" | wc -l) - 10)) more files"
else
    FILE_LIST="$CHANGED_FILES"
fi

COMMIT_MSG="Update PACT system codebase

Modified files:
$FILE_LIST

This commit includes changes to the PACT Workflow Platform:
- Frontend components and pages
- Backend configurations and scripts
- Documentation and setup files

Auto-generated commit from check-commit-push script."

git commit -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
  echo "   ⚠️  No changes to commit or commit failed"
  echo "   Checking if there's anything to commit..."
  exit 1
else
  echo "   ✓ Commit created successfully"
fi
echo ""

# Push to GitHub
echo "6. Pushing to GitHub..."
echo "   Repository: siddigsoft/PACT-Siddig"
echo "   Branch: main"
echo ""

# Try to push
git push https://github.com/siddigsoft/PACT-Siddig.git HEAD:main --force 2>&1 | tee /tmp/push_output.txt

# Check if push was successful
if grep -q "remote rejected" /tmp/push_output.txt || grep -q "fatal" /tmp/push_output.txt; then
  echo ""
  echo "⚠️  Push encountered issues (shallow clone corruption)"
  echo ""
  echo "📌 Alternative: Use GitHub API uploader"
  echo "   Run: node scripts/upload-docs-to-github.js"
  echo ""
else
  echo ""
  echo "✅ Success! Changes committed and pushed to GitHub"
  echo ""
  echo "🔗 View your repository:"
  echo "   https://github.com/siddigsoft/PACT-Siddig"
  echo ""
fi
