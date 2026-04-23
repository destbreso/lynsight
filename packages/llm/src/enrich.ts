import { AnalyzedReport } from '@lynsight/core';
import { Finding } from '@lynsight/parser';
import { LLMProvider } from './providers.js';
import {
  PromptContext,
  SYSTEM_PROMPT,
  actionRoadmapPrompt,
  attackSurfacePrompt,
  compliancePosturePrompt,
  executiveSummaryPrompt,
  osFingerprint,
  remediationPrompt,
  riskNarrativePrompt,
} from './prompts.js';

export interface EnrichedFinding extends Finding {
  /** LLM-generated remediation in Markdown. Optional — may be absent on errors. */
  llmRemediation?: string;
}

export interface EnrichedNarratives {
  /** 5-7 line executive overview in Markdown. */
  executiveSummary?: string;
  /** 2-3 paragraph posture story. */
  riskNarrative?: string;
  /** Attack surface analysis. */
  attackSurface?: string;
  /** 24h / 7d / 30d action roadmap. */
  actionRoadmap?: string;
  /** Mapping to CIS, NIST, ISO, PCI. */
  compliance?: string;
}

export interface EnrichedReport {
  base: AnalyzedReport;
  narratives: EnrichedNarratives;
  /** Findings, possibly enriched with LLM remediation. */
  findings: EnrichedFinding[];
  /** Diagnostics surfaced to the UI. */
  meta: {
    providerName: string;
    enrichedCount: number;
    skippedCount: number;
    /** Map of section name → ms. */
    timings: Record<string, number>;
    errors: string[];
  };
}

export interface EnrichOptions extends PromptContext {
  /** Max number of findings to send to the LLM (top N by severity). */
  topFindings?: number;
  /** Max parallel LLM calls. Default 2 to play nice with Ollama. */
  concurrency?: number;
  /**
   * Subset of narrative sections to generate. Useful for fast previews.
   * Defaults to all sections.
   */
  sections?: Array<keyof EnrichedNarratives>;
  /** Optional progress callback for UIs. */
  onProgress?: (event: ProgressEvent) => void;
}

export type ProgressEvent =
  | { type: 'section_start'; name: keyof EnrichedNarratives }
  | { type: 'section_chunk'; name: keyof EnrichedNarratives; delta: string }
  | { type: 'section_done'; name: keyof EnrichedNarratives; ms: number }
  | { type: 'section_error'; name: keyof EnrichedNarratives; error: string }
  | { type: 'finding_start'; id: string }
  | { type: 'finding_done'; id: string; ms: number }
  | { type: 'finding_error'; id: string; error: string }
  | { type: 'all_done' };

const ALL_SECTIONS: Array<keyof EnrichedNarratives> = [
  'executiveSummary',
  'riskNarrative',
  'attackSurface',
  'actionRoadmap',
  'compliance',
];

export async function enrichReport(
  provider: LLMProvider,
  analyzed: AnalyzedReport,
  options: EnrichOptions,
): Promise<EnrichedReport> {
  const errors: string[] = [];
  const timings: Record<string, number> = {};
  // Auto-fill OS fingerprint from the report so per-finding remediation
  // commands match the actual host (apt vs dnf, systemd vs openrc, etc.).
  const ctx: EnrichOptions = { ...options, os: options.os ?? osFingerprint(analyzed.report) };
  const sys = { role: 'system' as const, content: SYSTEM_PROMPT(ctx) };
  const sectionsRequested = ctx.sections ?? ALL_SECTIONS;

  const narratives: EnrichedNarratives = {};
  const builders: Record<keyof EnrichedNarratives, () => string> = {
    executiveSummary: () => executiveSummaryPrompt(analyzed, ctx),
    riskNarrative: () => riskNarrativePrompt(analyzed, ctx),
    attackSurface: () => attackSurfacePrompt(analyzed, ctx),
    actionRoadmap: () => actionRoadmapPrompt(analyzed, ctx),
    compliance: () => compliancePosturePrompt(analyzed, ctx),
  };

  // Run narrative sections sequentially. Each is independent and we want to
  // keep total throughput predictable for slow local models.
  for (const name of sectionsRequested) {
    const t0 = Date.now();
    options.onProgress?.({ type: 'section_start', name });
    try {
      const onChunk = options.onProgress
        ? (delta: string) => options.onProgress!({ type: 'section_chunk', name, delta })
        : undefined;
      const out = await provider.chat([sys, { role: 'user', content: builders[name]() }], onChunk);
      narratives[name] = out;
      timings[name] = Date.now() - t0;
      options.onProgress?.({ type: 'section_done', name, ms: timings[name] });
    } catch (e) {
      const error = (e as Error).message;
      errors.push(`${name}: ${error}`);
      options.onProgress?.({ type: 'section_error', name, error });
    }
  }

  // Per-finding remediations with bounded concurrency.
  const top = analyzed.summary.topFindings.slice(0, options.topFindings ?? 10);
  const enrichedMap = new Map<string, string>();
  const concurrency = Math.max(1, options.concurrency ?? 2);
  let cursor = 0;
  async function worker() {
    while (cursor < top.length) {
      const idx = cursor++;
      const f = top[idx]!;
      const t0 = Date.now();
      options.onProgress?.({ type: 'finding_start', id: f.id });
      try {
        const out = await provider.chat([
          sys,
          { role: 'user', content: remediationPrompt(f, ctx) },
        ]);
        enrichedMap.set(f.id, out);
        options.onProgress?.({ type: 'finding_done', id: f.id, ms: Date.now() - t0 });
      } catch (e) {
        const error = (e as Error).message;
        errors.push(`${f.id}: ${error}`);
        options.onProgress?.({ type: 'finding_error', id: f.id, error });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const findings: EnrichedFinding[] = analyzed.report.findings.map((f) => {
    const llm = enrichedMap.get(f.id);
    return llm ? { ...f, llmRemediation: llm } : f;
  });

  options.onProgress?.({ type: 'all_done' });

  return {
    base: analyzed,
    narratives,
    findings,
    meta: {
      providerName: provider.name,
      enrichedCount: enrichedMap.size,
      skippedCount: top.length - enrichedMap.size,
      timings,
      errors,
    },
  };
}
