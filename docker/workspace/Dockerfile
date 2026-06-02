# Hermes Studio workspace (production)
#
# Builds the SSR bundle (`pnpm build` → /app/dist) and runs the
# production server-entry.js. The old version ran `pnpm dev` which
# served raw /src paths to the browser and leaked server-only
# modules (gateway-capabilities) into the client — see CY.10.

# ─── Build stage ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# python/make/g++ for better-sqlite3 native addon build
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN npm install -g pnpm@10 && pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm build

# ─── Runtime stage ────────────────────────────────────────────────────
FROM node:22-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server-entry.js ./
# Operator CLI scripts (create-user, provision-launch-profiles, ...). This is
# the Dockerfile docker-compose actually builds hermes-studio from, so the
# GAP-VER-007 COPY lines must live HERE, not only in the unused root Dockerfile.
# Without this the documented `docker exec <studio> npx tsx scripts/<file>.ts`
# workarounds fail because /app/scripts/ does not exist in the runtime image.
# `src/` is required too: several scripts import from `../src/...` (e.g.
# create-user.ts -> ../src/server/password-hash), which tsx compiles on the fly.
# `tsconfig.json` lets tsx resolve `@/` path aliases. (GAP-VER-007-B)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Hermes profile data + .env live on the shared hermes-state volume
# mounted at /root/.hermes by docker-compose. Keep the runtime user as
# root so the existing volume permissions continue to work.

ENV HERMES_API_URL=http://hermes-agent:8642

EXPOSE 3000

CMD ["node", "server-entry.js"]
