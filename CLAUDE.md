# CLAUDE.md

Community fork of Webstudio for self-hosting. pnpm monorepo: `apps/builder`
(Remix + Vite), `packages/`, `fixtures/`. Node 22, pnpm only.

## Fork maintenance

- `develop` = `upstream/main` + a short series of thematic patches, listed in
  `COMMUNITY_CHANGES.md` and rebased at every upstream sync.
- PRs are squash-merged into `develop`, each with a `Patch: <title>` line in its
  description. The regroup routine later folds them into their patch.
- Regroup and sync conflicts are automated: `sync-upstream.yml` fires the
  routines, which open a `regroup/*` or `sync/rebase-*` PR to `main`;
  `promote-regroup.yml` moves `develop` to it when CI is green (or red only
  where upstream is red too).
- `approve-routine.yml` handles the approval issues opened from the
  `webstudio-issues-weekly` mails.
- A patch accepted upstream is dropped from the series and from the list.

## Fixture `bundleVersion`

`bundleVersion` (`packages/protocol/src/schema.ts`) hashes the schema. Fork
schema patches change it, so the upstream fixture stamps fail
`fixtures.test.ts`: run `pnpm fixtures:restamp` after a schema change
(`sync-upstream` does it after each rebase and auto-resolves stamp-only
conflicts).

The npm `webstudio` CLI sends upstream's hash. A fork-only field the CLI never
reads (e.g. `customDomains`) must be `.omit()`-ed before `createContractVersion`,
or that CLI breaks against every fork instance.

## Commands

```bash
pnpm dev                                                    # builder
pnpm --filter='@webstudio-is/builder' test -- run <file>    # one test file
pnpm -r --filter='./packages/**' build                      # internal packages
pnpm migrations migrate
```

Full `pnpm checks` / `typecheck` / `build` are too heavy for the Pi: let CI run
them.

## Local backend

`apps/builder/backend/` holds PostgreSQL + PostgREST: `pnpm backend development up -d`
(never plain `docker compose`: the mode picks the override file). Credentials
come from the committed `apps/builder/.env`; don't set `POSTGRES_USER` (the
Supabase image bootstraps `supabase_admin`).

Start the builder with `DOCKER_DEV=true pnpm dev` (a shell variable, not read
from `.env.development`), then open `https://localhost:5173` and log in with
`AUTH_SECRET` (`1234`).

After an upstream sync, `pnpm install --no-frozen-lockfile` may be needed:
upstream's lockfile lacks fork-only dependencies.

## Pitfalls

- **`__Host-` cookies need HTTPS.** `ALLOW_INSECURE_COOKIES=true` drops the
  prefix and `Secure` for plain-HTTP testing; refused in production.
- **Standalone deploy.** `pnpm --prod deploy /standalone` only links direct
  dependencies of `apps/builder`: a transitive-only runtime import crashes with
  `ERR_MODULE_NOT_FOUND`. Declare it directly in `apps/builder/package.json`.
  `verify-standalone-deps.yml` checks the bundle; `docker-publish.yml` only
  publishes after it passes, from the verified commit.
- **Generated sites install `@webstudio-is/*` from npm (upstream).** A fork fix
  in those packages never reaches published sites: ship it through the CLI
  templates.
- **Testing a builder branch:** deploy its `builder:<branch>` image; the
  publisher runs the CLI that image serves on `/npm/`.
- `sdk-components-animation` is proprietary: never modify it.

## Conventions

Enforced by oxlint: kebab-case files, named React imports, arrow functions,
`node:` imports, no `console.log`, `===`.

- Vitest, tests next to the source. `*.browser.test.tsx` run in Chromium (CI
  only); `vi.mock` misses pre-bundled deps there, use `vi.spyOn`.
- `~` → `apps/builder/app/`. `__generated__/` is not linted.
- Export condition `"webstudio"` splits builder code from site runtime.

## Comments & commits

Match upstream Webstudio: comments are rare (<1 % of lines).

- No comment by default; a clear name beats a comment. Comment only a
  non-obvious *why*: external constraint, workaround, trap, required order.
  - ✅ `// Navigation can discard Chrome's body before the next DOM poll.`
  - ❌ `// Check if any custom domains are selected` (restates the code)
- One line, plain English, present tense; three lines at most.
- JSDoc only for a non-trivial exported API, `@deprecated`, or component props
  (they feed the builder's prop descriptions); no `@param` / `@returns` that
  repeat the signature.
- Never: our own issue/PR numbers, history ("now", "used to", "fix:"), section
  banners, emojis, French, step numbering that mirrors the code. An upstream
  issue link that tells when to drop a workaround is fine. In upstream files,
  prefix fork-only comments with `Community fork:`.
- Config files (YAML, `.env`, Dockerfile, nginx): one line for each non-obvious
  setting.
- Commits: `type(scope): summary`, imperative, lowercase, ≤ 72 chars, English,
  one `(#n)` at most. Body: why, in short prose.
- PRs: problem, cause, fix in 1–2 paragraphs; a `- [x]` checklist of the checks
  actually run; `Patch: <title>`; `Closes #n` / `Ref #n` last.
