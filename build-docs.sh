#!/bin/bash
set -e

# Build script for Cloudflare Workers deployment of the user guide.
# Used as the build command in both the Cloudflare dashboard and CI.

cd frontend && npm ci && npm run build && cd ..
pip install .
vantage build userguide/ -o dist/docs --frontend-dist frontend/dist -n "Vantage User Guide" --base-path /docs/

# Remove _redirects — it's for Cloudflare Pages SPA routing, not Workers.
# Workers uses not_found_handling in wrangler.toml + 404.html instead.
rm -f dist/docs/_redirects
