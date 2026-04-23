import { NextRequest, NextResponse } from 'next/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAudit } from '@lynsight/parser';
import { analyze } from '@lynsight/core';
import { createProvider, enrichReport, type ProviderKind } from '@lynsight/llm';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface AnalyzeRequest {
  // multipart/form-data with field "file" required.
  // Optional fields: llm, provider, model, baseUrl, apiKey, language, audience.
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tmpDir: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    tmpDir = await mkdtemp(join(tmpdir(), 'lynsight-up-'));
    const tarPath = join(tmpDir, file.name || 'upload.tar.gz');
    await writeFile(tarPath, Buffer.from(arrayBuffer));

    const report = await parseAudit(tarPath);
    const analyzed = analyze(report);

    const useLlm = form.get('llm') === 'true' || form.get('llm') === 'on';
    let enriched;
    if (useLlm) {
      const provider = createProvider({
        provider: (form.get('provider') as ProviderKind) || 'ollama',
        model: (form.get('model') as string) || 'llama3.1:8b',
        baseUrl: (form.get('baseUrl') as string) || undefined,
        apiKey:
          (form.get('apiKey') as string) || process.env['LYNSIGHT_API_KEY'] || undefined,
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
    return NextResponse.json(
      { error: (e as Error).message ?? 'Unknown error' },
      { status: 500 },
    );
  } finally {
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* swallow */
      }
    }
  }
}
