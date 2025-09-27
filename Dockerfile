FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./

RUN npm ci --legacy-peer-deps

# .env wird NICHT kopiert!
COPY . .

RUN mkdir -p logs

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 4000
CMD ["npm", "start"]