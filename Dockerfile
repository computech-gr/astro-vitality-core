FROM oven/bun:1.2.22 AS dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
WORKDIR /app
COPY . .
ARG VITE_SUPABASE_PROJECT_ID=local
ARG VITE_SUPABASE_URL=http://127.0.0.1:54321
ARG VITE_SUPABASE_PUBLISHABLE_KEY=local-publishable-key
ARG VITE_SITE_ORIGIN=http://localhost:3000
ENV VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SITE_ORIGIN=${VITE_SITE_ORIGIN}
RUN bun run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts/serve-dist.mjs ./scripts/serve-dist.mjs
EXPOSE 3000
CMD ["node", "scripts/serve-dist.mjs"]
