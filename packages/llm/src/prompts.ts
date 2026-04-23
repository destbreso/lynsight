import { AnalyzedReport } from '@lynsight/core';
import { Finding, ParsedReport } from '@lynsight/parser';

export interface PromptContext {
  /** Display language for the LLM output (ISO code or full name). */
  language: string;
  /** Free-form audience hint, e.g. "CTO executive summary" or "sysadmin runbook". */
  audience?: string;
  /**
   * Operating system fingerprint passed to the LLM so the remediation
   * commands match the host (apt vs dnf, systemd vs openrc, etc.).
   * Free-form, e.g. "Ubuntu 22.04 (Linux 5.15)" or "RHEL 9".
   */
  os?: string | null;
}

export const SYSTEM_PROMPT = (ctx: PromptContext): string =>
  `You are a senior Linux security engineer producing a remediation report
from a Lynis audit. Be precise, terse, and actionable. Always cite the
Lynis test ID (e.g. SSH-7408) when referring to a finding. Do not invent
findings that are not in the input. Output language: ${ctx.language}.
Audience: ${ctx.audience ?? 'mixed (engineers + management)'}.
Use Markdown. Never wrap your entire reply in a code fence.`;

export function executiveSummaryPrompt(report: AnalyzedReport, ctx: PromptContext): string {
  const { summary } = report;
  const top = summary.topFindings
    .map((f) => `- [${f.severity.toUpperCase()}] ${f.id}: ${f.description}`)
    .join('\n');

  return `Produce a 5-7 line executive summary of the following Lynis audit.
Cover: overall posture, top 3 risks, recommended next 24h actions.

Hardening index: ${summary.hardeningIndex ?? 'N/A'} / 100
Computed risk score: ${summary.riskScore} / 100 (grade ${summary.grade})
Findings by severity: ${JSON.stringify(summary.totals)}

Top findings:
${top}

Write in ${ctx.language}. Use Markdown. No preamble.`;
}

export function riskNarrativePrompt(report: AnalyzedReport, _ctx: PromptContext): string {
  const { summary, report: r } = report;
  const cats = summary.byCategory
    .slice(0, 8)
    .map(
      (b) =>
        `- ${b.label}: ${b.total} findings (crit ${b.bySeverity.critical}, high ${b.bySeverity.high})`,
    )
    .join('\n');
  return `Write a 2-3 paragraph narrative of the security posture of this host.
Tell a story: what's the threat picture, which subsystems are weakest, what
patterns emerge across categories. Cite test IDs when relevant. Avoid
listing every finding — focus on themes.

System: ${r.system.osFullName ?? r.system.os ?? 'unknown'} on ${r.system.hostname ?? 'unknown host'}
Risk score: ${summary.riskScore}/100 (grade ${summary.grade})
Hardening index: ${summary.hardeningIndex ?? 'N/A'}/100
Top categories:
${cats}

Output Markdown, no headings, just paragraphs.`;
}

export function attackSurfacePrompt(report: AnalyzedReport, _ctx: PromptContext): string {
  // Filter findings that touch network-facing or auth-facing categories.
  const surface = report.report.findings
    .filter((f) =>
      ['SSH', 'NETW', 'FIRE', 'HTTP', 'MAIL', 'NFS', 'RPCS', 'AUTH', 'CRYP', 'NAME'].includes(
        f.category.toUpperCase(),
      ),
    )
    .slice(0, 30)
    .map((f) => `- [${f.severity.toUpperCase()}] ${f.id}: ${f.description}`)
    .join('\n');

  return `Analyze the attack surface of this host based on the network-, auth-,
and crypto-related Lynis findings below. Produce:

### Exposed surface
A bullet list of what is exposed (services, protocols, weak crypto, open auth paths).

### Likely attack paths
2-4 bullets describing realistic attack chains an external or post-foothold attacker could use.

### Hardening priorities
3-5 numbered, concrete steps to shrink the surface, ordered by impact-per-effort.

Findings:
${surface || '(no network/auth findings — note that this is unusual and worth verifying)'}`;
}

export function actionRoadmapPrompt(report: AnalyzedReport, _ctx: PromptContext): string {
  const top = report.summary.topFindings
    .map((f) => `- [${f.severity.toUpperCase()}] ${f.id}: ${f.description}`)
    .join('\n');
  return `Produce a remediation roadmap with three time horizons:

### Next 24 hours (stop the bleeding)
3-5 actions. Critical/high severity items, quick wins.

### Next 7 days (harden)
3-5 actions. Configuration changes, package updates, audit policy.

### Next 30 days (sustain)
3-5 actions. Process changes, monitoring, recurring scans.

Each action: one bold title + one sentence + cite the relevant Lynis test ID(s).

Findings to draw from:
${top}`;
}

export function compliancePosturePrompt(report: AnalyzedReport, _ctx: PromptContext): string {
  const totals = report.summary.totals;
  return `Briefly map the audit findings against common control frameworks.
For each framework, give a 1-line posture statement (e.g. "Partial — 4 control
gaps in Access Control") and 2-3 specific finding IDs that drive the gap.

Frameworks to cover:
- CIS Benchmarks (Linux)
- NIST 800-53 (low/mod baseline)
- ISO 27001 Annex A (technical controls)
- PCI-DSS v4 (relevant Linux requirements)

This is a high-level mapping, not a formal audit. Be honest about uncertainty.

Severity totals: ${JSON.stringify(totals)}
Grade: ${report.summary.grade}, risk ${report.summary.riskScore}/100.

Use a Markdown table:
| Framework | Posture | Driver findings |
| --- | --- | --- |`;
}

export function remediationPrompt(finding: Finding, ctx: PromptContext): string {
  const osHint = ctx.os
    ? `Target OS: ${ctx.os}. Tailor every command to that distribution's package manager and init system.`
    : `Target OS is not specified — provide commands for the two most common Linux families (Debian/Ubuntu with apt + RHEL/Fedora with dnf). Mark each command block with the family it targets.`;

  return `You are remediating a Lynis finding on a real production host. Be
concrete: copy-pasteable commands, exact file paths, exact config keys.
Never invent commands you are not certain about — if you don't know, say so.

${osHint}

Finding:
- ID: ${finding.id}
- Severity: ${finding.severity}
- Category: ${finding.category}
- Description: ${finding.description}
- Details: ${finding.details ?? '(none)'}
- Lynis solution hint: ${finding.solution ?? '(none)'}

Produce **exactly** these Markdown sections (translate the section titles to
${ctx.language}, but keep them as level-3 headings in this order):

### Scope & consequences
2-3 sentences. What does this finding actually mean for the host? What
attack/abuse becomes possible if left unfixed? Who is impacted (operators,
end-users, downstream services)?

### Remediation commands
A numbered list. Each step is one short sentence followed by a fenced code
block with the actual shell commands. If different OS families need different
commands, give one fenced block per family with a label comment on the first
line, e.g. \`# Debian/Ubuntu\` or \`# RHEL/Fedora\`. Prefer idempotent commands.
Include any required service restart at the end.

### Verify
A single fenced shell block whose output proves the fix is in place. Add a
one-line comment above the command explaining what to look for in the output.

### Rollback
One short paragraph + (optional) fenced block with the commands to revert
the change if it breaks something. If the change is safe to leave, say so
explicitly.

Reply in ${ctx.language}. Use Markdown. Do not wrap your entire reply in a
code fence. Do not invent commands.`;
}

/**
 * Build a `PromptContext.os` value from the parsed Lynis report so the LLM
 * receives an accurate OS fingerprint without the caller having to
 * reach into the report shape.
 */
export function osFingerprint(report: ParsedReport): string | null {
  const full = report.system.osFullName?.trim();
  const k = report.system.kernelVersion?.trim();
  if (full && k) return `${full} (Linux ${k})`;
  return full ?? report.system.os ?? null;
}
