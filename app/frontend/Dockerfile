# syntax=docker/dockerfile:1

# ---------- build: type-check and bundle the SPA ----------
FROM node:24.22.0-alpine3.24 AS build

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


# ---------- runtime: static files served by unprivileged nginx (port 8080) ----------
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24

# Where /api is proxied when the frontend is used on its own (Docker Compose).
# On Kubernetes the Ingress routes /api to the backend before it reaches nginx.
ENV API_UPSTREAM=http://backend:8000

# Fixable HIGH/CRITICAL CVEs in the base image: libexpat CVE-2026-113351 (2.10.0-r0),
# brotli-libs CVE-2026-111497 (1.2.1-r0), curl/libcurl CVE-2026-92392 (8.23.0-r0),
# libxslt CVE-2026-87636 (1.1.43-r4), musl/musl-utils CVE-2026-107891 (1.2.6-r3), zlib CVE-2026-85091 (1.3.2-r1).
# Require the fixed versions explicitly. Remove this block once the base image tag includes them.
USER root
RUN apk add --no-cache 'libexpat>=2.10.0-r0' 'brotli-libs>=1.2.1-r0' 'curl>=8.23.0-r0' 'libcurl>=8.23.0-r0' \
    'libxslt>=1.1.43-r4' 'musl>=1.2.6-r3' 'musl-utils>=1.2.6-r3' 'zlib>=1.3.2-r1'
USER 101

# Rendered by the image's entrypoint (envsubst) into /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
