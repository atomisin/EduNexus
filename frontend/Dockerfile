FROM node:20-alpine AS builder
WORKDIR /app

# Cache npm install layer
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Build with production env
COPY . .
ARG VITE_API_URL
ARG VITE_LIVEKIT_URL
ARG VITE_APP_NAME=EduNexus
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist \
  /usr/share/nginx/html
COPY nginx.conf \
  /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
