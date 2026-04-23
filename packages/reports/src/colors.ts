import { Severity } from '@lynsight/parser';

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  info: '#94a3b8',
};

export const GRADE_COLORS: Record<'A' | 'B' | 'C' | 'D' | 'F', string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#eab308',
  D: '#f97316',
  F: '#dc2626',
};
