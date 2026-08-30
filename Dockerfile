# Etap 1: budujemy frontend (React + Vite)
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Etap 2: runtime backendu (Express)
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
EXPOSE 3001
ENV PORT=3001
CMD ["node", "backend/server.js"]
