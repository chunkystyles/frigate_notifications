FROM node:21-slim
WORKDIR /app
COPY *.json ./
COPY *.js ./
COPY *.yml ./
RUN npm ci
CMD ["node", "app.js"]
