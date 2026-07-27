# Minimal Railway image — status/release pointer only.
# Never builds Electron/Next or touches user mail data.
FROM node:22-alpine
WORKDIR /app
COPY update-service/server.mjs ./server.mjs
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.mjs"]
