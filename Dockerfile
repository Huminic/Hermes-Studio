# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json pnpm-lock.yaml .npmrc ./
RUN npm install -g pnpm@10 && pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm build

# --- Production stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S hermes && adduser -S hermes -G hermes

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server-entry.js ./
# Operator CLI scripts (create-user, provision-launch-profiles, ...). Without
# this the documented `npx tsx scripts/<file>.ts` workarounds fail because
# /app/scripts/ does not exist in the runtime image (GAP-VER-007). Run them with
# `docker exec <studio-container> npx tsx scripts/<file>.ts` — npx + tsx are in
# node_modules; pnpm is intentionally not installed in the runtime image.
# `src/` is required too: several scripts import from `../src/...` (e.g.
# create-user.ts -> ../src/server/password-hash), and tsx compiles those .ts
# modules on the fly. `tsconfig.json` lets tsx resolve `@/` path aliases.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000

USER hermes

CMD ["node", "server-entry.js"]

