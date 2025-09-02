# Frontend Dockerfile

# Stage 1: Build frontend
FROM node:20 AS build

WORKDIR /app

# Copy package.json and lock first
COPY package*.json ./

RUN npm install

# Copy rest of frontend
COPY . .

# Build Vite project
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy build to nginx html folder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy default nginx config (optional for SPA routing)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
