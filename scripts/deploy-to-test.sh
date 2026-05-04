#!/usr/bin/env bash
# Deploy to Vercel preview (test) environment.
# Run from project root: ./scripts/deploy-to-test.sh
# Or: npm run deploy:test

set -e
cd "$(dirname "$0")/.."
echo "Deploying to test (preview)..."
npx vercel --yes
echo "Done. Check your Vercel dashboard for the preview URL."
