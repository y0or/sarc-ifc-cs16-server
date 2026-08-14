# Dockerfile do backend (API + WebSocket + Parser + RCON + serve o frontend
# estático). O CONTEXTO DE BUILD deste Dockerfile é a RAIZ do projeto
# (veja docker-compose.yml: build.context: . / build.dockerfile: backend/Dockerfile),
# para que também possamos copiar a pasta frontend/ (sem build step, HTML/JS puro).

FROM node:20-alpine

WORKDIR /app

# 1) Instala dependências do backend (cache de camada)
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev

# 2) Copia código-fonte do backend
COPY backend/src ./backend/src

# 3) Copia o frontend estático (servido diretamente pelo Express, sem build)
COPY frontend ./frontend

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
