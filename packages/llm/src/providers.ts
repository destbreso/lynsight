/**
 * Minimal LLM provider abstraction. We talk to every backend via the
 * OpenAI Chat Completions wire format because both Ollama
 * (`/v1/chat/completions`) and most OpenAI-compatible servers (LM Studio,
 * vLLM, OpenRouter, Groq, Together, Fireworks…) speak it natively.
 *
 * No SDK dependency on purpose: we only use `fetch`, which keeps the
 * package zero-dep and trivially portable to edge runtimes.
 */

export type ProviderKind = 'openai' | 'openai-compatible' | 'ollama' | 'anthropic';

export interface LLMConfig {
  provider: ProviderKind;
  /** Base URL. Defaults applied per provider when omitted. */
  baseUrl?: string;
  /** API key. Optional for Ollama and self-hosted OpenAI-compatible servers. */
  apiKey?: string;
  /** Model id, e.g. "gpt-4o-mini", "llama3.1:8b", "claude-3-5-sonnet-latest". */
  model: string;
  /** 0..2, defaults to 0.2 for deterministic security advice. */
  temperature?: number;
  /** Hard upper bound on response tokens. */
  maxTokens?: number;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Result of a connection probe — surfaced to the UI. */
export interface PingResult {
  ok: boolean;
  /** Provider kind we tested. */
  providerName: string;
  /** Resolved base URL we hit. */
  baseUrl: string;
  /** Round-trip latency in ms (only when ok). */
  latencyMs?: number;
  /** Number of models available, if discoverable. */
  modelCount?: number;
  /** Whether the configured `model` is in the discovered list. */
  modelAvailable?: boolean;
  /** Free-form server identification. */
  serverInfo?: string;
  /** Error message on failure. */
  error?: string;
}

export interface ModelInfo {
  id: string;
  /** Human label if the API exposes one (LM Studio, OpenRouter), else id. */
  label?: string;
  /** Bytes on disk for local providers (Ollama). */
  sizeBytes?: number;
  /** Last-modified ISO date if the provider reports it. */
  modifiedAt?: string;
}

/** Hook fired for each streamed token chunk. Optional. */
export type StreamHandler = (chunk: string) => void;

export interface LLMProvider {
  name: string;
  baseUrl: string;
  /** Quick health probe with metadata — used by the web UI verify button. */
  ping(): Promise<PingResult>;
  /** Discover available models. Returns empty array if unsupported. */
  listModels(): Promise<ModelInfo[]>;
  /**
   * Run a chat completion. Internally uses streaming so very long responses
   * don't hit timeouts and partial chunks are reassembled robustly.
   * Pass `onChunk` to observe tokens as they arrive.
   */
  chat(messages: ChatMessage[], onChunk?: StreamHandler): Promise<string>;
}

export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'ollama':
      return new OpenAICompatibleProvider(
        { ...config, baseUrl: config.baseUrl ?? 'http://localhost:11434/v1' },
        'ollama',
      );
    case 'openai':
      return new OpenAICompatibleProvider(
        { ...config, baseUrl: config.baseUrl ?? 'https://api.openai.com/v1' },
        'openai',
      );
    case 'openai-compatible':
      if (!config.baseUrl) {
        throw new Error('openai-compatible provider requires baseUrl');
      }
      return new OpenAICompatibleProvider(config, 'openai-compatible');
    case 'anthropic':
      return new AnthropicProvider({
        ...config,
        baseUrl: config.baseUrl ?? 'https://api.anthropic.com/v1',
      });
  }
}

class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly baseUrl: string;
  constructor(
    private readonly cfg: LLMConfig,
    private readonly kind: ProviderKind,
  ) {
    this.name = `${cfg.provider}:${cfg.model}`;
    this.baseUrl = cfg.baseUrl!;
  }

  async ping(): Promise<PingResult> {
    const t0 = Date.now();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        providerName: this.kind,
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - t0,
        modelCount: models.length,
        modelAvailable: this.cfg.model
          ? models.some((m) => m.id === this.cfg.model)
          : undefined,
        serverInfo: this.kind,
      };
    } catch (e) {
      return {
        ok: false,
        providerName: this.kind,
        baseUrl: this.baseUrl,
        error: (e as Error).message,
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Ollama exposes a richer endpoint at /api/tags (size, modified_at).
    if (this.kind === 'ollama') {
      const tagsUrl = this.baseUrl.replace(/\/v1\/?$/, '') + '/api/tags';
      try {
        const res = await fetch(tagsUrl, {
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 5_000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            models?: Array<{ name: string; size?: number; modified_at?: string }>;
          };
          return (json.models ?? []).map((m) => ({
            id: m.name,
            label: m.name,
            sizeBytes: m.size,
            modifiedAt: m.modified_at,
          }));
        }
      } catch {
        // fall through to OpenAI-style /models
      }
    }
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 5_000),
    });
    if (!res.ok) {
      throw new Error(`Models endpoint returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; created?: number }>;
    };
    return (json.data ?? []).map((m) => ({
      id: m.id,
      label: m.id,
      modifiedAt: m.created ? new Date(m.created * 1000).toISOString() : undefined,
    }));
  }

  async chat(messages: ChatMessage[], onChunk?: StreamHandler): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers() },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        temperature: this.cfg.temperature ?? 0.2,
        max_tokens: this.cfg.maxTokens ?? 2048,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 180_000),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM error ${res.status}: ${body.slice(0, 500)}`);
    }
    return readSSEStream(res.body, onChunk);
  }

  private headers(): Record<string, string> {
    return this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {};
  }
}

/**
 * Reads an OpenAI-style SSE stream of `chat.completion.chunk` events,
 * accumulating text deltas. Tolerates split chunks (TCP doesn't guarantee
 * line boundaries) by buffering until we see `\n\n`.
 */
async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: StreamHandler,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events (separated by blank lines).
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
            }>;
          };
          const delta =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.message?.content ??
            '';
          if (delta) {
            full += delta;
            onChunk?.(delta);
          }
        } catch {
          // Tolerate keep-alive comments and malformed lines.
        }
      }
    }
  }
  // Flush trailing buffer (some servers omit final \n\n).
  if (buffer.startsWith('data:')) {
    const data = buffer.slice(5).trim();
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onChunk?.(delta);
        }
      } catch {
        /* swallow */
      }
    }
  }
  return full;
}

class AnthropicProvider implements LLMProvider {
  readonly name: string;
  readonly baseUrl: string;
  constructor(private readonly cfg: LLMConfig) {
    this.name = `anthropic:${cfg.model}`;
    this.baseUrl = cfg.baseUrl!;
    if (!cfg.apiKey) throw new Error('Anthropic provider requires apiKey');
  }

  async ping(): Promise<PingResult> {
    const t0 = Date.now();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        providerName: 'anthropic',
        baseUrl: this.baseUrl,
        latencyMs: Date.now() - t0,
        modelCount: models.length,
        modelAvailable: models.some((m) => m.id === this.cfg.model),
        serverInfo: 'anthropic',
      };
    } catch (e) {
      return {
        ok: false,
        providerName: 'anthropic',
        baseUrl: this.baseUrl,
        error: (e as Error).message,
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'x-api-key': this.cfg.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 5_000),
    });
    if (!res.ok) {
      throw new Error(`Models endpoint returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; display_name?: string; created_at?: string }>;
    };
    return (json.data ?? []).map((m) => ({
      id: m.id,
      label: m.display_name ?? m.id,
      modifiedAt: m.created_at,
    }));
  }

  async chat(messages: ChatMessage[], onChunk?: StreamHandler): Promise<string> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.cfg.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.cfg.model,
        system: system || undefined,
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
        temperature: this.cfg.temperature ?? 0.2,
        max_tokens: this.cfg.maxTokens ?? 2048,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 180_000),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM error ${res.status}: ${body.slice(0, 500)}`);
    }
    return readAnthropicStream(res.body, onChunk);
  }
}

/** Anthropic SSE: `data: { type:'content_block_delta', delta:{ text } }`. */
async function readAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: StreamHandler,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const json = JSON.parse(data) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (json.type === 'content_block_delta' && json.delta?.text) {
            full += json.delta.text;
            onChunk?.(json.delta.text);
          }
        } catch {
          /* swallow */
        }
      }
    }
  }
  return full;
}
