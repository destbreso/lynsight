# Changelog

All notable changes to Lynsight will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

### Added
- Initial monorepo scaffold (pnpm workspaces).
- `@lynsight/parser` — extracts Lynis `.tar.gz` / directory; parses
  `lynis-report.dat` and `lynis.log` into a typed `ParsedReport`.
- `@lynsight/core` — deterministic severity assignment, risk scoring (0–100),
  letter grade A→F, category bucketing.
- `@lynsight/llm` — provider abstraction over OpenAI Chat Completions wire
  format. Built-in adapters for **Ollama** (default), OpenAI, Anthropic, and
  any OpenAI-compatible endpoint (LM Studio, vLLM, OpenRouter, Groq, …).
- `@lynsight/reports` — HTML (single self-contained file), Markdown, JSON
  renderers.
- `@lynsight/cli` — `lynsight scan` and `lynsight ping` commands.
- `@lynsight/web` — Next.js 15 App Router UI with upload, charts (Recharts),
  filterable findings table, AI remediation panel.
- Docs: README, ARCHITECTURE, LLM-PROVIDERS.
