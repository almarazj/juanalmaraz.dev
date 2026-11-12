FROM node:24-slim AS build
RUN npm install -g pnpm@12.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG PUBLIC_VERSION
ARG PUBLIC_COMMIT
ARG PUBLIC_BRANCH
ARG PUBLIC_CF_BEACON
ENV PUBLIC_VERSION=$PUBLIC_VERSION PUBLIC_COMMIT=$PUBLIC_COMMIT PUBLIC_BRANCH=$PUBLIC_BRANCH PUBLIC_CF_BEACON=$PUBLIC_CF_BEACON
RUN pnpm build && CI=true pnpm prune --prod
# astro lists its build toolchain as a dependency, but the server never loads these native binaries.
RUN rm -rf node_modules/.pnpm/@rolldown* node_modules/.pnpm/@esbuild* node_modules/.pnpm/lightningcss* node_modules/.pnpm/@astrojs+compiler-binding* node_modules/.pnpm/@types*

FROM node:24-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
ENV PORT=8080 HOST=0.0.0.0 AWS_LWA_READINESS_CHECK_PATH=/internal/ready NODE_ENV=production
USER node
CMD ["node", "dist/server/entry.mjs"]
