/* eslint-disable no-console */
/**
 * lint-internal-paths.ts — CI guard against leaking internal-only slugs into
 * the published documentation.
 *
 * Walks every `*.mdx` under the repo plus `openapi/agentix.json` and fails
 * loudly if any of these terms appear in a public-facing context:
 *
 *   - any internal route prefix (admin, scheduler, metering, n8n, …)
 *   - secret-looking strings (API keys, internal tokens, JIRA refs)
 *
 * Designed to be the third (and last) line of defense, after the gateway
 * filter and `sync-openapi.ts` allowlist.
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation found
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

interface Rule {
  /** Human-readable name shown in failures */
  name: string;
  /** Regex applied per-line */
  pattern: RegExp;
  /** Files where this rule should NOT fire (e.g. the audit doc itself) */
  allowFiles?: RegExp[];
}

/**
 * Each rule documents *why* it exists and *where* the canonical fix lives. If
 * you add a rule, also add it to `agntix-gateway/src/openapi/openapi.service.ts`
 * `isInternalPath` and to the denylist in `scripts/sync-openapi.ts`.
 */
const RULES: Rule[] = [
  {
    name: "internal route slug",
    pattern:
      /\/(admin|scheduler|metering|meters|n8n|onboarding|internal|queue\/admin|queue\/testing|whatsapp\/receive|whatsapp-tenant-configs|voice\/usage|voice\/phone-number\/charge)(\/|\b)/,
    allowFiles: [
      /ROUTE_AUDIT\.md$/,
      /MIGRATION_GUIDE\.md$/,
      /scripts\/lint-internal-paths\.ts$/,
      /scripts\/sync-openapi\.ts$/,
      /^\.github\/workflows\//,
      /README\.md$/,
      // The changelog deliberately announces the removal of internal routes
      // by name. That is a customer-facing transparency signal, not a leak.
      /^changelog\.mdx$/,
    ],
  },
  {
    name: "internal env secret",
    pattern: /(INTERNAL_SECRET|x-internal-secret|JIRA-[A-Z]+-\d+)/i,
    allowFiles: [
      /ROUTE_AUDIT\.md$/,
      /MIGRATION_GUIDE\.md$/,
      /scripts\/lint-internal-paths\.ts$/,
      // Same reason as above — the changelog calls out the new lint by name.
      /^changelog\.mdx$/,
    ],
  },
  {
    name: "live API key",
    pattern: /(sk_live_|pk_live_)[A-Za-z0-9]{16,}/,
    // examples in docs use placeholder `pk_live_xxxxxxxxxxxxxxxx` — explicitly allow
    allowFiles: [],
  },
];

const SCAN_EXTENSIONS = new Set([".mdx", ".md", ".json"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".mintlify",
  ".mint",
  ".git",
  ".github",
  "dist",
  "build",
]);

interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else {
      const dot = entry.lastIndexOf(".");
      if (dot < 0) continue;
      if (!SCAN_EXTENSIONS.has(entry.slice(dot))) continue;
      yield full;
    }
  }
}

function isAllowed(rule: Rule, relativePath: string): boolean {
  return rule.allowFiles?.some((r) => r.test(relativePath)) ?? false;
}

function looksLikeRealLiveKey(match: string): boolean {
  // Dodge false positives on placeholder examples in docs.
  return !/x{8,}/i.test(match);
}

function scan(file: string): Violation[] {
  const rel = relative(REPO_ROOT, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const out: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (isAllowed(rule, rel)) continue;
      const m = rule.pattern.exec(line);
      if (!m) continue;
      if (rule.name === "live API key" && !looksLikeRealLiveKey(m[0])) continue;
      out.push({ file: rel, line: i + 1, rule: rule.name, text: line.trim() });
    }
  }

  return out;
}

function main(): void {
  const violations: Violation[] = [];
  for (const file of walk(REPO_ROOT)) {
    violations.push(...scan(file));
  }

  if (violations.length === 0) {
    console.log("[lint] clean — no internal slugs leaked into public docs");
    return;
  }

  console.error(`\n[lint] FAIL — ${violations.length} potential leak(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    > ${v.text}`);
  }
  console.error(
    `\nIf any of these is intentional, add the file to the rule's \`allowFiles\` in \`scripts/lint-internal-paths.ts\`.`,
  );
  process.exit(1);
}

main();
