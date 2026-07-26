#!/bin/sh
# HADRAN FABRICS MALL — container startup
# 1. Push the database schema (creates/updates tables, safe to re-run)
# 2. Seed default data (skips anything that already exists)
# 3. Start the server
set -e

echo "==> Applying database schema..."
npx drizzle-kit push --force

echo "==> Seeding database (existing data is kept)..."
node dist/seed.js

echo "==> Starting Hadran Fabrics Mall..."
exec node dist/boot.js
