import { ParsedReport } from '@lynsight/parser';
import { prioritize, sortFindings, PrioritizeOptions } from './prioritize.js';
import { ReportSummary, summarize } from './scoring.js';

export * from './categories.js';
export * from './prioritize.js';
export * from './scoring.js';

/**
 * Convenience pipeline that runs prioritization → sorting → summarization
 * in one call. This is what both the CLI and the web app consume.
 */
export interface AnalyzedReport {
  report: ParsedReport;
  summary: ReportSummary;
}

export function analyze(
  report: ParsedReport,
  options: PrioritizeOptions = {},
): AnalyzedReport {
  const prioritized = prioritize(report, options);
  const sorted = { ...prioritized, findings: sortFindings(prioritized.findings) };
  return { report: sorted, summary: summarize(sorted) };
}
