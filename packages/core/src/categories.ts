/**
 * Maps a Lynis test ID prefix (e.g. "SSH", "KRNL") to a human-readable
 * category and a CIS-ish security domain. Used for grouping in reports.
 *
 * Reference: https://cisofy.com/lynis/controls/
 * Not exhaustive — unknown prefixes fall back to "Other".
 */
export interface CategoryInfo {
  /** Stable machine id, e.g. "ssh". */
  id: string;
  /** Display label, e.g. "SSH". */
  label: string;
  /** High-level security domain. */
  domain:
    | 'authentication'
    | 'network'
    | 'kernel'
    | 'filesystem'
    | 'logging'
    | 'malware'
    | 'crypto'
    | 'boot'
    | 'hardening'
    | 'software'
    | 'time'
    | 'other';
  /** A muted indicator color (used by HTML reports, Tailwind tokens). */
  color: string;
}

const TABLE: Record<string, Omit<CategoryInfo, 'id'>> = {
  ACCT: { label: 'Accounting', domain: 'logging', color: '#a78bfa' },
  AUTH: { label: 'Authentication', domain: 'authentication', color: '#f59e0b' },
  BANN: { label: 'Banners', domain: 'hardening', color: '#94a3b8' },
  BOOT: { label: 'Boot & services', domain: 'boot', color: '#fb7185' },
  CONT: { label: 'Containers', domain: 'hardening', color: '#22d3ee' },
  CRYP: { label: 'Cryptography', domain: 'crypto', color: '#10b981' },
  CUST: { label: 'Custom tests', domain: 'other', color: '#94a3b8' },
  DBS: { label: 'Databases', domain: 'software', color: '#0ea5e9' },
  DEB: { label: 'Debian/Ubuntu', domain: 'software', color: '#0ea5e9' },
  FILE: { label: 'Filesystems', domain: 'filesystem', color: '#3b82f6' },
  FINT: { label: 'File integrity', domain: 'filesystem', color: '#3b82f6' },
  FIRE: { label: 'Firewalls', domain: 'network', color: '#ef4444' },
  HRDN: { label: 'Hardening', domain: 'hardening', color: '#9333ea' },
  HOME: { label: 'Home directories', domain: 'filesystem', color: '#3b82f6' },
  HTTP: { label: 'HTTP services', domain: 'network', color: '#ef4444' },
  INSE: { label: 'Insecure services', domain: 'network', color: '#ef4444' },
  KRNL: { label: 'Kernel', domain: 'kernel', color: '#ec4899' },
  LDAP: { label: 'LDAP', domain: 'authentication', color: '#f59e0b' },
  LOGG: { label: 'Logging & auditing', domain: 'logging', color: '#a78bfa' },
  MACF: { label: 'MAC frameworks', domain: 'hardening', color: '#9333ea' },
  MAIL: { label: 'Mail services', domain: 'network', color: '#ef4444' },
  MALW: { label: 'Malware', domain: 'malware', color: '#dc2626' },
  NAME: { label: 'Name services', domain: 'network', color: '#ef4444' },
  NETW: { label: 'Networking', domain: 'network', color: '#ef4444' },
  NFS: { label: 'NFS', domain: 'network', color: '#ef4444' },
  PHP: { label: 'PHP', domain: 'software', color: '#0ea5e9' },
  PKGS: { label: 'Packages', domain: 'software', color: '#0ea5e9' },
  PROC: { label: 'Processes', domain: 'kernel', color: '#ec4899' },
  RPCS: { label: 'RPC services', domain: 'network', color: '#ef4444' },
  SCHD: { label: 'Scheduling', domain: 'other', color: '#94a3b8' },
  SHEL: { label: 'Shells', domain: 'authentication', color: '#f59e0b' },
  SQD: { label: 'Squid', domain: 'network', color: '#ef4444' },
  SSH: { label: 'SSH', domain: 'network', color: '#ef4444' },
  STRG: { label: 'Storage', domain: 'filesystem', color: '#3b82f6' },
  TIME: { label: 'Time & sync', domain: 'time', color: '#14b8a6' },
  TOOL: { label: 'Tooling', domain: 'other', color: '#94a3b8' },
  USB: { label: 'USB devices', domain: 'hardening', color: '#9333ea' },
  VIRT: { label: 'Virtualization', domain: 'hardening', color: '#9333ea' },
  WRDP: { label: 'WordPress', domain: 'software', color: '#0ea5e9' },
};

export function categoryFor(prefix: string): CategoryInfo {
  const key = prefix.toUpperCase();
  const entry = TABLE[key];
  if (entry) return { id: key.toLowerCase(), ...entry };
  return { id: key.toLowerCase(), label: key, domain: 'other', color: '#94a3b8' };
}
