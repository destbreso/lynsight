import { Finding, FindingKind, ParsedReport, Severity } from '@lynsight/parser';

/**
 * Heuristic severity table by test ID prefix. These are intentionally
 * conservative defaults — power users can override them at runtime via
 * `prioritize(report, { overrides: { 'SSH-7408': 'critical' } })`.
 *
 * The matrix follows what Lynis itself flags as warning vs suggestion, then
 * bumps a few well-known high-impact controls (SSH root, missing AIDE, no
 * firewall, kernel hardening, malware scanners).
 */
const HIGH_IMPACT_PREFIXES = new Set([
  'SSH', // remote access
  'AUTH', // PAM, password policies
  'CRYP', // weak crypto
  'FIRE', // firewall absent
  'MALW', // malware tooling missing
  'KRNL', // kernel hardening
  'MACF', // SELinux/AppArmor
  'BOOT', // grub password, secure boot
]);

const CRITICAL_TESTS = new Set([
  'SSH-7408', // root login allowed
  'AUTH-9286', // empty passwords
  'AUTH-9262', // no password aging
  'KRNL-5820', // reboot needed
  'MALW-3280', // no malware scanner
]);

export interface PrioritizeOptions {
  /** Force a specific severity for given test IDs. */
  overrides?: Record<string, Severity>;
}

export function prioritize(report: ParsedReport, options: PrioritizeOptions = {}): ParsedReport {
  const findings = report.findings.map((f) => assign(f, options.overrides));
  return { ...report, findings };
}

function assign(f: Finding, overrides?: Record<string, Severity>): Finding {
  const override = overrides?.[f.id];
  if (override) return { ...f, severity: override };

  if (CRITICAL_TESTS.has(f.id)) return { ...f, severity: Severity.CRITICAL };

  const prefix = f.category.toUpperCase();
  const isHighImpact = HIGH_IMPACT_PREFIXES.has(prefix);

  if (f.kind === FindingKind.WARNING) {
    return { ...f, severity: isHighImpact ? Severity.CRITICAL : Severity.HIGH };
  }
  // suggestion
  return { ...f, severity: isHighImpact ? Severity.MEDIUM : Severity.LOW };
}

/** Fixed numeric weight per severity, used by scoring + sorting. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  high: 40,
  medium: 10,
  low: 2,
  info: 0,
};

/** Sort findings: by severity desc, then by category, then by id. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const wb = SEVERITY_WEIGHT[b.severity] ?? 0;
    const wa = SEVERITY_WEIGHT[a.severity] ?? 0;
    const w = wb - wa;
    if (w !== 0) return w;
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}
