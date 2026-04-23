import { stat } from 'node:fs/promises';
import { relative, sep } from 'node:path';

export interface FileNode {
  /** POSIX-style path relative to the bundle root. Empty string for the root. */
  path: string;
  /** Last segment of the path (or "/" for the root). */
  name: string;
  isDir: boolean;
  /** File size in bytes. Only set for files. */
  size?: number;
  /** Sorted children (directories first, then files). Only set for dirs. */
  children?: FileNode[];
}

interface MutableNode extends FileNode {
  children?: MutableNode[];
  _byName?: Map<string, MutableNode>;
}

/**
 * Builds a hierarchical tree from a flat list of absolute file paths and the
 * directory they live under. Sizes are read from disk (fast `stat` per file).
 */
export async function buildFileTree(rootDir: string, files: string[]): Promise<FileNode> {
  const root: MutableNode = {
    path: '',
    name: '/',
    isDir: true,
    children: [],
    _byName: new Map(),
  };

  // Build the tree skeleton first.
  for (const abs of files) {
    const rel = relative(rootDir, abs).split(sep).join('/');
    if (!rel) continue;
    const segments = rel.split('/');
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isLeaf = i === segments.length - 1;
      const childPath = segments.slice(0, i + 1).join('/');
      let child = node._byName!.get(seg);
      if (!child) {
        child = isLeaf
          ? { path: childPath, name: seg, isDir: false }
          : { path: childPath, name: seg, isDir: true, children: [], _byName: new Map() };
        node._byName!.set(seg, child);
        node.children!.push(child);
      }
      if (!isLeaf) node = child;
    }
  }

  // Stat files in parallel.
  const fileNodes: MutableNode[] = [];
  collectFiles(root, fileNodes);
  await Promise.all(
    fileNodes.map(async (n) => {
      try {
        const s = await stat(`${rootDir}/${n.path}`);
        n.size = s.size;
      } catch {
        /* ignore — file vanished */
      }
    }),
  );

  sortTree(root);
  stripInternal(root);
  return root;
}

function collectFiles(node: MutableNode, out: MutableNode[]): void {
  if (!node.isDir) {
    out.push(node);
    return;
  }
  for (const c of node.children ?? []) collectFiles(c, out);
}

function sortTree(node: MutableNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

function stripInternal(node: MutableNode): void {
  delete node._byName;
  if (node.children) for (const c of node.children) stripInternal(c);
}
