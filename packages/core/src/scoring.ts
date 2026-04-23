import { Finding, ParsedReport, Severity, Strength } from '@lynsight/parser';
import { categoryFor } from './categories.js';
import { SEVERITY_WEIGHT } from './prioritize.js';

export interface ReportSummary {
  hardeningIndex: number | null;
  /** Lynsight-computed risk score 0-100 (higher = worse). */
  riskScore: number;
  /** Letter grade derived from riskScore. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totals: Record<Severity, number>;
  byCategory: CategoryBucket[];
  topFindings: Finding[];
  /** Hardening controls that are in place (passed Lynis tests). */
  strengths: Strength[];
  /** Strengths grouped by category. */
  strengthsByCategory: StrengthBucket[];
  /** Total hardening points awarded across all strengths. */
  strengthsPointsAwarded: number;
  /** Total hardening points possible across the same strengths. */
  strengthsPointsMax: number;
}

export interface CategoryBucket {
  id: string;
  label: string;
  domain: string;
  color: string;
  total: number;
  bySeverity: Record<Severity, number>;
}

export interface StrengthBucket {
  id: string;
  label: string;
  domain: string;
  color: string;
  count: number;
  pointsAwarded: number;
  pointsMax: number;
  testIds: string[];
}

export function summarize(report: ParsedReport, topN = 10): ReportSummary {
  const totals = emptySeverityRecord();
  const buckets = new Map<string, CategoryBucket>();

  for (const f of report.findings) {
    totals[f.severity] = (totals[f.severity] ?? 0) + 1;
    const info = categoryFor(f.category);
    let bucket = buckets.get(info.id);
    if (!bucket) {
      bucket = {
        id: info.id,
        label: info.label,
        domain: info.domain,
        color: info.color,
        total: 0,
        bySeverity: emptySeverityRecord(),
      };
      buckets.set(info.id, bucket);
    }
    bucket.total++;
    bucket.bySeverity[f.severity] = (bucket.bySeverity[f.severity] ?? 0) + 1;
  }

  const riskScore = computeRiskScore(totals);
  const grade = gradeFor(riskScore, report.hardeningIndex);

  const topFindings = [...report.findings]
    .sort((a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0))
    .slice(0, topN);

  // Aggregate strengths by category for the same UI treatment as findings.
  const strengthBuckets = new Map<string, StrengthBucket>();
  let strengthsPointsAwarded = 0;
  let strengthsPointsMax = 0;
  for (const s of report.strengths) {
    strengthsPointsAwarded += s.pointsAwarded;
    strengthsPointsMax += s.pointsMax;
    const info = categoryFor(s.category);
    let bucket = strengthBuckets.get(info.id);
    if (!bucket) {
      bucket = {
        id: info.id,
        label: info.label,
        domain: info.domain,
        color: info.color,
        count: 0,
        pointsAwarded: 0,
        pointsMax: 0,
        testIds: [],
      };
      strengthBuckets.set(info.id, bucket);
    }
    bucket.count++;
    bucket.pointsAwarded += s.pointsAwarded;
    bucket.pointsMax += s.pointsMax;
    bucket.testIds.push(s.id);
  }

  return {
    hardeningIndex: report.hardeningIndex,
    riskScore,
    grade,
    totals,
    byCategory: [...buckets.values()].sort((a, b) => b.total - a.total),
    topFindings,
    strengths: report.strengths,
    strengthsByCategory: [...strengthBuckets.values()].sort(
      (a, b) => b.pointsAwarded - a.pointsAwarded,
    ),
    strengthsPointsAwarded,
    strengthsPointsMax,
  };
}

/**
 * Risk score: weighted sum of findings, normalized to 0-100. We cap each
 * severity bucket so a server with hundreds of low-severity items doesn't
 * dominate one with a single critical finding.
 */
function computeRiskScore(totals: Record<Severity, number>): number {
  const caps: Record<Severity, number> = {
    critical: 5,
    high: 10,
    medium: 20,
    low: 40,
    info: 0,
  };
  let raw = 0;
  for (const sev of Object.keys(totals) as Severity[]) {
    const total = totals[sev] ?? 0;
    const cap = caps[sev] ?? 0;
    const weight = SEVERITY_WEIGHT[sev] ?? 0;
    const capped = Math.min(total, cap);
    raw += capped * weight;
  }
  // Theoretical max with caps:
  //   5*100 + 10*40 + 20*10 + 40*2 = 500 + 400 + 200 + 80 = 1180
  const score = Math.round((raw / 1180) * 100);
  return Math.min(100, Math.max(0, score));
}

function gradeFor(risk: number, hardening: number | null): ReportSummary['grade'] {
  // Combine: lower of (riskGrade, hardeningGrade) so a low hardening index
  // can't be hidden by a low risk score.
  const riskGrade = riskToGrade(risk);
  if (hardening === null) return riskGrade;
  const hardeningGrade = hardeningToGrade(hardening);
  return worst(riskGrade, hardeningGrade);
}

function riskToGrade(r: number): ReportSummary['grade'] {
  if (r < 10) return 'A';
  if (r < 25) return 'B';
  if (r < 50) return 'C';
  if (r < 75) return 'D';
  return 'F';
}

function hardeningToGrade(h: number): ReportSummary['grade'] {
  if (h >= 85) return 'A';
  if (h >= 70) return 'B';
  if (h >= 55) return 'C';
  if (h >= 40) return 'D';
  return 'F';
}

const ORDER: ReportSummary['grade'][] = ['A', 'B', 'C', 'D', 'F'];
function worst(a: ReportSummary['grade'], b: ReportSummary['grade']): ReportSummary['grade'] {
  return ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b;
}

function emptySeverityRecord(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}
