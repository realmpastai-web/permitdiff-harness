# PermitDiff mock harness image.
# Real Copilot CLI execution is HELD. This image does not fetch or run it.
FROM node:22-bookworm-slim

WORKDIR /app

ENV COPILOT_AUTO_UPDATE=false

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests
COPY fixtures ./fixtures
COPY docs ./docs

CMD ["npx", "vitest", "run"]
