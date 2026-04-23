# LLM providers

Lynsight talks to every backend via the **OpenAI Chat Completions** wire
format, with a thin adapter for Anthropic. No SDK dependency — just `fetch`.

## Ollama (default, local, free)

```bash
# 1. Install ollama: https://ollama.com
ollama pull llama3.1:8b
ollama serve   # listens on http://localhost:11434

# 2. Verify
lynsight ping --provider ollama --model llama3.1:8b

# 3. Use
lynsight scan bundle.tar.gz --llm \
  --provider ollama --model llama3.1:8b \
  --language es
```

> Lynsight uses the OpenAI-compatible endpoint `http://localhost:11434/v1`,
> not the legacy `/api/generate`.

### Recommended Ollama models

| Use case              | Model               | Notes                              |
| --------------------- | ------------------- | ---------------------------------- |
| Fast, decent quality  | `llama3.1:8b`       | Default. ~5GB RAM.                 |
| Better reasoning      | `qwen2.5:14b`       | ~9GB RAM.                          |
| Best local quality    | `qwen2.5:32b`       | Needs ≥24GB RAM.                   |
| Code/sysadmin focused | `qwen2.5-coder:14b` | Great at producing exact commands. |
| Tiny / laptop         | `llama3.2:3b`       | Sub-2GB, draft-quality.            |

## OpenAI

```bash
export LYNSIGHT_API_KEY=sk-...
lynsight scan bundle.tar.gz --llm --provider openai --model gpt-4o-mini
```

## Anthropic

```bash
export LYNSIGHT_API_KEY=sk-ant-...
lynsight scan bundle.tar.gz --llm --provider anthropic --model claude-3-5-sonnet-latest
```

## OpenAI-compatible (LM Studio, vLLM, OpenRouter, Groq, Together, Fireworks…)

```bash
# LM Studio default endpoint
lynsight scan bundle.tar.gz --llm \
  --provider openai-compatible \
  --base-url http://localhost:1234/v1 \
  --model qwen2.5-coder-7b-instruct

# OpenRouter
lynsight scan bundle.tar.gz --llm \
  --provider openai-compatible \
  --base-url https://openrouter.ai/api/v1 \
  --api-key $OPENROUTER_KEY \
  --model meta-llama/llama-3.1-70b-instruct
```

## Privacy / air-gap

- The CLI never makes network calls unless `--llm` is set.
- The Web UI never makes network calls outside the user-configured provider.
- For air-gapped scans: use Ollama. The `--provider ollama` default points to
  `localhost:11434` and your Lynis data never leaves the host.
- No telemetry, no analytics, no remote fetch in HTML reports.

## Cost control

The number of LLM calls is `1 + min(top, totalFindings)`:

- `1` for the executive summary.
- Up to `--top` (default 10) calls for per-finding remediation.

For a typical 60-finding Lynis report with `--top 10`, that's **11 calls**. With
`gpt-4o-mini` at typical pricing, that's a few cents. With Ollama, $0.

## Prompt customization

Prompts live in [`packages/llm/src/prompts.ts`](../packages/llm/src/prompts.ts).
Fork or PR to add domain-specific tones (PCI, HIPAA, ISO 27001 audit framing,
etc.).
