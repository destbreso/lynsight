import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildFileTree,
  openArchive,
  parseExtractedArchive,
  type ExtractedArchive,
} from '@lynsight/parser';
import { analyze } from '@lynsight/core';
import { createProvider, enrichReport, type ProviderKind } from '@lynsight/llm';
import { getBundle, registerBundle, type BundleEntry } from '@/lib/bundles';
import { buildRelatedFilesIndex } from '@/lib/finding-sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // The temp dir holding the *uploaded tar.gz* is short-lived: we delete it at
  // the end. The temp dir holding the *extracted bundle* is owned by the
  // bundle registry and self-cleans on TTL.
  let uploadDir: string | null = null;
  try {
    const form = await req.formData();

    // Two entry points: either re-use a bundle that was already uploaded via
    // /api/upload (preferred — the user has already been browsing it), or
    // accept a fresh tar.gz upload as a fallback.
    let bundle: BundleEntry;
    const bundleIdField = form.get('bundleId');
    if (typeof bundleIdField === 'string' && bundleIdField) {
      const existing = getBundle(bundleIdField);
      if (!existing) {
        return NextResponse.json(
          { error: 'Bundle not found or expired. Re-upload the archive.' },
          { status: 404 },
        );
      }
      bundle = existing;
    } else {
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      uploadDir = await mkdtemp(join(tmpdir(), 'lynsight-up-'));
      const tarPath = join(uploadDir, file.name || 'upload.tar.gz');
      await writeFile(tarPath, Buffer.from(arrayBuffer));
      const archive = await openArchive(tarPath);
      const tree = await buildFileTree(archive.rootDir, archive.files);
      bundle = registerBundle({ rootDir: archive.rootDir, tree });
    }

    // Re-parse from the (kept) extracted directory.
    const archive: ExtractedArchive = {
      rootDir: bundle.rootDir,
      files: [],
      byName: new Map(),
    };
    // Rebuild the file index from the tree (cheap — no disk walk needed).
    flattenTree(bundle.tree, bundle.rootDir, archive);

    const report = await parseExtractedArchive(archive);
    const analyzed = analyze(report);
    const relatedFilesById = buildRelatedFilesIndex(report.findings, bundle.tree);

    const useLlm = form.get('llm') === 'true' || form.get('llm') === 'on';
    let enriched;
    if (useLlm) {
      const provider = createProvider({
        provider: (form.get('provider') as ProviderKind) || 'ollama',
        model: (form.get('model') as string) || 'llama3.1:8b',
        baseUrl: (form.get('baseUrl') as string) || undefined,
        apiKey: (form.get('apiKey') as string) || process.env['LYNSIGHT_API_KEY'] || undefined,
      });
      enriched = await enrichReport(provider, analyzed, {
        language: (form.get('language') as string) || 'en',
        audience: (form.get('audience') as string) || 'mixed (engineers + management)',
        topFindings: 8,
        concurrency: 2,
      });
    }

    return NextResponse.json({
      report: analyzed.report,
      summary: analyzed.summary,
      analyzed,
      bundle: {
        id: bundle.id,
        tree: bundle.tree,
        expiresAt: bundle.expiresAt,
      },
      relatedFilesById,
      enriched: enriched
        ? {
            providerName: enriched.meta.providerName,
            narratives: enriched.narratives,
            findings: enriched.findings,
            meta: enriched.meta,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? 'Unknown error' }, { status: 500 });
  } finally {
    if (uploadDir) {
      try {
        await rm(uploadDir, { recursive: true, force: true });
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Reconstructs an `ExtractedArchive` from the cached file tree. The tree
 * already has every file path relative to the bundle root, so we don't need
 * to re-walk the disk just to feed the parser's `readFirstMatch` helper.
 */
function flattenTree(
  node: {
    path: string;
    name: string;
    isDir: boolean;
    children?: { path: string; name: string; isDir: boolean; children?: unknown[] }[];
  },
  rootDir: string,
  out: ExtractedArchive,
): void {
  if (!node.isDir) {
    const abs = `${rootDir}/${node.path}`;
    out.files.push(abs);
    out.byName.set(node.name.toLowerCase(), abs);
    return;
  }
  for (const c of node.children ?? []) {
    flattenTree(c as Parameters<typeof flattenTree>[0], rootDir, out);
  }
}
