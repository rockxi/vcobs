FROM node:22-bookworm-slim
# Codex's native HTTPS client uses the system trust store, not Node's bundled CAs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates bash curl git python3 \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global @openai/codex@0.159.2 && npm cache clean --force
WORKDIR /service
COPY --chown=node:node . ./
RUN mkdir -p /data/codex /workspace && chown -R node:node /data /workspace
ENV NODE_ENV=production PORT=3090 VCOBS_CHAT_DATA_DIR=/data CODEX_HOME=/data/codex
USER node
EXPOSE 3090
CMD ["node", "server.mjs"]
