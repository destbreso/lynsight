'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { FileNode } from '@lynsight/parser';
import ReportView, { type AnalyzeResponse } from './report-view';
import FileExplorer from './file-explorer';

interface BundleInfo {
  id: string;
  tree: FileNode;
  expiresAt: number;
  fileCount: number;
}

interface PingResult {
  ok: boolean;
  latencyMs?: number;
  modelCount?: number;
  modelAvailable?: boolean;
  baseUrl?: string;
  serverInfo?: string;
  error?: string;
}

interface ModelInfo {
  id: string;
  label?: string;
  sizeBytes?: number;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; suggestedModel: string }> = {
  ollama: { baseUrl: 'http://localhost:11434/v1', suggestedModel: 'llama3.1:8b' },
  openai: { baseUrl: 'https://api.openai.com/v1', suggestedModel: 'gpt-4o-mini' },
  'openai-compatible': { baseUrl: 'http://localhost:1234/v1', suggestedModel: '' },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    suggestedModel: 'claude-3-5-sonnet-latest',
  },
};

export default function UploadForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [llm, setLlm] = useState(false);

  const [provider, setProvider] = useState<keyof typeof PROVIDER_DEFAULTS>('ollama');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.ollama!.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_DEFAULTS.ollama!.suggestedModel);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [ping, setPing] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState(false);

  // Bundle state — populated as soon as the user picks a tar.gz, so the file
  // explorer is available *before* the analyze step finishes (or even runs).
  const [bundle, setBundle] = useState<BundleInfo | null>(null);
  const [uploadingBundle, setUploadingBundle] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerPath, setExplorerPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFileInExplorer(path: string) {
    setExplorerPath(path);
    setExplorerOpen(true);
  }

  async function uploadBundle(file: File) {
    setUploadingBundle(true);
    setError(null);
    setBundle(null);
    setUploadedFileName(file.name);
    setData(null); // a new bundle invalidates any prior analysis
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as { bundle?: BundleInfo; error?: string };
      if (!res.ok || !json.bundle) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setBundle(json.bundle);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingBundle(false);
    }
  }

  // When provider changes, reset suggested base URL + clear discovered state.
  useEffect(() => {
    const def = PROVIDER_DEFAULTS[provider]!;
    setBaseUrl(def.baseUrl);
    setModel(def.suggestedModel);
    setModels([]);
    setModelsError(null);
    setPing(null);
  }, [provider]);

  async function discoverModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch('/api/llm/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, apiKey: apiKey || undefined }),
      });
      const json = (await res.json()) as { models?: ModelInfo[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setModels(json.models ?? []);
      // Auto-select first model if current model isn't in the list.
      const list = json.models ?? [];
      if (list.length && !list.some((m) => m.id === model)) {
        setModel(list[0]!.id);
      }
    } catch (e) {
      setModelsError((e as Error).message);
    } finally {
      setModelsLoading(false);
    }
  }

  async function verifyConnection() {
    setPinging(true);
    setPing(null);
    try {
      const res = await fetch('/api/llm/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, model, baseUrl, apiKey: apiKey || undefined }),
      });
      const json = (await res.json()) as PingResult;
      setPing(json);
    } catch (e) {
      setPing({ ok: false, error: (e as Error).message });
    } finally {
      setPinging(false);
    }
  }

  // Auto-discover models when LLM gets enabled (once per provider change).
  useEffect(() => {
    if (llm && models.length === 0 && !modelsLoading) {
      void discoverModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llm, provider]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bundle) {
      setError('Upload a Lynis archive first.');
      return;
    }
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const fd = new FormData(e.currentTarget);
      // Reuse the already-extracted bundle instead of re-uploading the file.
      fd.delete('file');
      fd.set('bundleId', bundle.id);
      fd.set('model', model);
      fd.set('baseUrl', baseUrl);
      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as AnalyzeResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Lynis audit (.tar.gz)</span>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".gz,.tgz,.tar,.tar.gz,application/gzip,application/x-gzip,application/x-tar"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void uploadBundle(f);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              name="llm"
              checked={llm}
              onChange={(e) => setLlm(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">
              Enrich with an LLM (executive summary, risk narrative, attack surface, action roadmap,
              compliance, per-finding remediation)
            </span>
          </label>

          {llm && (
            <>
              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Provider
                </span>
                <select
                  name="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as keyof typeof PROVIDER_DEFAULTS)}
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="ollama">Ollama (local)</option>
                  <option value="openai">OpenAI</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>

              <label>
                <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Model</span>
                  <button
                    type="button"
                    onClick={() => void discoverModels()}
                    disabled={modelsLoading}
                    className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {modelsLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </span>
                {models.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label ?? m.id}
                        {m.sizeBytes ? ` — ${formatBytes(m.sizeBytes)}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={PROVIDER_DEFAULTS[provider]!.suggestedModel}
                    className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                )}
                {modelsError && (
                  <span className="mt-1 block text-xs text-red-500">{modelsError}</span>
                )}
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Base URL
                </span>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  API key (optional)
                </span>
                <input
                  name="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="not needed for Ollama"
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Language
                </span>
                <select
                  name="language"
                  defaultValue="en"
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="it">Italiano</option>
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Audience
                </span>
                <input
                  name="audience"
                  defaultValue="mixed (engineers + management)"
                  className="block w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => void verifyConnection()}
                  disabled={pinging}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {pinging ? 'Verifying…' : 'Verify connection'}
                </button>
                {ping && <PingBadge ping={ping} model={model} />}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !bundle || uploadingBundle}
            title={!bundle ? 'Upload a Lynis archive first' : undefined}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </form>

      {/* Bundle ready / explorer trigger — shown as soon as the upload finishes,
          BEFORE the analyze step. */}
      {(uploadingBundle || bundle) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-300/60 bg-indigo-50/50 p-4 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/20">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              📂
            </span>
            <div>
              {uploadingBundle ? (
                <span className="text-slate-500">Extracting bundle…</span>
              ) : (
                <>
                  <div className="font-semibold text-slate-700 dark:text-slate-200">
                    Bundle ready
                    {uploadedFileName && (
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {uploadedFileName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {bundle!.fileCount} files · explore the audit contents now — you don’t have to
                    wait for the analysis.
                  </div>
                </>
              )}
            </div>
          </div>
          {bundle && (
            <button
              type="button"
              onClick={() => {
                setExplorerPath(null);
                setExplorerOpen(true);
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              📂 Explore bundle
            </button>
          )}
        </div>
      )}

      {data && <ReportView data={data} onOpenFile={bundle ? openFileInExplorer : undefined} />}

      {bundle && (
        <FileExplorer
          bundleId={bundle.id}
          tree={bundle.tree}
          open={explorerOpen}
          initialPath={explorerPath}
          onClose={() => setExplorerOpen(false)}
        />
      )}
    </div>
  );
}

function PingBadge({ ping, model }: { ping: PingResult; model: string }) {
  if (!ping.ok) {
    return (
      <span className="ml-3 inline-flex items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        ✗ {ping.error ?? 'Connection failed'}
      </span>
    );
  }
  const modelOk = ping.modelAvailable !== false;
  return (
    <span className="ml-3 inline-flex flex-wrap items-center gap-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
      ✓ Connected · {ping.latencyMs}ms · {ping.modelCount} models
      {!modelOk && (
        <span className="text-amber-600 dark:text-amber-400">· model `{model}` not found</span>
      )}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
