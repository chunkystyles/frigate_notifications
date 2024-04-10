FROM node:21-slim
WORKDIR /app
CMD ["node", "app.js"]
COPY package*.json ./
RUN npm ci --no-audit
COPY *.js ./
COPY *.yml ./
