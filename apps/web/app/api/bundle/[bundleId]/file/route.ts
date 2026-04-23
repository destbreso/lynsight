import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { getBundle } from '@/lib/bundles';

export const runtime = 'nodejs';

/** Hard cap so we never push a multi-GB log file into the browser. */
const MAX_BYTES = 5 * 1024 * 1024;

interface RouteContext {
  params: Promise<{ bundleId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { bundleId } = await ctx.params;
  const bundle = getBundle(bundleId);
  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found or expired' }, { status: 404 });
  }

  const requestedPath = req.nextUrl.searchParams.get('path');
  if (!requestedPath) {
    return NextResponse.json({ error: 'Missing "path" query parameter' }, { status: 400 });
  }

  // Strict path-traversal guard: resolve under rootDir and ensure the result
  // still lives inside it. Reject absolute paths and `..` escapes.
  const rootDir = bundle.rootDir;
  const safe = resolve(rootDir, requestedPath);
  if (safe !== rootDir && !safe.startsWith(rootDir + sep)) {
    return NextResponse.json({ error: 'Path is outside the bundle' }, { status: 400 });
  }

  let info;
  try {
    info = await stat(safe);
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  if (!info.isFile()) {
    return NextResponse.json({ error: 'Not a regular file' }, { status: 400 });
  }

  const truncated = info.size > MAX_BYTES;
  const buf = truncated
    ? (await readFile(safe)).subarray(0, MAX_BYTES)
    : await readFile(safe);

  // Best-effort binary detection: if the first 8 KB contain a NUL byte we
  // refuse to send it as text — the browser cannot render it usefully and
  // the JSON envelope would explode in size due to escaping.
  const probe = buf.subarray(0, Math.min(buf.length, 8192));
  let isBinary = false;
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) {
      isBinary = true;
      break;
    }
  }

  return NextResponse.json({
    path: requestedPath,
    size: info.size,
    truncated,
    isBinary,
    content: isBinary ? null : buf.toString('utf8'),
    language: languageFor(requestedPath),
  });
}

function languageFor(path: string): string {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    case '.sh':
    case '.bash':
      return 'bash';
    case '.conf':
    case '.cnf':
      return 'ini';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.xml':
      return 'xml';
    case '.diff':
    case '.patch':
      return 'diff';
    default:
      return 'plain';
  }
}
