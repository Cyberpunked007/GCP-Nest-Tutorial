# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /usr/src/app

# Install pnpm
RUN npm install -g pnpm@11.19.0

# Install deps first so this layer caches when only source changes
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build the app
COPY . .
RUN pnpm run build

# Drop dev dependencies for the runtime image
RUN pnpm prune --prod

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Copy only what we need to run
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

CMD ["node", "dist/main"]