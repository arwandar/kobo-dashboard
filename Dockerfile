FROM node:lts-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm install              
RUN npm run build            

FROM node:lts-slim
ENV NODE_ENV="production"
WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev 
COPY --from=builder /app/dist ./dist 
EXPOSE 5174
CMD ["npm", "start"]