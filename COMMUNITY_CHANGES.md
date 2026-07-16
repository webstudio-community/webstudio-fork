# Community Fork — Changes Over Upstream

`develop` = `upstream/main` + this patch series, rebased on top of upstream at
every sync:

1. `feat(docker): self-host build support for the builder` — Dockerfile, entrypoint, production server, deps/build fixes, WSL dev setup
2. `fix(s3): MinIO compatibility for asset upload and serving` — SigV4 signer, undici header workarounds
3. `feat(domains): self-hosted custom domains` — real DNS TXT verification, Entri without Pro plan, apex domains, `customDomains` protocol
4. `feat(publish): self-hosted publishing with SSR/SSG modes` — `SELF_HOSTED_PUBLISHER_URL`, status callback, build mode selection
5. `feat(build-router): migrate build REST endpoints to tRPC`
6. `fix(pages): add PageTemplate schema and fix pageTemplates Map deserialization`
7. `ci: docker publish/cleanup and upstream sync workflows` — image build on PR/develop/release, GHCR pruning, scheduled upstream sync (publisher rebuild trigger, fixture-stamp conflict auto-resolution, flaky CLI test retry, deterministic `bundleVersion` re-stamp script)
8. `docs: fork documentation` — this file, CLAUDE.md, README

> **Maintainers**: new PRs are squash-merged on `develop`, then folded into the
> relevant patch (or added as a new one, updating this list) at the next
> upstream sync. When a change is accepted upstream, drop it from the series
> and from this list. History before the 2026-07-16 squash is preserved under
> the `backup/develop-pre-squash` tag.
