#!/usr/bin/env bash
# Deploy to Vercel production (live) environment.
# Run from project root: ./scripts/deploy-live.sh
# Or: npm run deploy:live

set -e
cd "$(dirname "$0")/.."
echo "Deploying to production (live)..."
npx vercel --prod --yes
echo "Done. Your production URL is live."
