import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { extract as tarExtract } from 'tar';

export interface ExtractedArchive {
  /** Absolute path to the temp directory holding extracted files. */
  rootDir: string;
  /** All files found inside the archive (absolute paths). */
  files: string[];
  /** Convenience map: lowercased basename -> absolute path. */
  byName: Map<string, string>;
}

/**
 * Extracts a Lynis audit `.tar.gz` (or plain directory) and returns the
 * extracted file index. If `input` is a directory, no extraction is performed.
 */
export async function openArchive(input: string): Promise<ExtractedArchive> {
  const st = await stat(input);

  if (st.isDirectory()) {
    const files = await walk(input);
    return buildArchive(input, files);
  }

  const dir = await mkdtemp(join(tmpdir(), 'lynsight-'));
  await new Promise<void>((resolve, reject) => {
    createReadStream(input)
      .pipe(tarExtract({ cwd: dir }))
      .on('finish', () => resolve())
      .on('error', reject);
  });
  const files = await walk(dir);
  return buildArchive(dir, files);
}

function buildArchive(rootDir: string, files: string[]): ExtractedArchive {
  const byName = new Map<string, string>();
  for (const f of files) byName.set(basename(f).toLowerCase(), f);
  return { rootDir, files, byName };
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Reads the first file from the archive matching one of the candidate names. */
export async function readFirstMatch(
  archive: ExtractedArchive,
  candidates: string[],
): Promise<{ path: string; content: string } | null> {
  for (const name of candidates) {
    const path = archive.byName.get(name.toLowerCase());
    if (path) {
      const content = await readFile(path, 'utf8');
      return { path, content };
    }
  }
  return null;
}
