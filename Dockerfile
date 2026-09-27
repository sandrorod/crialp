# ─── Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# ─── Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/dist dist
COPY database database
WORKDIR /app/apps/api
ENV WEB_DIST_DIR=/app/dist/admin \
    UPLOAD_DIR=/app/uploads \
    PORT=3333
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3333
CMD ["node", "dist/index.js"]
