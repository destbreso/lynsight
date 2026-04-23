# Lynsight

> Open-source Lynis audit reporter with LLM-powered insights. Web UI + CLI.
> Generate Nessus-style hardening reports from a `lynis-report.dat` bundle, in any language, with charts, severity breakdown, and AI-generated remediation. Works fully offline via [Ollama](https://ollama.com).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-20%2B-43853d)
![Next.js](https://img.shields.io/badge/Next.js-15-black)

---

## Why

[Lynis](https://github.com/CISOfy/lynis) is fantastic at *auditing* a Linux host but its native output is a flat key=value file. Commercial tools like Nessus can ingest it and render a polished report — Lynsight does the same, **for free**, **opensource**, with **local LLM support** so sensitive audits never leave your machine.

## Features

- **Drop-in `.tar.gz` ingest** — any `lynis-report.dat` (+ optional `lynis.log`).
- **Deterministic scoring** — risk score 0-100, letter grade A→F, severity rules per Lynis test ID prefix (SSH-, KRNL-, FIRE-, MALW-, …).
- **CIS-style category grouping** with a built-in color palette.
- **Self-contained HTML report** — single file, no remote assets, perfect for tickets / email / PDF.
- **CLI + Web UI** — same engine, two surfaces.
- **LLM enrichment**, opt-in:
  - **Ollama** (local, default — `http://localhost:11434/v1`).
  - OpenAI, Anthropic, **any OpenAI-compatible** endpoint (LM Studio, vLLM, OpenRouter, Groq, Together, Fireworks…).
  - Output language is configurable (English, Español, Português, Français, Deutsch, Italiano…).
  - Audience hint (executive / sysadmin / mixed) shapes the prose.
- **Markdown + JSON exports** for pipelines, ticketing, GRC tooling.
- **Privacy first** — no telemetry, ever. The web UI runs locally on `:3535`.

## Quick start

```bash
# 1. Install deps
pnpm install

# 2. Try the CLI on a Lynis bundle
pnpm dev:cli scan ./examples/lynis-bundle.tar.gz --out ./out

# 3. Open the web UI
pnpm dev:web
# → http://localhost:3535
```

> Need a sample bundle? Run `sudo lynis audit system` on any Linux box, then
> `sudo tar -czf bundle.tar.gz /var/log/lynis-report.dat /var/log/lynis.log`.

## CLI

```bash
lynsight scan <input> [options]

  -o, --out <dir>            Output directory                (default: ./lynsight-out)
  -f, --format <list>        html,md,json                    (default: html,md,json)
      --llm                  Enable LLM enrichment
      --provider <kind>      ollama | openai | openai-compatible | anthropic
      --model <name>         e.g. llama3.1:8b, gpt-4o-mini, claude-3-5-sonnet-latest
      --base-url <url>       Override provider base URL
      --api-key <key>        API key (or env LYNSIGHT_API_KEY)
      --language <lang>      Output language (default: en)
      --audience <text>      Audience hint
      --top <n>              How many top findings to enrich  (default: 10)
      --concurrency <n>      Parallel LLM calls               (default: 2)

lynsight ping  --provider <kind> --model <name>
```

### Examples

```bash
# Local-only, Spanish, executive tone
lynsight scan bundle.tar.gz --llm \
  --provider ollama --model llama3.1:8b \
  --language es --audience "CTO executive briefing"

# Hosted, GPT-4o-mini, English
lynsight scan bundle.tar.gz --llm \
  --provider openai --model gpt-4o-mini \
  --api-key $OPENAI_API_KEY

# OpenAI-compatible (e.g. LM Studio at :1234)
lynsight scan bundle.tar.gz --llm \
  --provider openai-compatible --base-url http://localhost:1234/v1 \
  --model qwen2.5-coder-7b-instruct
```

## Web UI

```bash
pnpm dev:web   # http://localhost:3535
```

Drag a `.tar.gz` onto the upload area, optionally tick **Enrich with an LLM**, configure provider/model, and analyze. The UI renders:

- Grade card (A→F), risk score, hardening index, total findings.
- Severity bar chart + category pie chart (Recharts).
- Filterable findings table with collapsible AI-generated remediation.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/LLM-PROVIDERS.md](docs/LLM-PROVIDERS.md).

```
apps/
  web/   Next.js 15 (App Router, RSC + route handler)
  cli/   commander + kleur, talks to the same packages
packages/
  parser/   tar.gz → typed AST (zod)
  core/     scoring, prioritization, category mapping
  llm/      provider abstraction + prompt templates + enrichment loop
  reports/  HTML / Markdown / JSON renderers
```

## Roadmap

- [ ] PDF export via Playwright (renders the Web UI report headlessly)
- [ ] Multi-host comparison view
- [ ] Report diffing between audits over time
- [ ] Streaming LLM responses in the Web UI
- [ ] Plugin system (consume scans from `chkrootkit`, `linpeas`, `OpenSCAP`)
- [ ] i18n (`next-intl`) for the UI itself, not just LLM output
- [ ] Docker image + Helm chart

## Contributing

PRs welcome. The project is intentionally small: 4 packages + 2 apps, no DB, no auth, no telemetry. Issues and feature requests are tracked on GitHub.

## License

[MIT](LICENSE) © 2026 David Estevez and Lynsight contributors.

Lynsight is **not affiliated with CISOfy**, the maintainers of Lynis. This is an
independent open-source reporter for Lynis audit output.
