import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFileTree, openArchive } from '@lynsight/parser';
import { registerBundle } from '@/lib/bundles';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Lightweight endpoint that just extracts the uploaded archive and registers
 * it as a browseable bundle. The (heavy) analyze + LLM step is decoupled so
 * that the user can already explore the bundle's files while choosing the
 * analysis options or while the LLM is running.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let uploadDir: string | null = null;
  try {
    const form = await req.formData();
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
    const bundle = registerBundle({ rootDir: archive.rootDir, tree });

    return NextResponse.json({
      bundle: {
        id: bundle.id,
        tree: bundle.tree,
        expiresAt: bundle.expiresAt,
        fileCount: archive.files.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? 'Unknown error' },
      { status: 500 },
    );
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
