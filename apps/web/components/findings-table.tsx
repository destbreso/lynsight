'use client';

import { useMemo, useState } from 'react';
import type { Finding, Severity } from '@lynsight/parser';
import MarkdownView from './markdown-view';

const SEV_BADGE: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-slate-900',
  low: 'bg-green-500 text-white',
  info: 'bg-slate-400 text-white',
};

const SEV_BORDER: Record<Severity, string> = {
  critical: 'border-l-red-600',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
  info: 'border-l-slate-400',
};

export default function FindingsTable({
  findings,
  enrichedById,
  relatedFilesById = {},
  onOpenFile,
}: {
  findings: Finding[];
  enrichedById: Record<string, string>;
  relatedFilesById?: Record<string, string[]>;
  /** Optional: when set, each finding shows pills that open the explorer. */
  onOpenFile?: (path: string) => void;
}) {
  const [filter, setFilter] = useState<Severity | 'all' | 'ai'>('all');
  const [query, setQuery] = useState('');
  const aiCount = Object.keys(enrichedById).length;

  const filtered = useMemo(() => {
    return (
      findings
        .filter((f) => {
          if (filter === 'ai') {
            if (!enrichedById[f.id]) return false;
          } else if (filter !== 'all' && f.severity !== filter) {
            return false;
          }
          if (query) {
            const q = query.toLowerCase();
            if (
              !f.id.toLowerCase().includes(q) &&
              !f.description.toLowerCase().includes(q) &&
              !f.category.toLowerCase().includes(q)
            )
              return false;
          }
          return true;
        })
        // Surface AI-enriched findings first so the per-finding insights are
        // immediately discoverable.
        .sort((a, b) => {
          const aiA = enrichedById[a.id] ? 1 : 0;
          const aiB = enrichedById[b.id] ? 1 : 0;
          return aiB - aiA;
        })
    );
  }, [findings, filter, query, enrichedById]);

  return (
    <div>
      {aiCount > 0 && (
        <p className="mb-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
          <strong>{aiCount}</strong> finding{aiCount === 1 ? '' : 's'} have AI insights (scope &amp;
          consequences, OS-aware commands, verify and rollback). They are listed first below,
          pre-expanded, and marked with the
          <span className="mx-1 inline-flex items-center rounded-full bg-indigo-500 px-2 py-[1px] text-[10px] font-bold text-white">
            ★ AI
          </span>
          badge.
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          placeholder="Filter by id, description, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <div className="flex flex-wrap gap-1">
          {(['all', 'critical', 'high', 'medium', 'low', 'info'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
          {aiCount > 0 && (
            <button
              onClick={() => setFilter('ai')}
              className={`rounded-md px-2 py-1 text-xs ${
                filter === 'ai'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300'
              }`}
            >
              ★ AI only ({aiCount})
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        {filtered.length === 0 && <p className="text-slate-400">No findings match the filter.</p>}
        {filtered.map((f, i) => {
          const llm = enrichedById[f.id];
          // Lynis can emit the same Test ID more than once (e.g. when the
          // same control is reported as both a warning and a suggestion, or
          // surfaces in multiple sections of lynis-report.dat). React keys
          // must be unique, so we compose `kind:id:index`.
          const rowKey = `${f.kind}:${f.id}:${i}`;
          return (
            <details
              key={rowKey}
              // Auto-open AI-enriched findings so the per-finding insights
              // (commands, verify, rollback) are immediately visible.
              open={Boolean(llm)}
              className={`rounded-lg border border-slate-200 border-l-4 bg-slate-50 p-3 ${SEV_BORDER[f.severity]} dark:border-slate-700 dark:bg-slate-900 ${
                llm ? 'ring-1 ring-indigo-500/40' : ''
              }`}
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEV_BADGE[f.severity]}`}
                >
                  {f.severity}
                </span>
                <span className="font-mono text-xs font-semibold">{f.id}</span>
                <span className="text-xs text-slate-400">{f.category}</span>
                <span className="ml-1 flex-1">{f.description}</span>
                {llm && (
                  <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    ★ AI
                  </span>
                )}
              </summary>
              <div className="mt-3 space-y-3 text-xs">
                {onOpenFile && relatedFilesById[f.id] && relatedFilesById[f.id]!.length > 0 && (
                  <div>
                    <div className="mb-1 font-semibold text-slate-500">📄 Sources in bundle</div>
                    <div className="flex flex-wrap gap-1">
                      {relatedFilesById[f.id]!.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onOpenFile(p)}
                          title={`Open ${p} in the explorer`}
                          className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {f.details && (
                  <div>
                    <div className="mb-1 font-semibold text-slate-500">Details</div>
                    <pre className="overflow-x-auto rounded bg-slate-200/60 p-2 dark:bg-slate-800">
                      {f.details}
                    </pre>
                  </div>
                )}
                {f.solution && (
                  <div>
                    <div className="mb-1 font-semibold text-slate-500">Lynis hint</div>
                    <pre className="overflow-x-auto rounded bg-slate-200/60 p-2 dark:bg-slate-800">
                      {f.solution}
                    </pre>
                  </div>
                )}
                {llm && (
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                      ★ AI insights - scope, commands, verification &amp; rollback
                    </div>
                    <MarkdownView content={llm} />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
