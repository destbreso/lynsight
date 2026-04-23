# @lynsight/web

Next.js 15 web UI for Lynsight. Upload a Lynis `.tar.gz`, view a prioritized
report with charts, optionally enrich with an LLM (Ollama / OpenAI /
Anthropic / OpenAI-compatible).

```bash
pnpm install
pnpm dev:web   # http://localhost:3535
```

## Notes

- Workspace packages (`@lynsight/parser`, `core`, `llm`, `reports`) ship as
  TS source and are transpiled by Next via `transpilePackages`.
- The upload endpoint (`/api/analyze`) runs on the Node runtime — `tar`
  extraction needs filesystem access.
- Default body limit is 25 MB. Increase in `next.config.mjs` if needed.
- No persistence: each upload is parsed in a temp dir and discarded.
