# HADRAN FABRICS MALL — production image (Railway / Render / any Docker host)
FROM node:20-alpine

WORKDIR /app

# Install ALL dependencies (drizzle-kit is needed at container start for schema push)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build frontend + server + seed bundles
COPY . .
RUN npm run build \
  && npx esbuild db/seed.ts --platform=node --bundle --format=esm --outfile=dist/seed.js \
     --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);" \
  && mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "docker-entrypoint.sh"]
