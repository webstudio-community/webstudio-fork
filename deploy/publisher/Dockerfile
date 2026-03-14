FROM node:22-alpine

# Install only the webstudio CLI globally (pure JS, no native binaries — works on arm64/QEMU).
# vite is NOT installed globally: the workdir's npm install provides it, and npx vite picks it up.
RUN npm install -g webstudio@latest

WORKDIR /app

COPY server.mjs /app/server.mjs

# Create mount point directories
RUN mkdir -p /var/publish /var/work

ENV PORT=4000
EXPOSE 4000

CMD ["node", "/app/server.mjs"]
