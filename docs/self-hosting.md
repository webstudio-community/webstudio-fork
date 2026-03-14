# Self-hosting Webstudio

> **Requirements:** Linux server · Docker ≥ 24 · Compose v2 · 2 GB RAM · 10 GB disk

---

## Local install

## Deploy with Coolify (recommended)

[Coolify](https://coolify.io) handles SSL, reverse proxy, and restarts automatically.

### 1 — Create the service

In your Coolify project: **New resource → Docker Compose → From a Git repository**

- Repository: `https://github.com/webstudio-is/webstudio`
- Compose file: `deploy/docker-compose.coolify.yml`

### 2 — Configure domains

In the `app` service settings, set **one domain**:

```
webstudio.your-domain.com
```

The canvas subdomains (`p-<id>.your-domain.com`) are routed automatically by
the Traefik labels defined in `docker-compose.coolify.yml` — no second domain
to add in Coolify's UI.

However, you still need a **wildcard DNS record** on your DNS provider so that
`*.your-domain.com` resolves to your server:

```
*.your-domain.com  →  your-server-IP
```

In the `nginx` service settings, set no domain, but fill

1. the PUBLISHER_HOST.
2. the labels

you will need to configure DNS for `*.{PUBLISHER_HOST}`

### 3 — Set environment variables

Coolify auto-generates these — leave them as-is:

- `SERVICE_PASSWORD_DB`
- `SERVICE_PASSWORD_AUTH`
- `SERVICE_BASE64_64_PGRST`
- `SERVICE_FQDN_APP_3000`

Set these manually:

```env
# How users log in — choose one:

# Option A: simple password login (password = AUTH_SECRET value)
DEV_LOGIN=true
DEV_LOGIN_EMAIL=admin@example.com

# Option B: GitHub OAuth
# GH_CLIENT_ID=...
# GH_CLIENT_SECRET=...

# Option C: Google OAuth
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
```

Everything else has working defaults for self-hosting.

### 4 — Deploy

Click **Deploy** in Coolify. First deploy takes 2–3 min (builds the image, runs DB migrations).

---

## Deploy with plain Docker Compose

```bash
git clone https://github.com/webstudio-is/webstudio.git
cd webstudio

cp deploy/.env.example deploy/.env
# Edit deploy/.env — change every "change-me" value

docker compose -f deploy/docker-compose.yml up -d
```

The builder is then available at `http://localhost:3000`.

To generate the required secrets:

```bash
# AUTH_SECRET
openssl rand -hex 32

# PGRST_JWT_SECRET (must be ≥ 64 characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Wildcard SSL with Cloudflare + Coolify

To get a valid wildcard SSL certificate for `*.your-domain.com`, Traefik needs
to solve an ACME DNS challenge via Cloudflare's API. This works on the
Cloudflare free plan and does not require proxying through Cloudflare.

### 1 — Create a Cloudflare API token

In Cloudflare dashboard → **My Profile → API Tokens → Create Token**

Use the **"Edit zone DNS"** template, restrict it to your domain, and save the token.

### 2 — Add DNS records in Cloudflare

Add two records, both set to **DNS only** (grey cloud ☁️ — not proxied):

| Type | Name                | Content        |
| ---- | ------------------- | -------------- |
| A    | `your-domain.com`   | your server IP |
| A    | `*.your-domain.com` | your server IP |

Setting them to DNS only means Traefik handles TLS termination directly.

### 3 — Configure Traefik in Coolify

In Coolify → **Server → Proxy configuration**, add to Traefik's command args:

```yaml
- "--certificatesresolvers.cloudflare.acme.email=your@email.com"
- "--certificatesresolvers.cloudflare.acme.storage=/traefik/acme.json"
- "--certificatesresolvers.cloudflare.acme.dnschallenge=true"
- "--certificatesresolvers.cloudflare.acme.dnschallenge.provider=cloudflare"
- "--certificatesresolvers.cloudflare.acme.dnschallenge.resolvers=1.1.1.1:53,1.0.0.1:53"
```

And add the API token to Traefik's environment:

```yaml
environment:
  - CF_DNS_API_TOKEN=your-cloudflare-api-token
```

### 4 — Set the certificate resolver in Coolify

In your `app` service settings in Coolify, set the certificate resolver to
`cloudflare` (matching the name used in the `--certificatesresolvers` args above).

Traefik will then automatically request and renew a wildcard certificate for
`*.your-domain.com` by adding a temporary DNS TXT record via the Cloudflare API.

---

## Publishing sites

> **The "Publish" button does not work in self-hosted mode.**

Clicking Publish creates build data in the database but returns:

```
Build data for publishing has been successfully created.
Use the Webstudio CLI to generate the code.
```

This is expected. The cloud Publish button deploys to Cloudflare Workers — infrastructure that is not part of the open-source repo.

### How to publish a project with the CLI

```bash
# On your deployment machine:
npx @webstudio-is/cli sync --origin https://webstudio.your-domain.com

# This generates a self-contained React Router project.
# Build and host it anywhere: VPS, Vercel, Netlify, Docker…
```

The generated site runs independently — the builder does not need to stay online.

Full CLI docs: https://docs.webstudio.is/university/self-hosting/cli

Video walkthrough — deploying a self-hosted site from Webstudio with Coolify:
https://www.youtube.com/watch?v=OnHLO2Plt2E

---

## Known limitations

### Publishing a site

Clicking **Publish** in the builder saves the build data in the database but
does not deploy anything automatically. You must run the CLI to generate and
deploy the site (see [Publishing sites](#publishing-sites)). The staging preview
URL shown in the builder UI (`myproject.your-publisher-host.com`) will return
a "no available server" error — this is expected.

### Custom domains

The "Add domain" feature in the builder is designed for the cloud version
(Cloudflare Workers infrastructure). In self-hosted mode it has no effect:
verifying and routing a custom domain to a published site is not supported
out of the box.

---

## All environment variables

| Variable                                                                                | Required | Default             | Description                                                                      |
| --------------------------------------------------------------------------------------- | -------- | ------------------- | -------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                                     | ✅       | —                   | PostgreSQL password                                                              |
| `DATABASE_URL`                                                                          | ✅       | —                   | PostgreSQL connection URL                                                        |
| `DIRECT_URL`                                                                            | ✅       | —                   | Direct PostgreSQL URL (bypasses pooler, used by migrations)                      |
| `PGRST_JWT_SECRET`                                                                      | ✅       | —                   | Secret for PostgREST JWT auth (≥ 64 chars)                                       |
| `AUTH_SECRET`                                                                           | ✅       | —                   | Session cookie signing secret                                                    |
| `DEV_LOGIN`                                                                             | —        | —                   | `true` = password login (password = `AUTH_SECRET`)                               |
| `DEV_LOGIN_EMAIL`                                                                       | —        | `admin@example.com` | Email for dev login                                                              |
| `GH_CLIENT_ID` / `GH_CLIENT_SECRET`                                                     | —        | —                   | GitHub OAuth                                                                     |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                             | —        | —                   | Google OAuth                                                                     |
| `PUBLISHER_HOST`                                                                        | —        | `wstd.work`         | Domain shown in the builder UI for staging URLs. Does not serve published sites. |
| `FEATURES`                                                                              | —        | `*`                 | Feature flags (`*` = all enabled)                                                |
| `USER_PLAN`                                                                             | —        | `pro`               | Plan level for all users                                                         |
| `MAX_ASSETS_PER_PROJECT`                                                                | —        | `50`                | Asset upload limit per project                                                   |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | —        | —                   | S3-compatible storage. Omit to use a local Docker volume.                        |

---

## Updating

```bash
# Docker Compose
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d

# Coolify: click "Redeploy" in the UI
```

DB migrations run automatically on every restart.
