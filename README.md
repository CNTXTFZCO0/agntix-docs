# Agentix Developer Portal

Public-facing documentation for the Agentix API. Built with [Mintlify](https://mintlify.com).

> Looking for the playbook on how this site was built and how to keep it safe?
> Read [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md). For a per-route classification of what is and isn't documented, see [`ROUTE_AUDIT.md`](./ROUTE_AUDIT.md).

## Local development

```bash
pnpm install
pnpm sync:openapi   # pull a fresh, internal-stripped spec from the gateway
pnpm dev            # boots Mintlify on http://localhost:3000
```

## Available scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run the Mintlify dev server with hot reload |
| `pnpm sync:openapi` | Fetch `${GATEWAY_BASE_URL}/docs/json`, run the allowlist + denylist filter, and write `openapi/agentix.json` |
| `pnpm lint:internal` | CI guard — fails if any MDX page or the spec contains an internal-only slug or secret |
| `pnpm broken-links` | Mintlify's link checker |
| `pnpm check` | `broken-links` + `lint:internal` (run this in CI before deploying) |

## Environment variables

| Var | Default | Used by |
|---|---|---|
| `GATEWAY_BASE_URL` | `https://api.agntix.ai` | `scripts/sync-openapi.ts` |
| `MINT_PREVIEW` | unset | `docs.json` (when `true`, swaps SEO to `noindex`) |

## Three-layer defense against leaking internal APIs

1. **Source** — [`agntix-gateway/src/openapi/openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) `isInternalPath` strips internals before they ever reach `/docs/json`.
2. **Build** — [`scripts/sync-openapi.ts`](./scripts/sync-openapi.ts) re-applies an allowlist + denylist when writing the committed spec.
3. **CI** — [`scripts/lint-internal-paths.ts`](./scripts/lint-internal-paths.ts) blocks PRs that introduce internal-looking slugs anywhere in the repo.

If any single layer is misconfigured, the other two still protect customers from accidental exposure.

## Deployment

The Mintlify GitHub app deploys `main` automatically to `docs.agntix.ai`.

PR previews deploy to `pr-<n>.agntix.mintlify.app` with `noindex` headers (set via `MINT_PREVIEW=true` in the workflow).

See [`.github/workflows/`](./.github/workflows/) for the wiring.

## Contributing

1. Edit MDX in `introduction.mdx`, `quickstart.mdx`, `guides/`, `webhooks/`, `errors/`, `sdks/`.
2. **Never** edit `openapi/agentix.json` by hand — re-run `pnpm sync:openapi`.
3. **Never** add a route to the docs without first updating [`ROUTE_AUDIT.md`](./ROUTE_AUDIT.md) and confirming with the owning team that the endpoint is customer-safe.
4. Run `pnpm check` before opening a PR.
