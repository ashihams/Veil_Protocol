# Production image: install all deps → build with tsc → drop devDependencies.
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3402
ENV PORT=3402
CMD ["node", "dist/bin.js"]
