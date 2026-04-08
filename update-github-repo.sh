#!/bin/bash

echo "🚀 Updating PACT-Siddig GitHub Repository..."
echo ""

# Remove any git lock files if they exist
rm -f .git/index.lock 2>/dev/null

# Show what files will be added
echo "📝 Files to be added:"
echo "  ✓ UI_DESIGN_ANALYSIS.md"
echo "  ✓ UI_DESIGN_DEEP_DIVE.md"
echo "  ✓ GITHUB_REPOSITORY_INSTRUCTIONS.md"
echo "  ✓ scripts/create-github-repo.js"
echo "  ✓ scripts/make-repo-private.js"
echo "  ✓ scripts/push-to-pact-siddig.sh"
echo "  ✓ update-github-repo.sh (this script)"
echo ""

# Add all new documentation and scripts
git add UI_DESIGN_ANALYSIS.md
git add UI_DESIGN_DEEP_DIVE.md
git add GITHUB_REPOSITORY_INSTRUCTIONS.md
git add scripts/create-github-repo.js
git add scripts/make-repo-private.js
git add scripts/push-to-pact-siddig.sh
git add update-github-repo.sh

echo "📦 Committing changes..."
git commit -m "Add comprehensive UI design analysis reports and GitHub repository setup scripts

- UI_DESIGN_ANALYSIS.md: Complete UI design system overview (13 sections)
- UI_DESIGN_DEEP_DIVE.md: Technical deep dive with code examples (12 parts)
- GITHUB_REPOSITORY_INSTRUCTIONS.md: Repository setup guide
- scripts/create-github-repo.js: GitHub repository creation script
- scripts/make-repo-private.js: Repository privacy configuration script
- scripts/push-to-pact-siddig.sh: Helper script for pushing to PACT-Siddig repo
- update-github-repo.sh: One-click repository update script

Reports include:
- Component library analysis (50+ components)
- Color scheme and brand identity
- Form validation architecture
- Navigation system breakdown
- Performance and accessibility audit
- Prioritized recommendations for improvements"

echo ""
echo "⬆️  Pushing to GitHub repository: PACT-Siddig..."
git push https://github.com/siddigsoft/PACT-Siddig.git HEAD:main 2>&1 | grep -v "^remote:"

echo ""
echo "✅ Done! Your repository has been updated."
echo ""
echo "🔗 View your repository at:"
echo "   https://github.com/siddigsoft/PACT-Siddig"
echo ""
