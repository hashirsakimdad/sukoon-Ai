FROM node:22-slim
WORKDIR /app
RUN mkdir -p data
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
