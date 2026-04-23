import { z } from 'zod';

/** Severity levels normalized across Lynis "warnings" and "suggestions". */
export const Severity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

/**
 * Lynis emits two arrays in lynis-report.dat:
 *   warning[]=TEST-ID|description|details|solution
 *   suggestion[]=TEST-ID|description|details|solution
 *
 * We normalize both into a single "Finding" with a kind and severity.
 */
export const FindingKind = {
  WARNING: 'warning',
  SUGGESTION: 'suggestion',
} as const;
export type FindingKind = (typeof FindingKind)[keyof typeof FindingKind];

export const findingSchema = z.object({
  id: z.string(), // e.g. "SSH-7408"
  kind: z.enum([FindingKind.WARNING, FindingKind.SUGGESTION]),
  description: z.string(),
  details: z.string().nullable(),
  solution: z.string().nullable(),
  /** Category derived from the test ID prefix (e.g. SSH, KRNL, BOOT). */
  category: z.string(),
  /** Severity assigned by the core scoring layer. */
  severity: z.enum([
    Severity.CRITICAL,
    Severity.HIGH,
    Severity.MEDIUM,
    Severity.LOW,
    Severity.INFO,
  ]),
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * A "strength" is a Lynis test that **passed**: the corresponding hardening
 * control is in place. We surface these so reports can show that hardening
 * actions executed previously are still in effect, not just what is missing.
 *
 * Source: `hardening[]` lines in `lynis-report.dat` follow the format
 * `TEST-ID|points_awarded|max_points`. A test that awarded > 0 points is
 * considered a strength.
 */
export const strengthSchema = z.object({
  id: z.string(), // e.g. "FILE-6310"
  category: z.string(),
  /** Points awarded by Lynis for this control. */
  pointsAwarded: z.number(),
  /** Maximum points the control could award. */
  pointsMax: z.number(),
  /** Optional human-readable description if Lynis emitted one in `details[]`. */
  description: z.string().nullable(),
});
export type Strength = z.infer<typeof strengthSchema>;

export const systemInfoSchema = z.object({
  hostname: z.string().nullable(),
  domainname: z.string().nullable(),
  os: z.string().nullable(),
  osVersion: z.string().nullable(),
  osFullName: z.string().nullable(),
  kernelVersion: z.string().nullable(),
  cpuModel: z.string().nullable(),
  uptime: z.string().nullable(),
});
export type SystemInfo = z.infer<typeof systemInfoSchema>;

export const lynisMetaSchema = z.object({
  reportVersion: z.string().nullable(),
  lynisVersion: z.string().nullable(),
  reportDatetimeStart: z.string().nullable(),
  reportDatetimeEnd: z.string().nullable(),
  auditorName: z.string().nullable(),
  pluginsEnabled: z.array(z.string()),
  testsExecuted: z.number().nullable(),
  testsSkipped: z.number().nullable(),
});
export type LynisMeta = z.infer<typeof lynisMetaSchema>;

export const parsedReportSchema = z.object({
  meta: lynisMetaSchema,
  system: systemInfoSchema,
  /** Lynis "hardening_index" (0-100). */
  hardeningIndex: z.number().nullable(),
  findings: z.array(findingSchema),
  /** Tests that passed and earned hardening points. */
  strengths: z.array(strengthSchema),
  /** Raw key/value pairs we did not model explicitly. Useful for power users. */
  raw: z.record(z.union([z.string(), z.array(z.string())])),
});
export type ParsedReport = z.infer<typeof parsedReportSchema>;
