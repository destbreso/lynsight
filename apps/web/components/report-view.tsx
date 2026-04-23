'use client';

import { useState } from 'react';
import type { AnalyzedReport, ReportSummary } from '@lynsight/core';
import type { FileNode, ParsedReport, Severity } from '@lynsight/parser';
import type { EnrichedFinding, EnrichedNarratives } from '@lynsight/llm';
import SeverityChart from './severity-chart';
import CategoryChart from './category-chart';
import FindingsTable from './findings-table';
import MarkdownView from './markdown-view';

export interface AnalyzeResponse {
  report: ParsedReport;
  summary: ReportSummary;
  /** Full AnalyzedReport - used by the PDF endpoint. */
  analyzed: AnalyzedReport;
  /** Browseable extracted bundle. Absent on parse-only flows. */
  bundle?: {
    id: string;
    tree: FileNode;
    expiresAt: number;
  };
  /** Map of finding id → relative file paths inside the bundle. */
  relatedFilesById?: Record<string, string[]>;
  enriched: {
    providerName: string;
    narratives: EnrichedNarratives;
    findings: EnrichedFinding[];
    meta: {
      providerName: string;
      enrichedCount: number;
      skippedCount: number;
      timings: Record<string, number>;
      errors: string[];
    };
  } | null;
}

const GRADE_COLORS: Record<ReportSummary['grade'], string> = {
  A: 'text-green-500 border-green-500',
  B: 'text-lime-500 border-lime-500',
  C: 'text-yellow-500 border-yellow-500',
  D: 'text-orange-500 border-orange-500',
  F: 'text-red-500 border-red-500',
};

const NARRATIVE_SECTIONS: Array<{ key: keyof EnrichedNarratives; title: string; icon: string }> = [
  { key: 'executiveSummary', title: 'Executive summary', icon: '📋' },
  { key: 'riskNarrative', title: 'Risk narrative', icon: '📖' },
  { key: 'attackSurface', title: 'Attack surface analysis', icon: '🎯' },
  { key: 'actionRoadmap', title: 'Action roadmap (24h / 7d / 30d)', icon: '🗺️' },
  { key: 'compliance', title: 'Compliance posture', icon: '✅' },
];

export default function ReportView({
  data,
  onOpenFile,
}: {
  data: AnalyzeResponse;
  /** Provided by the parent when a browseable bundle is available. */
  onOpenFile?: (path: string) => void;
}) {
  const { report, summary, analyzed, enriched, bundle, relatedFilesById } = data;
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function downloadPdf() {
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analyzed,
          enriched: enriched
            ? {
                base: analyzed,
                narratives: enriched.narratives,
                findings: enriched.findings,
                meta: enriched.meta,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lynsight-${report.system.hostname ?? 'report'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError((e as Error).message);
    } finally {
      setDownloadingPdf(false);
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lynsight-${report.system.hostname ?? 'report'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          {report.system.hostname && <span className="font-mono">{report.system.hostname}</span>}
          {report.system.osFullName && <span> · {report.system.osFullName}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloadingPdf}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {downloadingPdf ? 'Generating PDF…' : '↓ Download PDF'}
          </button>
          <button
            type="button"
            onClick={downloadJson}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
          >
            ↓ Download JSON
          </button>
          {pdfError && <span className="text-xs text-red-500">{pdfError}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Overall grade">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 text-3xl font-extrabold ${GRADE_COLORS[summary.grade]}`}
          >
            {summary.grade}
          </div>
        </Card>
        <Card label="Risk score">
          <div className="text-3xl font-bold">
            {summary.riskScore}
            <span className="ml-1 text-sm font-normal text-slate-400">/100</span>
          </div>
        </Card>
        <Card label="Hardening index">
          <div className="text-3xl font-bold">
            {summary.hardeningIndex ?? '—'}
            {summary.hardeningIndex !== null && (
              <span className="ml-1 text-sm font-normal text-slate-400">/100</span>
            )}
          </div>
          <div className="text-xs text-slate-400">Lynis built-in</div>
        </Card>
        <Card label="Findings">
          <div className="text-3xl font-bold">{report.findings.length}</div>
          <div className="flex flex-wrap gap-1 text-xs text-slate-400">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
              <span key={s}>
                {summary.totals[s]} {s}
              </span>
            ))}
          </div>
        </Card>
        <Card label="✓ Strengths">
          <div className="text-3xl font-bold text-green-500">{summary.strengths.length}</div>
          <div className="text-xs text-slate-400">
            {summary.strengthsPointsMax > 0
              ? `${summary.strengthsPointsAwarded} / ${summary.strengthsPointsMax} pts`
              : 'controls in place'}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Severity breakdown">
          <SeverityChart totals={summary.totals} />
        </Panel>
        <Panel title="By category">
          <CategoryChart buckets={summary.byCategory} />
        </Panel>
      </div>

      {enriched &&
        NARRATIVE_SECTIONS.map(({ key, title, icon }) => {
          const content = enriched.narratives[key];
          if (!content) return null;
          const ms = enriched.meta.timings[key];
          return (
            <Panel
              key={key}
              title={`${icon} ${title}`}
              subtitle={
                ms ? `${enriched.providerName} · ${(ms / 1000).toFixed(1)}s` : enriched.providerName
              }
            >
              <MarkdownView content={content} />
            </Panel>
          );
        })}

      {summary.strengths.length > 0 && (
        <Panel
          title={`✓ Strengths - ${summary.strengths.length} hardening controls in place`}
          subtitle={
            summary.strengthsPointsMax > 0
              ? `${summary.strengthsPointsAwarded} / ${summary.strengthsPointsMax} hardening points awarded`
              : undefined
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            These Lynis tests passed: the corresponding hardening control is active on this host.
            Use this list to confirm previous remediation work is still effective.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Tests</th>
                  <th className="py-2 pr-4">Points</th>
                  <th className="py-2 pr-4">Test IDs</th>
                </tr>
              </thead>
              <tbody>
                {summary.strengthsByCategory.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: b.color }}
                      />
                      {b.label}
                    </td>
                    <td className="py-2 pr-4 font-mono">{b.count}</td>
                    <td className="py-2 pr-4 font-mono">
                      {b.pointsAwarded}
                      {b.pointsMax ? ` / ${b.pointsMax}` : ''}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                      {b.testIds.slice(0, 6).join(', ')}
                      {b.testIds.length > 6 ? ` …+${b.testIds.length - 6}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              Show all {summary.strengths.length} passing tests
            </summary>
            <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {summary.strengths.map((s) => (
                <li key={s.id} className="rounded bg-green-50 px-2 py-1 dark:bg-green-950/30">
                  <code className="font-mono text-green-700 dark:text-green-400">{s.id}</code>
                  <span className="ml-2 text-slate-500">{s.category}</span>
                  <span className="ml-2 font-mono">
                    {s.pointsAwarded}
                    {s.pointsMax ? `/${s.pointsMax}` : ''}
                  </span>
                  {s.description && (
                    <div className="text-[11px] text-slate-500">{s.description}</div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </Panel>
      )}

      <Panel title="Findings">
        <FindingsTable
          findings={report.findings}
          enrichedById={
            enriched
              ? Object.fromEntries(
                  enriched.findings
                    .filter((f) => f.llmRemediation)
                    .map((f) => [f.id, f.llmRemediation!]),
                )
              : {}
          }
          relatedFilesById={relatedFilesById ?? {}}
          onOpenFile={bundle ? onOpenFile : undefined}
        />
      </Panel>

      <Panel title="System">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {Object.entries({
            Hostname: report.system.hostname,
            OS: report.system.osFullName ?? report.system.os,
            Kernel: report.system.kernelVersion,
            'Lynis version': report.meta.lynisVersion,
            'Tests executed': report.meta.testsExecuted,
            'Tests skipped': report.meta.testsSkipped,
            Auditor: report.meta.auditorName,
            Started: report.meta.reportDatetimeStart,
          }).map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800"
            >
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-mono text-xs">{v == null ? '—' : String(v)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {enriched && enriched.meta.errors.length > 0 && (
        <Panel title={`LLM errors (${enriched.meta.errors.length})`}>
          <ul className="space-y-1 font-mono text-xs text-red-500">
            {enriched.meta.errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}
