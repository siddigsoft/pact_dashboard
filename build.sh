#!/usr/bin/env bash
# Production build script — sets Node.js heap limit to prevent OOM kills
# on low-RAM servers. Reference this in GitHub Actions instead of `npm run build`.
#
# Usage:  bash build.sh
# Or in GitHub Actions step:
#   - run: bash build.sh

set -e
export NODE_OPTIONS="--max-old-space-size=4096"
npx vite build
