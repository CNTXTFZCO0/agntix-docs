# Route Audit — Public Developer Portal

> Source data: [`agntix-gateway/config/routes.yaml`](../agntix-gateway/config/routes.yaml), [`agntix-gateway/src/openapi/openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts), every `*.controller.ts` in `chat-engine/src/`, and every router in `agntix-voice/src/voice_agent/api/routes/`.
>
> **How to read this:**
>
> | Decision | Meaning |
> |---|---|
> | **KEEP** | Document on the public portal. The endpoint is customer-facing and safe to expose. |
> | **REMOVE** | Strip from the public OpenAPI spec. Endpoint stays in the codebase but is hidden from docs. Backend must keep its admin/internal guard. |
> | **REWRITE** | Endpoint exists today but its current shape leaks internals (e.g. `/dashboard/...` or `/scheduler/...`). Either rename via gateway alias, or redesign the public surface before documenting. |
> | **GATE** | Endpoint family contains a mix of public and internal sub-routes. Split at the gateway via more specific `routes.yaml` entries before exposing. |
>
> Keep this file under version control. Re-run the audit any time a controller is added or `routes.yaml` is changed.

---

## 1. Summary

| Bucket | Count |
|---|---|
| KEEP (publicly documented) | 24 endpoint families |
| REMOVE (hidden from public docs) | 17 endpoint families |
| REWRITE (rename / redesign before exposing) | 3 |
| GATE (split into public + internal) | 2 |

---

## 2. Gateway routes — `agntix-gateway/config/routes.yaml`

### 2.1 chat-engine prefix (`/v1/chat/*`)

| Gateway path | Decision | Source controller | Current guard | Public name (in docs) | Rationale |
|---|---|---|---|---|---|
| `/v1/chat/agents/**` | **KEEP** | `chat-engine/src/agents/agents.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `agents`) | `Agents` | Core CRUD for customer agents. |
| `/v2/chat/agents/**` | **KEEP** | `chat-engine/src/agents/agents.v2.controller.ts` | `CompositeAuthGuard` + `RbacGuard` | `Agents (v2)` | New JSON-config agent shape. Document under separate "v2" tag. |
| `/v1/chat/chat/**` (sessions/messages) | **KEEP** | `chat-engine/src/chat/chat.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `chat`) | `Chat` | The main chat surface. |
| `/v2/chat/dashboard/**` | **REWRITE** | `chat-engine/src/dashboard/dashboard.v2.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `dashboard`) | `Usage & Stats` | The word "dashboard" implies an internal admin surface; in a public API, customers think "usage". Add a gateway alias `/v1/usage/**` → `dashboard` and document the alias. |
| `/v1/chat/dashboard/**` | **REWRITE** | `chat-engine/src/dashboard/dashboard.controller.ts` | same | same | Same as above; keep the v1 alias. |
| `/v1/chat/voice/sessions/**` | **KEEP** | `chat-engine/src/voice/voice.controller.ts` | `ApiKeyAuthGuard` + `RbacGuard` (feature: `voice`) | `Voice — Sessions` | Customer-facing voice session creation. |
| `/v1/chat/voice/agents/**` | **KEEP** | `chat-engine/src/voice/voice.controller.ts` | same | `Voice — Agent Configs` | Read voice config for an agent. |
| `/v1/chat/voice/usage` | **REMOVE** | `chat-engine/src/voice/voice.controller.ts` | same | — | Internal billing accounting endpoint called by `agntix-voice` worker. Already filtered in [`openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) once §3 hardening lands. |
| `/v1/chat/voice/token` | **KEEP** | `chat-engine/src/voice/voice.controller.ts` | same | `Voice — Tokens` | Required for any browser/widget voice flow. |
| `/v1/chat/voice/phone-number/**` | **GATE** | `chat-engine/src/voice/voice.controller.ts` | same | `Voice — Phone Numbers` (subset) | The `POST /charge` and `DELETE /charge` sub-routes are internal billing. Split: KEEP `…/phone-number` mapping endpoints, REMOVE `…/phone-number/charge`. Add explicit deny in `routes.yaml`. |
| `/v1/chat/phone-numbers/**` | **KEEP** | `chat-engine/src/phone-numbers/phone-numbers.controller.ts` | `CompositeAuthGuard` + `RbacGuard` | `Phone Numbers` | Customer phone-number provisioning. |
| `/v1/chat/models/**` | **KEEP** (read-only routes only) | `chat-engine/src/models/models.controller.ts` | mixed (`CompositeAuthGuard` for GET, `AdminJwtAuthGuard` for `/list`, no-guard for POST!) | `Models` | **Audit finding:** `POST /models` has no guard (line 30, commented out). KEEP the read endpoints (`GET /models`, `GET /models/providers`, `GET /models/filters`, `GET /models/:id`); REMOVE all admin mutations (`POST`, `PATCH`, `PATCH /pricing`, `DELETE`). Backend MUST be patched to add `AdminJwtAuthGuard` to the unguarded routes (separate ticket). |
| `/v1/chat/analytics/**` | **KEEP** | `chat-engine/src/analytics/analytics.controller.ts` | `CompositeAuthGuard` + `RbacGuard` | `Analytics` | Per-org call/session analytics. |
| `/v1/chat/call-campaigns/**` | **KEEP** | `chat-engine/src/call-campaign/call-campaign.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `call-campaigns`) | `Call Campaigns` | Customer outbound campaign feature. |
| `/v1/chat/contacts/**` | **KEEP** | `chat-engine/src/contacts/contacts.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `contacts`) | `Contacts` | Standard CRM-style API. |
| `/v1/chat/tts-voices/**` | **REMOVE** | `chat-engine/src/tts-voice/tts-voice.controller.ts` | **`AdminJwtAuthGuard`** (entire controller) | — | Confirmed admin-only. Customers list voices via `/v1/voice/voices` on `voice-api`. Hide. |
| `/v1/chat/tools/**` | **KEEP** | `chat-engine/src/tools/tools.controller.ts` | `RequirePermission(feature: 'tools')` (controller-level, plus per-method `CompositeAuthGuard`) | `Tools` | Customer-defined API + Function tools. |
| `/v1/chat/webhooks/**` | **KEEP** | `chat-engine/src/webhooks/webhooks.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `webhooks`) | `Webhooks` | Svix-backed customer webhook subscriptions. |
| `/v1/chat/subscriptions/**` | **GATE** | `chat-engine/src/subscriptions/subscriptions.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `subscriptions`) | `Subscriptions (read-only)` | KEEP `GET /plans` and `POST /validate` (informational). REMOVE `POST /create-checkout-session`, `POST /cancel`, `POST /resume` from public docs — these are dashboard-only flows that reveal Stripe integration internals. |
| `/v1/chat/api-keys/**` | **KEEP** | `chat-engine/src/api-key-management/api-key-management.controller.ts` | `CompositeAuthGuard` + `RbacGuard` (feature: `api-keys`) | `API Keys` | Customers self-manage org API keys. |
| `/v1/chat/languages/**` | **REMOVE** | `chat-engine/src/languages/languages.controller.ts` | **`AdminJwtAuthGuard`** | — | Admin-only catalog management. If customers need to filter by language they can use the `language` enum in the model/agent docs. |
| `/v1/chat/whatsapp/**` | **REMOVE** | `chat-engine/src/whatsapp/whatsapp.controller.ts` | `TwilioWebhookGuard` on `/receive`, no guard on `GET` | — | Twilio inbound webhook ingress + an unguarded `GET /whatsapp?number=…` listing. Internal — should not appear in customer docs. Filter via `/whatsapp/receive` and add `/whatsapp$` to denylist. |
| `/v1/chat/whatsapp-tenant-configs/**` | **REMOVE** | `chat-engine/src/whatsapp-tenant-configs/whatsapp-tenant-configs.controller.ts` | `CompositeAuthGuard` + `RbacGuard` | — | Per-org Twilio credential storage. Sensitive; configured via dashboard, not API. |
| `/v1/chat/knowledge-store/**` | **KEEP** | (proxied through to external KB API) | `CompositeAuthGuard` + `RbacGuard` (feature: `knowledge-store`) | `Knowledge Stores` | Customer RAG document management. |
| `/v1/chat/n8n/**` | **REMOVE** | `chat-engine/src/n8n/n8n.controller.ts` | `JwtAuthGuard` + `RbacGuard` (feature: `n8n`) | — | n8n is an *internal* workflow automation surface today. The n8n service URL, credentials, and project IDs are infra concerns. Re-evaluate as a public "Workflows" feature after a UX/security review. |
| `/v1/chat/onboarding/**` | **REMOVE** | `chat-engine/src/onboarding/onboarding.controller.ts` | none (! — security issue) | — | Twilio WhatsApp onboarding code generation. Internal. **Backend must add a guard** in a follow-up ticket. |
| `/v1/chat/qa/**` | **REWRITE** | `chat-engine/src/qa-automation/**/*.controller.ts` (5 controllers: jobs, calls, products, product-scripts, representatives, voice-samples) | `CompositeAuthGuard` + `RbacGuard` (no per-feature scope) | `QA Automation` | Functionally customer-facing but the route prefix `qa/representatives` etc. leaks internal naming. Rename to `/v1/quality/...` via gateway aliases and document the new shape, OR REMOVE entirely if the feature is internal-only. Confirm with QA team owner. |
| `/v1/chat/meters/**` | **REMOVE** | `chat-engine/src/metering/metering.controller.ts` | `ApiKeyAuthGuard` + `RbacGuard` (feature: `meters`) | — | OpenMeter integration plumbing. Customers see usage via `/v1/chat/dashboard/...` (rewritten as `/v1/usage`), not raw meters. Already in `isInternalPath` denylist. |
| `/v1/chat/users/**` | **REMOVE** | `chat-engine/src/users/users.controller.ts` (empty controller) | none | — | Empty placeholder controller. Strip from spec; consider deleting in a separate cleanup PR. |
| `/v1/chat/scheduler/**` | **REMOVE** | `chat-engine/src/scheduler/scheduler.controller.ts` | **none (security issue)** | — | BullMQ admin surface (`POST /clear-all`, `POST /reinitialize`, manual job triggers). Internal infra. **Backend must add `AdminJwtAuthGuard` in a follow-up ticket.** Already in `isInternalPath` denylist. |
| `/v1/chat/events/stream` | **KEEP** | `chat-engine/src/events/...` (proxied) | `CompositeAuthGuard` (streaming) | `Real-time Events (SSE)` | Customer-facing real-time feed. Document the event types from [`ARCHITECTURE_REPORT.md`](../agntix-gateway/docs/ARCHITECTURE_REPORT.md) §7.2. |
| `/v1/chat/public/**` | **KEEP** | `chat-engine/src/agents/public/agents-public.controller.ts`, `chat-engine/src/chat/public/chat-public.controller.ts`, `chat-engine/src/voice/public/voice-public.controller.ts` | `PublicKeyAuthGuard` (agents), `@Public()`-style on chat/voice | `Public (Embed/Widget) APIs` | Anonymous endpoints used by the embeddable widget/SDK. |
| `/v1/chat/health` | **KEEP** | `chat-engine/src/health/health.controller.ts` | none (public) | `Health` | Standard liveness check. |

### 2.2 voice-api prefix (`/v1/voice/*`)

| Gateway path | Decision | Source router | Current dependency | Public name (in docs) | Rationale |
|---|---|---|---|---|---|
| `/v1/voice/phone-numbers/**` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/phone_number.py` | (no router-level dep — auth applied per route) | `Voice — Phone Numbers` | Customer phone number lifecycle. Document only the customer-safe verbs (POST create, DELETE, GET, GET `/{number}`). |
| `/v1/voice/providers/**` | **KEEP** (read-only sub-routes) | `agntix-voice/src/voice_agent/api/routes/telephony_routes.py` | `combined_auth.authenticate_request` | `Voice — Telephony Providers` | KEEP `GET /providers`, `GET /providers/{id}`, `GET /providers/{id}/phone-numbers`. REMOVE `POST /providers` and `POST /providers/{id}/import-numbers` and `POST /providers/{id}/set-default` — these are admin/internal dashboard flows. |
| `/v1/voice/rooms/**` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/rooms.py` | `combined_auth.authenticate_request` | `Voice — Rooms` | Customer room management for LiveKit. |
| `/v1/voice/playground/**` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/token.py` | (no auth — relies on token issued elsewhere) | `Voice — Playground` | Customer-facing playground token flow. |
| `/v1/voice/voices` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/voices.py` | none | `Voice — Voices Catalog` | Read-only TTS voice catalog. |
| `/v1/voice/models` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/models.py` | `combined_auth.authenticate_request` | `Voice — Models` | Read-only TTS/STT model catalog. |
| `/v1/voice/queue/**` | **GATE** | `agntix-voice/src/voice_agent/api/routes/queue.py` | mixed | `Voice — Queue` (subset) | KEEP `GET /queue/jobs/{id}`, `GET /queue/status`, `POST /queue/jobs/{id}/events`. REMOVE everything under `/queue/admin/` (already in `isInternalPath`) and `/queue/testing/` (already in `isInternalPath`). |
| `/v1/voice/sessions/**` | **KEEP** | `agntix-voice/src/voice_agent/api/routes/session.py` | `Depends(get_api_key)` | `Voice — Sessions` (voice-api) | Customer voice session inspection. |
| `/v1/voice/ws/**` | **REMOVE** | `agntix-voice/src/voice_agent/api/routes/telephony_routes.py` (`/ws/authenticate`) | `combined_auth` | — | WebSocket auth bootstrap; internal. Already in `isInternalPath` denylist (`/ws/authenticate`). Add `^/v1/voice/ws/` to the denylist as well. |
| `/v1/voice/health` | **KEEP** | (FastAPI built-in) | none | `Health` | Standard liveness check. |

### 2.3 Legacy passthroughs (`/api/v1/*`, `/api/v2/*`)

| Gateway path | Decision | Rationale |
|---|---|---|
| `/api/v1/events/stream` | **REMOVE** | Legacy alias of `/v1/chat/events/stream`. Public docs reference only the canonical `/v1/chat/...` form. Keep the alias in `routes.yaml` for old clients but do not document it. |
| `/api/v1/rooms/**`, `/api/v1/playground/**`, `/api/v1/providers/**`, `/api/v1/voices`, `/api/v1/queue/**` | **REMOVE** | Same — legacy aliases. |
| `/api/v1/phone-numbers/**` | **REMOVE** | Legacy fan-out path. Public docs reference `/v1/chat/phone-numbers` and `/v1/voice/phone-numbers`. |
| `/api/v1/**` (catch-all) | **REMOVE** | Catch-all passthrough exists for SDK backward compatibility. Hide from public docs. |
| `/api/v2/**` (catch-all) | **REMOVE** | Same as above. |

---

## 3. Admin controllers (always REMOVE)

| Controller | File | Guard |
|---|---|---|
| Agents Admin | `chat-engine/src/agents/admin/agents-admin.controller.ts` | `AdminJwtAuthGuard` |
| Tools Admin | `chat-engine/src/tools/admin/tools-admin/tools-admin.controller.ts` | `AdminJwtAuthGuard` |
| Models Admin | `chat-engine/src/models/admin/models-admin.controller.ts` | `AdminJwtAuthGuard` |

All three are caught by the `/admin/` pattern in [`openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) `isInternalPath`. Verify with the lint pass after every spec sync.

---

## 4. Backend hardening tickets (file separately)

The audit surfaced security gaps that exist independently of the docs work. Track each as its own backend ticket:

1. **`SchedulerController`** has no guard. Add `@UseGuards(AdminJwtAuthGuard)` at the controller level — `chat-engine/src/scheduler/scheduler.controller.ts` line 17.
2. **`ModelsController.create`** (POST `/models`) has its `AdminJwtAuthGuard` commented out — `chat-engine/src/models/models.controller.ts` line 31. Re-enable.
3. **`OnboardingController`** has no guard — `chat-engine/src/onboarding/onboarding.controller.ts`. Add `AdminJwtAuthGuard` (or `CompositeAuthGuard` if customer self-onboarding is intended).
4. **`WhatsappController.findAll`** (GET `/whatsapp?number=…`) has no guard — `chat-engine/src/whatsapp/whatsapp.controller.ts` line 52. Add `CompositeAuthGuard` + scope to `req.user.orgId`.
5. **`UsersController`** is an empty `@Controller('users')` placeholder — delete the file or implement.

Removing endpoints from the docs does **not** remove them from the network. The portal is one defense layer; backend guards are the authoritative one.

---

## 5. Maintenance

When `routes.yaml` or any controller changes:

1. Re-run `pnpm sync:openapi` in `agntix-docs-portal/` (CI does this nightly).
2. The sync script will fail loudly if a new path matches the denylist regex.
3. If a new endpoint should be public, add a row to §2 above and let the portal pick it up.
4. If it should be internal, add a pattern to `isInternalPath` in [`openapi.service.ts`](../agntix-gateway/src/openapi/openapi.service.ts) and re-deploy the gateway.
