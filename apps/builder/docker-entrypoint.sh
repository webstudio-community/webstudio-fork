#!/bin/sh
set -e

# No PgBouncer: DATABASE_URL serves as DIRECT_URL.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL}}"

# Anon HS256 JWT from PGRST_JWT_SECRET unless set.
if [ -z "${POSTGREST_API_KEY}" ] && [ -n "${PGRST_JWT_SECRET}" ]; then
  export POSTGREST_API_KEY=$(node -e "
    const crypto = require('node:crypto');
    const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const p = Buffer.from(JSON.stringify({role:'anon'})).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.PGRST_JWT_SECRET).update(h+'.'+p).digest('base64url');
    console.log(h+'.'+p+'.'+sig);
  ")
fi

echo "Running database migrations..."
/prisma/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting Webstudio builder..."
exec node /app/server.js
