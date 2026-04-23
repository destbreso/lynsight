import { AnalyzedReport } from '@lynsight/core';
import { EnrichedReport } from '@lynsight/llm';

export function renderJson(analyzed: AnalyzedReport, enriched?: EnrichedReport): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      report: analyzed.report,
      summary: analyzed.summary,
      enriched: enriched
        ? {
            providerName: enriched.meta.providerName,
            narratives: enriched.narratives,
            findings: enriched.findings,
            meta: enriched.meta,
          }
        : null,
    },
    null,
    2,
  );
}
