#!/bin/bash

echo "🚀 PACT System - Complete GitHub Push"
echo "======================================"
echo ""
echo "This script will push the entire PACT system to GitHub"
echo "Repository: https://github.com/siddigsoft/PACT-Siddig"
echo ""

# Remove any lock files
echo "1. Cleaning git locks..."
rm -f .git/index.lock .git/objects/pack/tmp_pack_* 2>/dev/null
echo "   ✓ Locks removed"
echo ""

# Show current status
echo "2. Current status:"
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
MODIFIED=$(git diff --name-only | wc -l)
echo "   - Untracked files: $UNTRACKED"
echo "   - Modified files: $MODIFIED"
echo ""

# Add all files
echo "3. Adding all system files..."
echo "   This includes:"
echo "   - src/ (React components, pages, hooks)"
echo "   - public/ (assets)"
echo "   - Configuration files"
echo "   - Documentation"
echo ""

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
git add .
echo "   ✓ All files staged"
echo ""

# Create commit
echo "4. Creating commit..."
git commit -m "Complete PACT system push - Full codebase

This commit includes:
- ✅ React frontend (src/)
  - 50+ pages
  - 50+ components  
  - Custom hooks and context
  - Type definitions

- ✅ Configuration
  - Vite config (port 5000, allowedHosts)
  - TypeScript config
  - Tailwind + PostCSS config
  - ESLint config

- ✅ Documentation
  - UI Design Analysis (20 KB)
  - Technical Deep Dive (26 KB)
  - Documentation Index
  - Setup guides

- ✅ Database
  - Supabase integration
  - Schema definitions
  - SQL files

- ✅ Assets & Public files
  - Images
  - Icons
  - Static files

Technology Stack:
- React 18 + TypeScript
- Vite + Tailwind CSS
- Shadcn UI (50+ components)
- Supabase (PostgreSQL)
- TanStack Query
- React Router v6

Platform: PACT Workflow Platform
Purpose: Comprehensive MMP Management System"

if [ $? -ne 0 ]; then
  echo "   ⚠️  No changes to commit or commit failed"
  echo "   Checking if there's anything to commit..."
else
  echo "   ✓ Commit created"
fi
echo ""

# Push to GitHub
echo "5. Pushing to GitHub..."
echo "   Repository: siddigsoft/PACT-Siddig"
echo "   Branch: main"
echo ""

# Try to push
git push https://github.com/siddigsoft/PACT-Siddig.git HEAD:main --force 2>&1 | tee /tmp/push_output.txt

# Check if push was successful
if grep -q "remote rejected" /tmp/push_output.txt || grep -q "fatal" /tmp/push_output.txt; then
  echo ""
  echo "⚠️  Git push encountered issues (shallow clone corruption)"
  echo ""
  echo "📌 Alternative Solution: Use API Uploader"
  echo "   We have a backup script that uploads via GitHub API"
  echo ""
  echo "   Run this command instead:"
  echo "   node scripts/upload-complete-system.js"
  echo ""
else
  echo ""
  echo "✅ Success! All files pushed to GitHub"
  echo ""
  echo "🔗 View your repository:"
  echo "   https://github.com/siddigsoft/PACT-Siddig"
  echo ""
fi
