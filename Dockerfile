FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY src/ src/
COPY tsconfig.json vitest.config.ts ./

EXPOSE 3000

# pennywatch.config.ts is mounted at runtime via docker-compose volumes
CMD ["node_modules/.bin/tsx", "src/index.ts"]
