FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 의존성 먼저 설치 (캐시 활용)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# 소스 복사 + 빌드
COPY . .
RUN pnpm run build

# 런타임
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-lock.yaml* ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/guardrails ./guardrails

EXPOSE 3000

CMD ["node", "dist/index.js"]
