/* eslint-disable no-console */
/**
 * sync-openapi.ts — Fetch the merged OpenAPI spec from the Agentix gateway,
 * apply an allowlist + denylist (defense in depth), and commit the result to
 * `openapi/agentix.json`. Mintlify reads only the committed file.
 *
 * The gateway already strips internal routes via `isInternalPath`. This script
 * re-applies the same intent so a misconfigured gateway can never silently
 * leak internal endpoints into the public docs portal.
 *
 * Usage:
 *   GATEWAY_BASE_URL=https://api.agntix.ai pnpm sync:openapi
 *
 * Exit codes:
 *   0 — success, file written (or unchanged)
 *   1 — fetch failure
 *   2 — denylist violation (a path that should be internal slipped through)
 */

import axios from "axios";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_FILE = resolve(REPO_ROOT, "openapi/agentix.json");

const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL ?? "https://api.agntix.ai";
const SPEC_URL = `${GATEWAY_BASE_URL.replace(/\/$/, "")}/docs/json`;

/**
 * ALLOWLIST — only paths whose prefix matches one of these regexes are written
 * to the public spec. New customer-facing routes must be added here explicitly.
 * Mirror this list against `agntix-docs-portal/ROUTE_AUDIT.md`.
 */
const ALLOWLIST: RegExp[] = [
  /^\/v\d+\/agents(\/|$)/,
  /^\/v\d+\/chat\/(agents|chat|sessions|messages|public)(\/|$)/,
  /^\/v\d+\/chat\/voice\/(sessions|agents|token)(\/|$)/,
  /^\/v\d+\/chat\/phone-numbers(\/|$)/,
  /^\/v\d+\/chat\/models(\/|$)/,
  /^\/v\d+\/chat\/analytics(\/|$)/,
  /^\/v\d+\/chat\/call-campaigns(\/|$)/,
  /^\/v\d+\/chat\/contacts(\/|$)/,
  /^\/v\d+\/chat\/tools(\/|$)/,
  /^\/v\d+\/chat\/webhooks(\/|$)/,
  /^\/v\d+\/chat\/subscriptions\/plans(\/|$)/,
  /^\/v\d+\/chat\/api-keys(\/|$)/,
  /^\/v\d+\/chat\/knowledge-store(\/|$)/,
  /^\/v\d+\/chat\/qa(\/|$)/, // QA Automation — confirm with owners
  /^\/v\d+\/chat\/dashboard(\/|$)/, // documented as "Usage"
  /^\/v\d+\/chat\/events\/stream$/,
  /^\/v\d+\/chat\/public\//,
  /^\/v\d+\/chat\/health$/,
  /^\/v\d+\/voice\/(providers|rooms|playground|voices|sessions|models|phone-numbers)(\/|$)/,
  /^\/v\d+\/voice\/queue\/(jobs|status)(\/|$)/,
  /^\/v\d+\/voice\/health$/,
];

/**
 * DENYLIST — even if the gateway misbehaves and an internal path slips through
 * the allowlist, this list will trigger a build failure. Update in lock-step
 * with the source-of-truth list in `openapi.service.ts isInternalPath`.
 */
const DENYLIST: RegExp[] = [
  /\/admin\//,
  /\/internal\//,
  /\/scheduler\//,
  /\/metering\//,
  /\/meters\//,
  /\/onboarding\//,
  /\/n8n\//,
  /\/queue\/admin\//,
  /\/queue\/testing\//,
  /\/ws\//,
  /\/whatsapp\/receive/,
  /\/whatsapp-tenant-configs/,
  /\/voice\/usage(?:\/|$)/,
  /\/voice\/phone-number\/charge/,
  /\/users(?:\/|$)/,
  /\/api\/v\d+\//, // legacy passthroughs — public docs use `/v{n}` only
];

const INTERNAL_TAG_REGEX =
  /admin|internal|scheduler|metering|meters|n8n|onboarding|whatsapp tenant/i;

interface OpenApiSpec {
  openapi?: string;
  info?: Record<string, unknown>;
  servers?: Array<Record<string, unknown>>;
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, unknown>;
  tags?: Array<{ name: string; description?: string }>;
  security?: unknown;
  [key: string]: unknown;
}

async function fetchSpec(): Promise<OpenApiSpec> {
  console.log(`[sync] fetching ${SPEC_URL}…`);
  try {
    const res = await axios.get<OpenApiSpec>(SPEC_URL, {
      timeout: 30_000,
      headers: { Accept: "application/json" },
    });
    return res.data;
  } catch (err: unknown) {
    const e = err as { message?: string; response?: { status?: number } };
    console.error(
      `[sync] failed to fetch spec (status=${e.response?.status ?? "n/a"}): ${e.message}`,
    );
    process.exit(1);
  }
}

function pathIsAllowed(path: string): boolean {
  return ALLOWLIST.some((r) => r.test(path));
}

function pathIsDenied(path: string): boolean {
  return DENYLIST.some((r) => r.test(path));
}

function operationIsInternal(operation: unknown): boolean {
  if (!operation || typeof operation !== "object") return false;
  const ops = operation as Record<string, unknown>;
  return Object.values(ops).some((op) => {
    if (!op || typeof op !== "object") return false;
    return (op as Record<string, unknown>)["x-internal"] === true;
  });
}

function filterSpec(spec: OpenApiSpec): { spec: OpenApiSpec; violations: string[] } {
  const out: OpenApiSpec = { ...spec, paths: {} };
  const violations: string[] = [];

  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    if (pathIsDenied(path)) {
      violations.push(`denylist match: ${path}`);
      continue;
    }
    if (operationIsInternal(ops)) {
      console.log(`[sync] dropping ${path} (x-internal: true)`);
      continue;
    }
    if (!pathIsAllowed(path)) {
      console.log(`[sync] skipping ${path} (not in allowlist — add to scripts/sync-openapi.ts if customer-safe)`);
      continue;
    }
    out.paths![path] = ops;
  }

  if (Array.isArray(spec.tags)) {
    out.tags = spec.tags.filter((t) => !INTERNAL_TAG_REGEX.test(t.name));
  }

  out.servers = [{ url: GATEWAY_BASE_URL, description: "Production" }];
  out.info = {
    title: "Agentix API",
    version: (spec.info?.version as string) ?? "1.0.0",
    description:
      (spec.info?.description as string) ??
      "The public Agentix REST API for chat, voice, and webhook integrations.",
    contact: { email: "support@agntix.ai", url: "https://agntix.ai" },
  };

  return { spec: out, violations };
}

function writeIfChanged(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8");
    if (existing === contents) {
      console.log(`[sync] ${file} unchanged`);
      return;
    }
  }
  writeFileSync(file, contents);
  console.log(`[sync] wrote ${file}`);
}

async function main(): Promise<void> {
  const upstream = await fetchSpec();
  const { spec, violations } = filterSpec(upstream);

  if (violations.length > 0) {
    console.error(
      `\n[sync] FATAL: ${violations.length} denylist violation(s) — the gateway is leaking internal paths:`,
    );
    violations.forEach((v) => console.error(`  - ${v}`));
    console.error(
      "\nFix `agntix-gateway/src/openapi/openapi.service.ts` `isInternalPath` and re-deploy the gateway.",
    );
    process.exit(2);
  }

  const pathCount = Object.keys(spec.paths ?? {}).length;
  console.log(`[sync] kept ${pathCount} public path(s)`);

  writeIfChanged(OUTPUT_FILE, JSON.stringify(spec, null, 2) + "\n");
  console.log("[sync] done");
}

main().catch((err) => {
  console.error("[sync] uncaught error:", err);
  process.exit(1);
});
