#!/bin/bash

echo "=================================================="
echo "  PACT Platform - GitHub Push Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Your GitHub repository
REPO_URL="https://github.com/siddigsoft/PACT-Siddig.git"

echo -e "${BLUE}Target Repository:${NC} $REPO_URL"
echo ""

# Step 1: Clean up any lock files
echo -e "${YELLOW}Step 1: Cleaning up lock files...${NC}"
rm -f .git/index.lock .git/config.lock 2>/dev/null
echo -e "${GREEN}✓ Lock files removed${NC}"
echo ""

# Step 2: Check current remote
echo -e "${YELLOW}Step 2: Checking git remote...${NC}"
if git remote | grep -q "siddig"; then
    echo -e "${BLUE}  Remote 'siddig' already exists${NC}"
    git remote set-url siddig $REPO_URL
    echo -e "${GREEN}✓ Updated remote URL${NC}"
else
    echo -e "${BLUE}  Adding new remote 'siddig'${NC}"
    git remote add siddig $REPO_URL
    echo -e "${GREEN}✓ Remote added${NC}"
fi
echo ""

# Step 3: Count files to be pushed
echo -e "${YELLOW}Step 3: Analyzing files...${NC}"
FILE_COUNT=$(find . -type f | grep -v ".git" | grep -v "node_modules" | wc -l)
echo -e "${BLUE}  Total files: ${FILE_COUNT}${NC}"
echo ""

# Step 4: Stage all files
echo -e "${YELLOW}Step 4: Staging files...${NC}"
git add -A
STAGED=$(git diff --cached --name-only | wc -l)
echo -e "${GREEN}✓ ${STAGED} files staged${NC}"
echo ""

# Step 5: Create commit
echo -e "${YELLOW}Step 5: Creating commit...${NC}"
COMMIT_MSG="Complete PACT platform push

Includes:
- React frontend (50+ pages, 50+ components)
- Supabase database integration  
- Enhanced login page with live validation
- Complete documentation (6 guides)
- Database initialization scripts
- All configuration files

Technology Stack:
- React 18 + TypeScript + Vite
- Shadcn UI + Tailwind CSS
- Supabase (PostgreSQL)
- Real-time updates

Features:
- Live database status monitoring
- Password strength validation
- Email format validation
- Remember me functionality
- 63 users, 5 projects loaded
- Complete mobile responsiveness
- Dark mode support"

git commit -m "$COMMIT_MSG"
echo -e "${GREEN}✓ Commit created${NC}"
echo ""

# Step 6: Push to GitHub
echo -e "${YELLOW}Step 6: Pushing to GitHub...${NC}"
echo -e "${BLUE}  This may take a few minutes...${NC}"
echo ""

git push siddig main --force

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}=================================================="
    echo -e "  ✅ SUCCESS! All files pushed to GitHub"
    echo -e "==================================================${NC}"
    echo ""
    echo -e "${BLUE}Repository URL:${NC}"
    echo -e "  ${REPO_URL}"
    echo ""
    echo -e "${BLUE}Files pushed:${NC} ${FILE_COUNT}"
    echo -e "${BLUE}Commit message:${NC} Complete PACT platform push"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo -e "  1. Visit: https://github.com/siddigsoft/PACT-Siddig"
    echo -e "  2. Verify all files are present"
    echo -e "  3. Check repository is private ✓"
    echo ""
else
    echo ""
    echo -e "${RED}=================================================="
    echo -e "  ⚠️  Push failed!"
    echo -e "==================================================${NC}"
    echo ""
    echo -e "${YELLOW}Possible solutions:${NC}"
    echo -e "  1. Check your GitHub authentication"
    echo -e "  2. Verify repository exists: $REPO_URL"
    echo -e "  3. Try using Replit's Git UI (recommended)"
    echo ""
    echo -e "${BLUE}Alternative method:${NC}"
    echo -e "  Open the 'Version Control' panel in Replit"
    echo -e "  Click 'Commit & Push'"
    echo ""
fi
