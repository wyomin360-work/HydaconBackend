FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --frozen-lockfile --production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
