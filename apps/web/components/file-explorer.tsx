'use client';

import { useEffect, useState } from 'react';
import type { FileNode } from '@lynsight/parser';

interface FileResponse {
  path: string;
  size: number;
  truncated: boolean;
  isBinary: boolean;
  content: string | null;
  language: string;
}

interface FileExplorerProps {
  bundleId: string;
  tree: FileNode;
  /** When set, the drawer opens with this file selected. */
  initialPath?: string | null;
  open: boolean;
  onClose: () => void;
}

export default function FileExplorer({
  bundleId,
  tree,
  initialPath,
  open,
  onClose,
}: FileExplorerProps) {
  const [selected, setSelected] = useState<string | null>(initialPath ?? null);
  const [file, setFile] = useState<FileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Sync the externally requested file (clicking a "Sources" link).
  useEffect(() => {
    if (initialPath) setSelected(initialPath);
  }, [initialPath]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Fetch the selected file.
  useEffect(() => {
    if (!open || !selected) {
      setFile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/bundle/${bundleId}/file?path=${encodeURIComponent(selected)}`;
    fetch(url)
      .then(async (r) => {
        const j = (await r.json()) as FileResponse | { error: string };
        if (cancelled) return;
        if (!r.ok || 'error' in j) {
          throw new Error('error' in j ? j.error : `HTTP ${r.status}`);
        }
        setFile(j);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selected, bundleId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close explorer"
        onClick={onClose}
        className="flex-1 bg-slate-950/40 backdrop-blur-sm"
      />
      {/* Drawer */}
      <aside className="flex h-full w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span aria-hidden>📂</span>
            <h2 className="text-sm font-semibold">Bundle explorer</h2>
            {selected && (
              <span className="ml-2 truncate font-mono text-xs text-slate-500">{selected}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕ Close
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Tree */}
          <nav className="flex w-72 flex-col border-r border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-200 p-2 dark:border-slate-800">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter files…"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="flex-1 overflow-auto p-1 text-xs">
              <Tree
                node={tree}
                depth={0}
                selected={selected}
                onSelect={setSelected}
                filter={filter.trim().toLowerCase()}
              />
            </div>
          </nav>

          {/* Viewer */}
          <section className="flex flex-1 flex-col overflow-hidden">
            {!selected && (
              <div className="m-auto max-w-md text-center text-sm text-slate-500">
                Select a file from the tree on the left to view its contents.
              </div>
            )}
            {selected && loading && (
              <div className="m-auto text-sm text-slate-500">Loading {selected}…</div>
            )}
            {selected && error && (
              <div className="m-auto max-w-md rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}
            {file && (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span>{formatBytes(file.size)}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                      {file.language}
                    </span>
                    {file.truncated && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        truncated to 5 MB
                      </span>
                    )}
                    {file.isBinary && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        binary
                      </span>
                    )}
                  </div>
                  <a
                    href={`/api/bundle/${bundleId}/file?path=${encodeURIComponent(file.path)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    raw
                  </a>
                </div>
                <pre className="flex-1 overflow-auto bg-slate-50 p-3 font-mono text-[11px] leading-5 dark:bg-slate-900">
                  {file.isBinary ? '— binary content not displayed —' : file.content}
                </pre>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

interface TreeProps {
  node: FileNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  filter: string;
}

function Tree({ node, depth, selected, onSelect, filter }: TreeProps) {
  // The virtual root has empty path: render its children directly.
  if (node.path === '' && node.isDir) {
    return (
      <ul>
        {node.children?.map((c) => (
          <Tree
            key={c.path}
            node={c}
            depth={0}
            selected={selected}
            onSelect={onSelect}
            filter={filter}
          />
        ))}
      </ul>
    );
  }

  if (filter && !subtreeMatches(node, filter)) return null;

  if (!node.isDir) {
    const isSelected = node.path === selected;
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
            isSelected
              ? 'bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              : ''
          }`}
        >
          <span aria-hidden>📄</span>
          <span className="truncate">{node.name}</span>
        </button>
      </li>
    );
  }

  // Auto-expand directories when a filter is active so matches surface.
  return (
    <li>
      <details open={depth < 1 || !!filter}>
        <summary
          style={{ paddingLeft: 8 + depth * 12 }}
          className="cursor-pointer rounded px-2 py-1 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span aria-hidden className="mr-1">
            📁
          </span>
          {node.name}
        </summary>
        <ul>
          {node.children?.map((c) => (
            <Tree
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              filter={filter}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

function subtreeMatches(node: FileNode, filter: string): boolean {
  if (node.path.toLowerCase().includes(filter)) return true;
  if (node.isDir && node.children) {
    return node.children.some((c) => subtreeMatches(c, filter));
  }
  return false;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
