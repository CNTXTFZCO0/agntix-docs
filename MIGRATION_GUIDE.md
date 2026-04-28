# Migration Guide — Public Mintlify Developer Portal

> **Audience:** the engineer rolling out the Agentix public developer portal.
>
> **Scope:** everything from "no docs site exists" to "`docs.agntix.ai` is live, hardened, and self-maintaining."
>
> **Companion docs:**
>
> - [`ROUTE_AUDIT.md`](./ROUTE_AUDIT.md) — per-route KEEP / REMOVE / REWRITE / GATE classification.
> - [`README.md`](./README.md) — day-2 reference for contributors.
> - [`agntix-gateway/src/openapi/openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) — source-of-truth filter for internal paths.

---

## Table of contents

1. [Why this shape](#1-why-this-shape)
2. [Folder & repo structure](#2-folder--repo-structure)
3. [The three-layer defense for internal APIs](#3-the-three-layer-defense-for-internal-apis)
4. [Public information architecture](#4-public-information-architecture)
5. [Step-by-step Mintlify implementation](#5-step-by-step-mintlify-implementation)
6. [Developer experience: the golden path](#6-developer-experience-the-golden-path)
7. [API documentation best practices](#7-api-documentation-best-practices)
8. [Design & usability rules](#8-design--usability-rules)
9. [CI/CD wiring](#9-cicd-wiring)
10. [Rollout checklist](#10-rollout-checklist)
11. [Day-2 operations](#11-day-2-operations)

---

## 1. Why this shape

The Agentix workspace already does most of the hard work for us:

- The **gateway** ([`agntix-gateway`](../agntix-gateway)) aggregates the chat-engine and voice-api OpenAPI specs and exposes a single merged spec at `GET /docs/json`.
- That endpoint already filters internal paths via `OpenApiService.isInternalPath`.
- `routes.yaml` is the canonical list of routes the gateway accepts.

So the strategy is straightforward:

1. **Tighten** the gateway's internal-path filter so it can't leak.
2. **Snapshot** the filtered spec into the docs repo at build time.
3. **Auto-render** the API reference from that snapshot via Mintlify.
4. **Hand-write** the narrative pages (Getting Started, guides, errors, etc.).

```text
┌────────────────────┐    ┌────────────────────┐
│  chat-engine       │    │  voice-api         │
│  /api/v1/docs/json │    │  /openapi.json     │
└─────────┬──────────┘    └──────────┬─────────┘
          │                          │
          ▼                          ▼
   ┌──────────────────────────────────────┐
   │ agntix-gateway OpenApiService        │
   │ • isInternalPath()  ← LAYER 1        │
   │ • dropTagsByName()                   │
   │ • respects x-internal: true          │
   └────────────────────┬─────────────────┘
                        │  GET /docs/json
                        ▼
   ┌──────────────────────────────────────┐
   │ scripts/sync-openapi.ts (LAYER 2)    │
   │ • allowlist (regex)                  │
   │ • denylist (regex) — fails build     │
   └────────────────────┬─────────────────┘
                        │  writes
                        ▼
   ┌──────────────────────────────────────┐
   │ openapi/agentix.json (committed)     │
   └────────────────────┬─────────────────┘
                        │  read by Mintlify
                        ▼
   ┌──────────────────────────────────────┐
   │ Mintlify (docs.json)                 │
   │ + Hand-written MDX (Getting Started, │
   │   Guides, Webhooks, Errors, …)       │
   └────────────────────┬─────────────────┘
                        │
                        ▼  (CI: lint-internal-paths.ts ← LAYER 3)
   ┌──────────────────────────────────────┐
   │       docs.agntix.ai                 │
   └──────────────────────────────────────┘
```

---

## 2. Folder & repo structure

The portal lives in a sibling directory to the gateway:

```text
agntix-docs-portal/
├── MIGRATION_GUIDE.md           ← you are here
├── ROUTE_AUDIT.md               ← keep/remove decisions for every route
├── README.md                    ← day-2 reference for contributors
├── docs.json                    ← Mintlify v3 config (theme, IA, navigation)
├── package.json                 ← mint CLI + sync/lint scripts
├── tsconfig.json                ← for the TS scripts
├── .gitignore
├── .github/workflows/
│   ├── docs-preview.yml
│   ├── docs-deploy.yml
│   └── openapi-sync.yml
├── scripts/
│   ├── sync-openapi.ts          ← LAYER 2 — fetch + filter + write spec
│   └── lint-internal-paths.ts   ← LAYER 3 — CI guard against slug leaks
├── openapi/
│   └── agentix.json             ← committed, generated artifact
├── snippets/                    ← reusable MDX
│   ├── auth-callout.mdx
│   └── api-base-url.mdx
├── images/logo/{light,dark,favicon}.svg
├── introduction.mdx             ← top-level pages
├── quickstart.mdx
├── authentication.mdx
├── concepts.mdx
├── changelog.mdx
├── api-reference/
│   └── introduction.mdx         ← (rest auto-generated from openapi/agentix.json)
├── guides/
│   ├── build-your-first-agent.mdx
│   ├── chat-with-rag.mdx
│   ├── voice-calls.mdx
│   ├── call-campaigns.mdx
│   ├── knowledge-stores.mdx
│   ├── tools.mdx
│   ├── streaming-events.mdx
│   ├── rate-limits.mdx
│   └── pagination.mdx
├── sdks/
│   ├── overview.mdx
│   ├── curl.mdx
│   ├── node.mdx
│   └── python.mdx
├── webhooks/
│   ├── overview.mdx
│   ├── events.mdx
│   └── verify-signatures.mdx
└── errors/
    ├── error-codes.mdx
    └── troubleshooting.mdx
```

Why a separate top-level directory rather than nesting under `agntix-gateway/`?

- We want to be able to open-source the docs without leaking gateway internals.
- Mintlify's GitHub app expects the docs at the root of its repo (or a configured subpath); a sibling dir keeps that future migration trivial.
- It cleanly separates docs CI from gateway CI.

---

## 3. The three-layer defense for internal APIs

This is the heart of the playbook. **No single layer is allowed to be the only defense.**

### Layer 0 — Backend reality

Removing an endpoint from the docs does **not** remove it from the network. Every internal controller must keep its existing guard (`AdminJwtAuthGuard`, `InternalGuard`, IP allowlist, etc.). The docs are about *visibility*; backend guards are about *authorization*.

**Action items captured during the audit (track separately):**

| Controller | File | Issue |
|---|---|---|
| `SchedulerController` | `chat-engine/src/scheduler/scheduler.controller.ts` | No guard — add `@UseGuards(AdminJwtAuthGuard)` |
| `ModelsController.create` | `chat-engine/src/models/models.controller.ts` line 31 | `AdminJwtAuthGuard` is commented out — re-enable |
| `OnboardingController` | `chat-engine/src/onboarding/onboarding.controller.ts` | No guard |
| `WhatsappController.findAll` | `chat-engine/src/whatsapp/whatsapp.controller.ts` line 52 | No guard |
| `UsersController` | `chat-engine/src/users/users.controller.ts` | Empty placeholder — delete or implement |

### Layer 1 — Source: the gateway's `isInternalPath`

Edit [`agntix-gateway/src/openapi/openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) `isInternalPath`. Today's full pattern list:

```typescript
const internalPatterns = [
  '/admin/',
  '/scheduler/',
  '/metering/',
  '/meters/',
  '/onboarding/',
  '/n8n/',
  '/internal/',
  '/queue/admin/',
  '/queue/testing/',
  '/ws/authenticate',
  '/ws/',
  '/whatsapp/receive',
  '/whatsapp-tenant-configs',
  '/voice/usage',
  '/voice/phone-number/charge',
  '/users/',
];
```

The same file also strips:

- Tags whose name matches `/admin|internal|scheduler|metering|meters|n8n|onboarding|whatsapp tenant/i` (so the API Reference UI doesn't grow phantom internal categories).
- Any operation that sets the OpenAPI extension `x-internal: true` (so backend authors can surgically hide a single endpoint without touching the pattern list).

It also exports `dropEmptyTags` and re-tests under `openapi.service.spec.ts` — the test file enumerates every pattern so a regression breaks CI loudly.

### Layer 2 — Build pipeline: `scripts/sync-openapi.ts`

`pnpm sync:openapi` does four things:

1. Fetches `${GATEWAY_BASE_URL}/docs/json`.
2. Walks every path. If the path matches a **deny** regex (defense-in-depth list mirroring `isInternalPath`), the script **fails the build with exit code 2**. This is what catches a misconfigured gateway.
3. If the path matches the **allow** regex, it's written to the output. Otherwise it's logged as "skipped — add to allowlist if customer-safe."
4. Drops internal-named tags, normalizes the `info` block, sets the canonical `servers[]`, and writes `openapi/agentix.json` (only if the contents actually changed — keeps git diffs minimal).

The committed `openapi/agentix.json` is the **only** source Mintlify reads. Manual edits are forbidden.

### Layer 3 — Lint: `scripts/lint-internal-paths.ts`

Walks every `*.mdx` page and the committed spec, fails CI if it finds:

- An internal route slug (`admin`, `scheduler`, `metering`, `n8n`, `onboarding`, `internal`, `queue/admin`, `queue/testing`, `whatsapp/receive`, `whatsapp-tenant-configs`, `voice/usage`, `voice/phone-number/charge`).
- An internal env secret (`INTERNAL_SECRET`, `x-internal-secret`, `JIRA-…`).
- A real-looking live key (`sk_live_…`, `pk_live_…` — the linter explicitly tolerates `pk_live_xxxxxxxxxx` placeholder examples).

The lint runs on every PR via `.github/workflows/docs-preview.yml`.

### Operational guarantees

- Mintlify only serves SEO-indexable pages from `main`. Preview deployments swap `metatags.robots = "noindex"` via the `MINT_PREVIEW=true` env var.
- The chat-engine Swagger UI at `/api/v1/docs`, the raw spec at `/api/v1/docs/json`, and the Scalar playground at `/api/v1/playground` all return `X-Robots-Tag: noindex, nofollow` (added in `chat-engine/src/utils/app.ts`). The aggregated gateway spec at `/docs/json` returns the same header.

---

## 4. Public information architecture

The portal's IA is driven by the **customer journey**, not by backend services.

### Tab 1 — Documentation

| Group | Pages |
|---|---|
| Getting Started | `introduction`, `quickstart`, `authentication`, `concepts` |
| Build | `guides/build-your-first-agent`, `guides/chat-with-rag`, `guides/voice-calls`, `guides/call-campaigns`, `guides/knowledge-stores`, `guides/tools` |
| Real-time | `guides/streaming-events`, `webhooks/overview`, `webhooks/events`, `webhooks/verify-signatures` |
| SDKs & Examples | `sdks/overview`, `sdks/curl`, `sdks/node`, `sdks/python` |
| Operate | `guides/rate-limits`, `guides/pagination`, `errors/error-codes`, `errors/troubleshooting` |

### Tab 2 — API Reference

A single group with `"openapi": { "source": "/openapi/agentix.json", "directory": "api-reference" }` — Mintlify auto-generates one page per operation, grouped by tag.

### Tab 3 — Changelog

`changelog.mdx`, [Keep-a-Changelog](https://keepachangelog.com) format.

The full IA lives in [`docs.json`](./docs.json). Key choices baked into that file:

- `theme: "maple"`
- `colors`: brand purple (`#7c3aed`)
- `seo.metatags.robots = "index, follow"` — the docs site is the only thing we want indexed.
- `api.playground.display = "interactive"` — every reference page gets a "Try it" panel.
- `api.examples.languages = ["curl", "javascript", "python"]` — keep it to three. More languages = more noise.
- `api.mdx.auth.method = "bearer"` so the playground knows to inject auth headers from the user's saved key.

---

## 5. Step-by-step Mintlify implementation

> If you're reading this you are likely starting from a freshly-checked-out repo. Skip steps you've already done.

### 5.1 — Install the toolchain

```bash
cd agntix-docs-portal
pnpm install
```

The `package.json` ships `mint`, `tsx`, `axios`, `zod`, and `typescript`. No global installs needed.

### 5.2 — Pull a real OpenAPI spec

If you have access to a running gateway:

```bash
GATEWAY_BASE_URL=https://api.agntix.ai pnpm sync:openapi
```

If you're working locally:

```bash
GATEWAY_BASE_URL=http://localhost:3001 pnpm sync:openapi
```

The script writes `openapi/agentix.json`. Commit the result.

### 5.3 — Run the dev server

```bash
pnpm dev
```

Mintlify starts on `http://localhost:3000` with hot reload.

### 5.4 — Author or edit pages

- **Top-level pages** (`introduction.mdx`, `quickstart.mdx`, `authentication.mdx`, `concepts.mdx`, `changelog.mdx`) live at the root.
- **Topic pages** live under `guides/`, `sdks/`, `webhooks/`, `errors/`.
- **API reference pages** are auto-generated. Don't put hand-written files in `api-reference/` (other than `introduction.mdx`).

#### Frontmatter convention

```mdx
---
title: "Page title (≤ 50 chars)"
description: "One-line description used by Mintlify for SEO and the search index."
---
```

#### Component cheat-sheet

| Component | Use for |
|---|---|
| `<Steps><Step title="…">` | Step-by-step guides (Quickstart, Build your first agent) |
| `<CodeGroup>` | Multi-language code samples (always offer cURL + JS + Python in that order) |
| `<ResponseField>` | API response schema documentation |
| `<Tip>` / `<Warning>` / `<Note>` | Inline callouts |
| `<Card>` / `<CardGroup>` | "Where to next" sections |
| `<AccordionGroup><Accordion title="…">` | FAQ-style collapsibles (troubleshooting page) |

#### Reusable snippets

The two snippets in `snippets/` (`auth-callout.mdx`, `api-base-url.mdx`) are imported wherever the same content would otherwise repeat. To add a new one, drop a file into `snippets/` and import it:

```mdx
import AuthCallout from "/snippets/auth-callout.mdx";

<AuthCallout />
```

### 5.5 — Validate locally

```bash
pnpm check
```

`check` runs `broken-links` + `lint:internal`. Fix anything red before opening a PR.

### 5.6 — Wire deployment

1. Create the GitHub repo (`agntix-docs-portal`) and push.
2. Install the [Mintlify GitHub app](https://github.com/apps/mintlify) on the repo.
3. In the Mintlify dashboard, point the deployment at your `main` branch.
4. Set the custom domain to `docs.agntix.ai` (DNS: CNAME → `cname.mintlify.app`).
5. Verify SSL provisions and the first deploy lands.

After this, every push to `main` deploys automatically.

---

## 6. Developer experience: the golden path

Time-to-first-API-call is the single most important DX metric for a developer portal. We target **≤ 5 minutes** for a brand-new visitor.

The 5 screens of the golden path live in `quickstart.mdx`:

1. **Sign up + grab a key.** The first `<Steps>` block links to the dashboard's API Keys page. No friction.
2. **First call.** `GET /v1/chat/models` is cheap, fast, and auth-only. The response immediately confirms "your key works."
3. **Create an agent.** Minimal `POST /v1/chat/agents` body — three fields.
4. **Send a message.** Open a session, post a message, see the LLM reply.
5. **What's next.** A `<CardGroup>` with four next steps: RAG, voice, webhooks, production checklist.

Every step in the golden path:

- Shows cURL, Node, and Python in a `<CodeGroup>`.
- Pre-fills the user's API key via the `process.env.AGNTIX_API_KEY` placeholder.
- Includes a one-line success check ("a `200 OK` here means your key works").
- Links to the deeper API reference page so curious readers can dive in.

---

## 7. API documentation best practices

These rules are enforced by convention; reviewers should reject PRs that break them.

### Every reference page must show

1. **Title + one-line description** in the OpenAPI `summary`/`description`.
2. **Method + URL** (Mintlify renders this automatically).
3. **Auth callout** — re-use `<AuthCallout />` snippet at the top.
4. **Path/query/body params** — populated from the OpenAPI schema (every field needs `description`).
5. **Request example** in cURL, Node, Python (Mintlify auto-generates from the `examples.languages` config).
6. **Response example** — one success, at least one error.
7. **A "Try it" playground** — enabled globally via `docs.json`.

### Naming & shape

- **Path prefixes are stable.** Customers see `/v1/...` and `/v2/...`. Internal `/api/v1/...` legacy passthroughs stay in the gateway code but never appear in the docs.
- **One resource per tag.** `Agents`, `Sessions`, `Phone Numbers` — not `Chat Engine`, `Voice API`. Tags become reference sidebar groups.
- **IDs are prefixed and opaque.** `agnt_…`, `ses_…`, `msg_…`. Document them; never tell customers to parse them.
- **Pagination is uniform** — `?page=N&limit=N` with the standard envelope. Document on `/guides/pagination` and link, never repeat per-endpoint.

### Errors

- **One error envelope.** Document it once on `/errors/error-codes`; reference pages show `4xx` examples that match.
- **Application-level codes are stable.** `SESSION_NOT_FOUND`, `MODELS_NOT_FOUND`, etc. Document the full list — see `errors/error-codes.mdx`.

### Voice & SSE

- The streaming page is the canonical reference for SSE — every event type listed with payload schema.
- Voice latency tips live in `errors/troubleshooting.mdx` and `guides/voice-calls.mdx`. Always include the recommended TTS/STT models for "fast path."

---

## 8. Design & usability rules

The portal looks consistent because of a few small constraints baked into `docs.json`:

- **One brand color** (`#7c3aed`). Light/dark variants picked automatically.
- **One theme** (`maple`).
- **No more than 7 sidebar groups per tab.** Beyond that, customers can't scan.
- **Page titles ≤ 50 characters.**
- **Page descriptions ≤ 130 characters** (used for SEO meta + the in-page search snippet).
- **Examples come before prose.** A working code snippet at the top of every page is worth more than three paragraphs of context.
- **Cards for navigation, lists for facts.** `<CardGroup>` for "where next?" panels; markdown tables for comparison; bullet lists for definitions.
- **No screenshots of internal admin UIs.** Ever.

---

## 9. CI/CD wiring

Three GitHub Actions workflows ship in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `docs-preview.yml` | PR to `main` | Installs deps, runs `lint:internal`, validates the spec, posts a preview comment on the PR. The Mintlify GitHub app produces the preview itself. |
| `docs-deploy.yml` | Push to `main` | Runs `pnpm check` + a sanity grep over `openapi/agentix.json`. Mintlify auto-deploys after the workflow succeeds. |
| `openapi-sync.yml` | Nightly cron + `workflow_dispatch` + `repository_dispatch` (gateway release) | Re-runs `sync:openapi`, opens an auto-PR if the spec changed. Auto-PRs are tagged `documentation` + `automated` for filtering. |

A push to `main` is the only path to production. Preview deploys are `noindex`. The auto-PR pattern means **a gateway change never silently ships to public docs** — a human reviewer always inspects the spec diff first.

---

## 10. Rollout checklist

A one-time sequence to get from "nothing" to "live":

1. **Land the gateway PR.** Apply the changes in [`agntix-gateway/src/openapi/openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) (tightened `isInternalPath`, `hasInternalExtension`, `isInternalTag`) and [`agntix-gateway/src/openapi/openapi.controller.ts`](../agntix-gateway/src/openapi/openapi.controller.ts) (`X-Robots-Tag` headers). Verify the `openapi.service.spec.ts` test suite passes.
2. **Land the chat-engine PR.** Apply the noindex middleware in [`chat-engine/src/utils/app.ts`](../chat-engine/src/utils/app.ts).
3. **Run the [Backend hardening tickets](./ROUTE_AUDIT.md#4-backend-hardening-tickets-file-separately)** — at minimum `SchedulerController` and `WhatsappController.findAll` need guards before going live. These are blockers because removing them from docs doesn't remove them from the network.
4. **Land this `agntix-docs-portal/` directory.** Includes the guide, audit, scaffold, scripts, CI, and the fully-written sample pages.
5. **Run the audit review** with backend owners. For every row in `ROUTE_AUDIT.md` flagged `REWRITE` or `GATE`, get sign-off from the team that owns the controller. Fold any decisions back into `routes.yaml`/`isInternalPath` and re-run `pnpm sync:openapi`.
6. **Backfill remaining pages.** The skeleton already has stubs for the long-tail (call-campaigns, knowledge-stores, tools, etc.); flesh out anything still placeholder.
7. **Connect Mintlify.** Install the GitHub app, set the custom domain to `docs.agntix.ai`, run `pnpm check` once more, then push to `main` to trigger the first production deploy.
8. **Smoke-test with a developer who isn't on the team.** Watch them try the Quickstart end-to-end. Anywhere they pause is a docs bug.

---

## 11. Day-2 operations

Once live, the only things to keep in your head are:

- **Adding a new public endpoint.** Add a row to `ROUTE_AUDIT.md`, add (or confirm) the regex in the allowlist in `scripts/sync-openapi.ts`, then re-run `pnpm sync:openapi`. The auto-PR job does this nightly.
- **Hiding an endpoint in a hurry.** Either add the path to `isInternalPath` in the gateway and re-deploy (preferred), or set `x-internal: true` on the operation in the chat-engine controller (`@ApiExtension('x-internal', true)` if using `@nestjs/swagger`'s extension API).
- **Failing PR with "internal slug"?** Either remove the slug from the page (it's a customer-doc bug), or add the file to the rule's `allowFiles` regex in `scripts/lint-internal-paths.ts` (rare — usually only the audit doc + this guide).
- **Failing PR with "denylist match"?** The gateway is leaking. Fix `isInternalPath` (Layer 1), redeploy, then re-run `sync:openapi`. The build will pass once the gateway is honest.
- **Need to re-key the Mintlify app?** Mintlify dashboard → Settings → GitHub. The domain stays the same.

When in doubt: read this guide, then `ROUTE_AUDIT.md`, then the source of `openapi.service.ts`.
