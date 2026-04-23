# Architecture

Lynsight is a small pnpm monorepo. Two surfaces (CLI + Web) consume the same engine.

```
┌──────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js)                        │
│                    apps/cli (commander + tsx)                     │
└───────────────┬─────────────────────────────┬────────────────────┘
                │                             │
        same TypeScript source        same TypeScript source
                │                             │
┌───────────────▼─────────────────────────────▼────────────────────┐
│  @lynsight/parser   tar.gz → ParsedReport (zod-typed)            │
│  @lynsight/core     analyze() = prioritize → sort → summarize    │
│  @lynsight/llm      providers + prompts + enrichReport()         │
│  @lynsight/reports  HTML / Markdown / JSON renderers             │
└──────────────────────────────────────────────────────────────────┘
```

## Data flow

```
.tar.gz ─► parseAudit() ─► ParsedReport
                                │
                                ▼
                         analyze() ─► AnalyzedReport { report, summary }
                                │
                       (optional ▼)
                       enrichReport(provider, …) ─► EnrichedReport
                                │
                                ▼
              renderHtml | renderMarkdown | renderJson | <ReportView/>
```

### `ParsedReport` (parser)

- `meta`: lynis version, dates, plugins, test counts.
- `system`: hostname, os, kernel, cpu.
- `hardeningIndex`: 0-100 (Lynis built-in).
- `findings[]`: normalized warnings + suggestions.
- `raw`: untouched key/value bag — escape hatch for power users.

### `ReportSummary` (core)

- `riskScore` 0-100 (Lynsight-computed, capped per severity to avoid noise).
- `grade` A→F = `worst(riskGrade, hardeningGrade)`.
- `totals` per severity.
- `byCategory[]` buckets with severity breakdown.
- `topFindings[]` sorted by severity weight.

### Severity assignment (core/prioritize)

Two-step:

1. Default: `warning → high`, `suggestion → medium`.
2. Override:
   - **Critical** if test ID is in a hardcoded list (e.g. `SSH-7408` root login).
   - **Critical** if it's a warning **and** the test ID prefix is "high impact" (SSH, AUTH, CRYP, FIRE, MALW, KRNL, MACF, BOOT).
   - User-provided `overrides` map wins over everything.

### LLM enrichment (llm)

Two LLM calls types:

1. One **executive summary** call using the full summary stats + top findings list.
2. One **remediation** call per top-N finding, with bounded concurrency (default 2 to be friendly with Ollama on CPU).

All providers speak OpenAI Chat Completions wire format. Anthropic is the one
exception and gets its own thin adapter.

### Reports (reports)

- `renderHtml` — single self-contained HTML file. CSS embedded, no fonts, no
  remote assets, no JS. Severity-colored cards, inline SVG-free bar charts,
  Markdown-ish renderer for LLM outputs (no `marked` / `remark` dep).
- `renderMarkdown` — pipe-friendly, Git-diffable, GitHub-renderable.
- `renderJson` — full normalized structure for downstream tooling.

## Why this layout

- **Packages export TS source** (no build step in dev). Next transpiles them
  via `transpilePackages`; the CLI uses `tsx`. To publish to npm, each package
  has a `tsconfig.build.json` and a `pnpm -r build` produces `dist/`.
- **Zero runtime deps** on the LLM side (no Vercel AI SDK, no LangChain) — just
  `fetch`. Smaller surface, easier to audit, runs on edge.
- **Deterministic core, optional LLM**. The LLM never decides severity; it only
  *explains*. This keeps results reproducible and auditable.
