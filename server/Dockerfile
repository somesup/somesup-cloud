FROM node:20-alpine3.16 AS base

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
ENV CI=1

RUN corepack enable

COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN apk add --no-cache openssl
RUN pnpm run db:generate
RUN pnpm run build

FROM base AS prod
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

EXPOSE 8000
CMD ["pnpm", "start"]
