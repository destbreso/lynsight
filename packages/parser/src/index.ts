import { ExtractedArchive, openArchive, readFirstMatch } from './archive.js';
import { scanLog } from './log.js';
import { parseReportDat } from './report-dat.js';
import { ParsedReport } from './types.js';

export * from './types.js';
export { openArchive } from './archive.js';
export type { ExtractedArchive } from './archive.js';
export { buildFileTree } from './tree.js';
export type { FileNode } from './tree.js';

export interface ParseOptions {
  /**
   * If true, the temporary extraction directory is kept after parsing. Useful
   * when the caller needs to reference the original log file afterwards.
   */
  keepExtracted?: boolean;
}

/**
 * Parses a Lynis audit bundle (a `.tar.gz`, a `.tgz`, or a directory) into a
 * normalized `ParsedReport`. The bundle must contain at least one of:
 *   - lynis-report.dat (preferred)
 *   - lynis.log
 */
export async function parseAudit(input: string, _options: ParseOptions = {}): Promise<ParsedReport> {
  const archive = await openArchive(input);
  return parseExtractedArchive(archive);
}

/**
 * Same as `parseAudit` but starts from an already-opened archive. Use this
 * when the caller wants to retain the extracted directory (for example to
 * serve its files over HTTP for the file explorer panel).
 */
export async function parseExtractedArchive(archive: ExtractedArchive): Promise<ParsedReport> {
  const reportFile = await readFirstMatch(archive, [
    'lynis-report.dat',
    'report.dat',
  ]);
  const logFile = await readFirstMatch(archive, ['lynis.log']);

  if (!reportFile && !logFile) {
    throw new Error(
      'Lynis audit bundle is missing both lynis-report.dat and lynis.log. ' +
        'Make sure the tar.gz contains at least one of them.',
    );
  }

  if (!reportFile) {
    // Minimal report from the log only.
    const log = scanLog(logFile!.content);
    return {
      meta: {
        reportVersion: null,
        lynisVersion: null,
        reportDatetimeStart: null,
        reportDatetimeEnd: null,
        auditorName: null,
        pluginsEnabled: [],
        testsExecuted: null,
        testsSkipped: null,
      },
      system: {
        hostname: null,
        domainname: null,
        os: null,
        osVersion: null,
        osFullName: null,
        kernelVersion: null,
        cpuModel: null,
        uptime: null,
      },
      hardeningIndex: null,
      findings: [],
      strengths: [],
      raw: {
        _logWarnings: String(log.warningCount),
        _logSuggestions: String(log.suggestionCount),
      },
    };
  }

  const parsed = parseReportDat(reportFile.content);

  // If we also have the log, enrich findings with their last "Result:" line.
  if (logFile) {
    const log = scanLog(logFile.content);
    for (const f of parsed.findings) {
      const result = log.resultsByTestId.get(f.id);
      if (result && !f.details) f.details = result;
    }
  }

  return parsed;
}
