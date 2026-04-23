import type { Finding, FileNode } from '@lynsight/parser';

/**
 * Maps each finding to a list of files inside the audit bundle that are
 * relevant to it. The mapping is deterministic and based on the Lynis test ID
 * prefix (the part before the first dash) plus a few well-known specific IDs.
 *
 * The result only contains files that actually exist in the bundle, so the UI
 * never offers broken links.
 */
export function buildRelatedFilesIndex(
  findings: Finding[],
  tree: FileNode,
): Record<string, string[]> {
  const allPaths = flatten(tree);
  const index: Record<string, string[]> = {};
  for (const f of findings) {
    const candidates = candidatesFor(f);
    const matched = uniq(candidates.flatMap((c) => resolveCandidate(c, allPaths)));
    if (matched.length > 0) index[f.id] = matched;
  }
  return index;
}

interface Candidate {
  /** Either an exact relative path or a prefix to match by `startsWith`. */
  match: string;
  kind: 'exact' | 'prefix' | 'glob-suffix';
}

function candidatesFor(f: Finding): Candidate[] {
  const cat = f.category.toUpperCase();
  const id = f.id.toUpperCase();
  const out: Candidate[] = [];

  // Always-relevant: the raw Lynis outputs.
  out.push({ match: 'lynis-report.dat', kind: 'exact' });
  out.push({ match: 'lynis.log', kind: 'exact' });

  switch (cat) {
    case 'SSH':
      out.push({ match: 'config-copies/ssh/', kind: 'prefix' });
      out.push({ match: 'logs/journal-ssh.txt', kind: 'exact' });
      out.push({ match: 'systemd/systemd-security-ssh.txt', kind: 'exact' });
      break;
    case 'AUTH':
    case 'ACCT':
      out.push({ match: 'config-copies/pam/', kind: 'prefix' });
      out.push({ match: 'config-copies/sudoers/', kind: 'prefix' });
      break;
    case 'KRNL':
      out.push({ match: 'meta/sysctl-all.txt', kind: 'exact' });
      out.push({ match: 'meta/uname.txt', kind: 'exact' });
      break;
    case 'NETW':
    case 'FIRE':
      out.push({ match: 'network/', kind: 'prefix' });
      out.push({ match: 'systemd/systemd-security-ufw.txt', kind: 'exact' });
      out.push({ match: 'logs/journal-ufw.txt', kind: 'exact' });
      break;
    case 'PKGS':
      out.push({ match: 'meta/packages.after.tsv', kind: 'exact' });
      out.push({ match: 'meta/packages.before.tsv', kind: 'exact' });
      out.push({ match: 'meta/packages.diff.txt', kind: 'exact' });
      out.push({ match: 'meta/apt-update.txt', kind: 'exact' });
      out.push({ match: 'meta/apt-install.txt', kind: 'exact' });
      break;
    case 'BOOT':
    case 'INIT':
      out.push({ match: 'systemd/', kind: 'prefix' });
      break;
    case 'LOGG':
      out.push({ match: 'logs/', kind: 'prefix' });
      break;
    case 'MALW':
    case 'HRDN':
      out.push({ match: 'meta/apparmor-status.txt', kind: 'exact' });
      out.push({ match: 'meta/apparmor-profiles.txt', kind: 'exact' });
      break;
    case 'CRON':
    case 'SCHD':
      out.push({ match: 'config-copies/cron/', kind: 'prefix' });
      out.push({ match: 'systemd/systemd-timers.txt', kind: 'exact' });
      break;
    case 'TIME':
      out.push({ match: 'meta/run-start.txt', kind: 'exact' });
      out.push({ match: 'meta/run-end.txt', kind: 'exact' });
      break;
    case 'PROC':
    case 'PRNT':
      out.push({ match: 'systemd/systemd-running.after.txt', kind: 'exact' });
      break;
    case 'NAME':
      out.push({ match: 'meta/hostname.txt', kind: 'exact' });
      out.push({ match: 'meta/hostnamectl.txt', kind: 'exact' });
      out.push({ match: 'meta/os-release.txt', kind: 'exact' });
      break;
  }

  // A few well-known per-test overrides.
  if (id === 'SSH-7408' || id.startsWith('SSH-')) {
    out.push({ match: 'sshd_config', kind: 'glob-suffix' });
  }
  if (id.startsWith('FIRE-') || id.startsWith('NETW-')) {
    out.push({ match: 'iptables-save.txt', kind: 'glob-suffix' });
    out.push({ match: 'nft-ruleset.txt', kind: 'glob-suffix' });
  }
  if (id.startsWith('LOGG-')) {
    out.push({ match: 'rsyslog', kind: 'glob-suffix' });
  }

  return out;
}

function resolveCandidate(c: Candidate, allPaths: string[]): string[] {
  if (c.kind === 'exact') {
    return allPaths.includes(c.match) ? [c.match] : [];
  }
  if (c.kind === 'prefix') {
    return allPaths.filter((p) => p.startsWith(c.match));
  }
  return allPaths.filter((p) => p.endsWith(c.match) || p.endsWith('/' + c.match));
}

function flatten(node: FileNode, acc: string[] = []): string[] {
  if (!node.isDir) {
    if (node.path) acc.push(node.path);
  } else if (node.children) {
    for (const c of node.children) flatten(c, acc);
  }
  return acc;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
