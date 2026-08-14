# Build del frontend (Vue 3 + Vite)
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# Build del backend (NestJS) — incluye devDependencies porque el CLI de
# Prisma (necesario para `migrate deploy` al arrancar el contenedor) vive ahí.
FROM node:24-alpine AS backend-build
WORKDIR /app/backend
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/ ./
RUN pnpm prisma:generate
RUN pnpm build

# Runtime: un solo proceso sirve la API (/api) y el frontend estático.
# Se reutiliza el node_modules ya instalado en backend-build (evita reinstalar).
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PATH="/app/backend/node_modules/.bin:${PATH}"

COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=backend-build /app/backend/tsconfig.json ./tsconfig.json
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 3000
CMD sh -c "node_modules/.bin/prisma migrate deploy && node_modules/.bin/prisma db seed && node dist/main.js"
