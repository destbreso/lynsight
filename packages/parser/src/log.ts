/**
 * Lightweight scanner over `lynis.log`. We use it as a fallback when the
 * `lynis-report.dat` is missing or to enrich findings with extra context
 * (the log frequently contains test result lines like "Result: ...").
 */
export interface LogScanResult {
  /** Map test id -> last "Result" line emitted for it. */
  resultsByTestId: Map<string, string>;
  warningCount: number;
  suggestionCount: number;
}

export function scanLog(content: string): LogScanResult {
  const resultsByTestId = new Map<string, string>();
  let warningCount = 0;
  let suggestionCount = 0;

  // Lines look like:
  //   2024-01-01 00:00:00 Performing test ID SSH-7408 (...)
  //   2024-01-01 00:00:00 Result: ...
  //   2024-01-01 00:00:00 Warning: blah [test:KRNL-5820]
  //   2024-01-01 00:00:00 Suggestion: blah [test:BOOT-5122]
  let currentTestId: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const testMatch = line.match(/Performing test ID\s+([A-Z]+-\d+)/);
    if (testMatch) {
      currentTestId = testMatch[1] ?? null;
      continue;
    }

    if (currentTestId && /^\d{4}-\d{2}-\d{2}.*?Result:/.test(line)) {
      const idx = line.indexOf('Result:');
      if (idx !== -1) {
        resultsByTestId.set(currentTestId, line.slice(idx + 'Result:'.length).trim());
      }
    }

    if (/Warning:/.test(line)) warningCount++;
    if (/Suggestion:/.test(line)) suggestionCount++;
  }

  return { resultsByTestId, warningCount, suggestionCount };
}
