# syntax=docker/dockerfile:1
#
# Frontend de SoundIA (Angular). Se compila con Node y se sirve con nginx.
#
# NOTA: este Dockerfile no se pudo construir al escribirlo (la maquina de desarrollo no tiene Docker).
# Limitacion: la URL del API (src/environments/environment.ts) se fija al compilar; el navegador la llama
# directamente, asi que con otro host hay que cambiarla y reconstruir la imagen.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx ng build


FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/soundia-web-dj/browser /usr/share/nginx/html

EXPOSE 80
