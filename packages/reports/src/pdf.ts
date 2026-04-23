import type { HtmlReportInput } from './html.js';
import { renderHtml } from './html.js';

export interface PdfOptions {
  /** Print background colors (default true). */
  printBackground?: boolean;
  /** Page format. Defaults to A4. */
  format?: 'A4' | 'Letter' | 'Legal';
  /** Margins. */
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
}

/**
 * Renders the report as a PDF Buffer using Playwright.
 *
 * Playwright is loaded **lazily** (require at call time) so that the package
 * stays usable for HTML/MD/JSON consumers (CLI, web JSON API) without paying
 * the chromium install cost.
 *
 * If chromium is not installed, the error message tells the user to run
 * `npx playwright install chromium`.
 */
export async function renderPdf(
  input: HtmlReportInput,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'PDF export requires the `playwright` package. Install it with ' +
        '`pnpm --filter @lynsight/web add playwright` (or add it where you call renderPdf), ' +
        'then run `npx playwright install chromium`.',
    );
  }

  const html = renderHtml({ ...input, printMode: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.format ?? 'A4',
      printBackground: options.printBackground ?? true,
      margin: {
        top: options.margin?.top ?? '12mm',
        bottom: options.margin?.bottom ?? '12mm',
        left: options.margin?.left ?? '12mm',
        right: options.margin?.right ?? '12mm',
      },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
