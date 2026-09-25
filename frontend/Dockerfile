# Serves the production build with nginx, which also proxies /api to the api service.
#
# WHY THERE IS NO NODE BUILD STAGE HERE
# ------------------------------------
# This network performs TLS inspection. Inside a container npm does not trust the
# corporate root CA, so any `npm install` against registry.npmjs.org fails with
# UNABLE_TO_GET_ISSUER_CERT_LOCALLY. The host build works because Windows trusts that CA.
#
# So the bundle is built on the host (`npm run build`) and copied in. The image still
# ships no Node runtime — which was the point of choosing a Vite SPA over Next.js.
#
# On a network without TLS inspection, restore the two-stage build:
#
#   FROM node:22-bookworm-slim AS build
#   WORKDIR /app
#   COPY package.json ./
#   RUN npm install --no-audit --no-fund
#   COPY tsconfig.json vite.config.ts index.html ./
#   COPY src ./src
#   RUN npm run build
#   FROM nginx:1.27-alpine
#   COPY --from=build /app/dist /usr/share/nginx/html
#
# Alternatively keep this file and pass the corporate CA in with NODE_EXTRA_CA_CERTS.

FROM nginx:1.27-alpine

# Fails with a clear error if dist/ is absent — run `npm run build` first.
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
