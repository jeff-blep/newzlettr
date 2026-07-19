FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_ORIGIN=http://127.0.0.1:3001
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN

RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
