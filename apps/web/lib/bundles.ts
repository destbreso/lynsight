import { rm } from 'node:fs/promises';
import type { FileNode } from '@lynsight/parser';

/**
 * In-memory registry of extracted Lynis audit bundles, indexed by an opaque
 * bundle id. Bundles are kept on disk so that the file-explorer endpoint can
 * stream their contents back to the browser without re-extracting the archive
 * on every request.
 *
 * Entries auto-expire after `BUNDLE_TTL_MS` and the underlying directory is
 * removed. The registry is hung off `globalThis` so it survives Next.js HMR
 * cycles in development.
 */
export interface BundleEntry {
  id: string;
  rootDir: string;
  tree: FileNode;
  createdAt: number;
  expiresAt: number;
  /** Timer that removes the bundle when it expires. */
  timer: NodeJS.Timeout;
}

const BUNDLE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface BundleStore {
  bundles: Map<string, BundleEntry>;
}

const g = globalThis as unknown as { __lynsight_bundles__?: BundleStore };
const store: BundleStore = g.__lynsight_bundles__ ?? { bundles: new Map() };
g.__lynsight_bundles__ = store;

export function registerBundle(input: { rootDir: string; tree: FileNode }): BundleEntry {
  const id = randomId();
  const now = Date.now();
  const expiresAt = now + BUNDLE_TTL_MS;
  const timer = setTimeout(() => {
    void deleteBundle(id);
  }, BUNDLE_TTL_MS);
  // Don't keep the Node process alive just for cleanup.
  if (typeof timer.unref === 'function') timer.unref();

  const entry: BundleEntry = {
    id,
    rootDir: input.rootDir,
    tree: input.tree,
    createdAt: now,
    expiresAt,
    timer,
  };
  store.bundles.set(id, entry);
  return entry;
}

export function getBundle(id: string): BundleEntry | undefined {
  return store.bundles.get(id);
}

export async function deleteBundle(id: string): Promise<void> {
  const entry = store.bundles.get(id);
  if (!entry) return;
  store.bundles.delete(id);
  clearTimeout(entry.timer);
  try {
    await rm(entry.rootDir, { recursive: true, force: true });
  } catch {
    /* swallow — best-effort cleanup */
  }
}

function randomId(): string {
  // 16 hex chars = 64 bits of entropy. Plenty for opaque, short-lived ids.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
