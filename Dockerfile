FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --frozen-lockfile --production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]