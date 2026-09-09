FROM node:20-alpine

WORKDIR /app

# Dependencies are their own layer, so editing source does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures

EXPOSE 4000

# tsx runs TypeScript directly, so there is no build step to fall out of date
# with the source in development.
CMD ["npx", "tsx", "watch", "src/server/index.ts"]
