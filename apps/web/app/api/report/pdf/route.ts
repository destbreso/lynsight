import { NextRequest, NextResponse } from 'next/server';
import type { AnalyzedReport } from '@lynsight/core';
import type { EnrichedReport } from '@lynsight/llm';
import { renderPdf } from '@lynsight/reports';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface PdfBody {
  analyzed: AnalyzedReport;
  enriched?: EnrichedReport;
  title?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as PdfBody;
    if (!body.analyzed) {
      return NextResponse.json({ error: 'analyzed report is required' }, { status: 400 });
    }
    const pdf = await renderPdf({
      analyzed: body.analyzed,
      enriched: body.enriched,
      title: body.title,
    });
    const filename = `lynsight-${body.analyzed.report.system.hostname ?? 'report'}-${Date.now()}.pdf`;
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? 'Unknown error' }, { status: 500 });
  }
}
