# Builds the UI and runs the server (collectors + API + static files). Port 80.
# DATABASE_URL (Postgres) is optional: without it the snapshots live in PGlite under DATA_DIR,
# and they are only a cache — the collectors refill them within a minute of boot.

# --- build: install, test and build (a failing test stops the image) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# --- final: built UI, server, static datasets and production dependencies only ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80 DIST_DIR=/app/dist DATA_DIR=/app/.datos
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY data ./data
EXPOSE 80
CMD ["node", "server/index.ts"]
