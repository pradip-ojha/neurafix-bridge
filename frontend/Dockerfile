# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
# nginx official image auto-processes /etc/nginx/templates/*.template via envsubst on start.
# Set MAIN_BACKEND_URL env var at runtime (e.g. http://main_backend:8000).
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
