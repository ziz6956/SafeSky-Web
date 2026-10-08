# SafeSky backend — multi-stage build (постановка SAF-206).
# Stage 1: полная установка (включая dev-зависимости) → prisma generate → tsc.
# Stage 2: только prod-зависимости → меньше образ, нет typescript/vitest внутри.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Prisma на alpine: libssl нужен, иначе движок не определяет openssl
# (warn «Prisma failed to detect the libssl/openssl version»).
RUN apk add --no-cache openssl

# prisma CLI — в dependencies (а не devDependencies) намеренно:
# контейнер сам накатывает миграции при старте (prisma migrate deploy).
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist

# SAF-219: при старте `prisma migrate deploy` пишет в node_modules/@prisma/engines —
# каталог создан от root при сборке, поэтому отдаём его непривилегированному
# пользователю (иначе Render update_failed: «Can't write to /app/node_modules/@prisma/engines»).
RUN chown -R node:node /app

# Непривилегированный пользователь.
USER node

EXPOSE ${PORT}

# Миграции до запуска сервера: идемпотентны (накатываются только новые),
# для Render это самый простой путь «поднял — и работает».
# Отклонение от буквального CMD node dist/server.js из ТЗ — осознанное: без
# авто-миграций сервис упадёт на пустой Supabase-БД. При желании основатель
# может накатывать миграции вручную (`npm run migrate:deploy` с DATABASE_URL)
# и заменить CMD на ["node", "dist/server.js"].
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
