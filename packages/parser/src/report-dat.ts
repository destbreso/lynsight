import {
  Finding,
  FindingKind,
  LynisMeta,
  ParsedReport,
  Severity,
  Strength,
  SystemInfo,
} from './types.js';

/**
 * Parses a Lynis `lynis-report.dat` file (key=value, repeated keys collected
 * into arrays). Multi-value keys conventionally end with `[]` in the file but
 * Lynis emits them without the brackets in some versions, so we accumulate any
 * repeated key into an array.
 */
export function parseReportDat(content: string): {
  raw: Record<string, string | string[]>;
  meta: LynisMeta;
  system: SystemInfo;
  hardeningIndex: number | null;
  findings: Finding[];
  strengths: Strength[];
} {
  const raw = parseKeyValue(content);

  const meta: LynisMeta = {
    reportVersion: pickString(raw, 'report_version_major', 'report_version_minor')
      ? `${asString(raw['report_version_major'])}.${asString(raw['report_version_minor'])}`
      : null,
    lynisVersion: asString(raw['lynis_version']),
    reportDatetimeStart: asString(raw['report_datetime_start']),
    reportDatetimeEnd: asString(raw['report_datetime_end']),
    auditorName: asString(raw['auditor']),
    pluginsEnabled: asArray(raw['plugin_enabled']),
    testsExecuted: asInt(raw['tests_executed']),
    testsSkipped: asInt(raw['tests_skipped']),
  };

  const system: SystemInfo = {
    hostname: asString(raw['hostname']),
    domainname: asString(raw['domainname']),
    os: asString(raw['os']),
    osVersion: asString(raw['os_version']),
    osFullName: asString(raw['os_fullname']),
    kernelVersion: asString(raw['linux_kernel_version']) ?? asString(raw['os_kernel_version']),
    cpuModel: asString(raw['cpu_model']) ?? asString(raw['hardware_cpu_model']),
    uptime: asString(raw['uptime_in_days']),
  };

  const hardeningIndex = asInt(raw['hardening_index']);

  const findings: Finding[] = [
    ...asArray(raw['warning']).map((line) => parseFindingLine(line, FindingKind.WARNING)),
    ...asArray(raw['suggestion']).map((line) => parseFindingLine(line, FindingKind.SUGGESTION)),
  ].filter((f): f is Finding => f !== null);

  // Build a TEST-ID → description index from `details[]` so strengths can be
  // labelled when Lynis emitted a description for the test.
  const detailsById = new Map<string, string>();
  for (const line of asArray(raw['details'])) {
    const parts = line.split('|');
    const id = parts[0]?.trim();
    const desc = clean(parts[1]);
    if (id && desc) detailsById.set(id, desc);
  }

  const strengths: Strength[] = asArray(raw['hardening'])
    .map((line) => parseHardeningLine(line, detailsById))
    .filter((s): s is Strength => s !== null);

  return { raw, meta, system, hardeningIndex, findings, strengths };
}

function parseKeyValue(content: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (key.endsWith('[]')) key = key.slice(0, -2);
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[key] = [existing, value];
    }
  }
  return out;
}

/**
 * Lynis warnings/suggestions look like:
 *   TEST-ID|description|details|solution
 * Pipe characters inside fields are uncommon; we split on the first three only.
 */
function parseFindingLine(line: string, kind: FindingKind): Finding | null {
  const parts = line.split('|');
  if (parts.length < 2) return null;
  const id = parts[0]?.trim() ?? '';
  if (!id) return null;
  const description = (parts[1] ?? '').trim();
  const details = clean(parts[2]);
  const solution = clean(parts[3]);
  const category = id.split('-')[0] ?? 'OTHER';

  return {
    id,
    kind,
    description,
    details,
    solution,
    category,
    // Severity is only a placeholder here; @lynsight/core re-scores findings
    // using its own rule set. We default warnings → high, suggestions → medium.
    severity: kind === FindingKind.WARNING ? Severity.HIGH : Severity.MEDIUM,
  };
}

function clean(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (!t || t === '-') return null;
  return t;
}

/**
 * Lynis hardening lines look like:
 *   TEST-ID|points_awarded|max_points
 * Strengths are tests that earned > 0 points (i.e. controls in place). We
 * skip 0-point lines because those are tests that ran but did not improve
 * the hardening index.
 */
function parseHardeningLine(line: string, detailsById: Map<string, string>): Strength | null {
  const parts = line.split('|');
  const id = parts[0]?.trim();
  if (!id) return null;
  const awarded = Number.parseInt((parts[1] ?? '').trim(), 10);
  const max = Number.parseInt((parts[2] ?? '').trim(), 10);
  if (!Number.isFinite(awarded) || awarded <= 0) return null;
  const category = id.split('-')[0] ?? 'OTHER';
  return {
    id,
    category,
    pointsAwarded: awarded,
    pointsMax: Number.isFinite(max) ? max : awarded,
    description: detailsById.get(id) ?? null,
  };
}

function asString(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v.trim() || null;
}

function asInt(v: string | string[] | undefined): number | null {
  const s = asString(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function pickString(raw: Record<string, string | string[]>, ...keys: string[]): boolean {
  return keys.every((k) => raw[k] !== undefined);
}
