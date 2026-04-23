#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import kleur from 'kleur';
import { parseAudit } from '@lynsight/parser';
import { analyze } from '@lynsight/core';
import { createProvider, enrichReport, type ProviderKind } from '@lynsight/llm';
import { renderHtml, renderJson, renderMarkdown, renderPdf } from '@lynsight/reports';

const program = new Command();

program
  .name('lynsight')
  .description('Open-source Lynis audit reporter with optional LLM enrichment.')
  .version('0.1.0');

program
  .command('scan')
  .argument('<input>', 'Path to a Lynis audit .tar.gz, .tgz, or extracted directory')
  .option('-o, --out <dir>', 'Output directory for reports', './lynsight-out')
  .option('-f, --format <list>', 'Comma-separated formats: html,md,json,pdf', 'html,md,json')
  .option('--llm', 'Enable LLM enrichment (requires --provider/--model)')
  .option('--provider <kind>', 'LLM provider: ollama|openai|openai-compatible|anthropic', 'ollama')
  .option('--model <name>', 'Model id (e.g. llama3.1:8b, gpt-4o-mini)', 'llama3.1:8b')
  .option('--base-url <url>', 'Override provider base URL')
  .option('--api-key <key>', 'API key (env: LYNSIGHT_API_KEY)')
  .option('--language <lang>', 'Output language for the LLM (e.g. es, en, pt)', 'en')
  .option('--audience <text>', 'Audience hint for the LLM', 'mixed (engineers + management)')
  .option('--top <n>', 'How many top findings to enrich', '10')
  .option('--concurrency <n>', 'Parallel LLM calls', '2')
  .option('--stream', 'Stream LLM tokens to stdout (debugging).')
  .description('Parse a Lynis audit and emit reports.')
  .action(async (input: string, opts: ScanOpts) => {
    const t0 = Date.now();
    info(`📦 Parsing ${kleur.bold(input)}…`);
    const report = await parseAudit(resolve(input));
    info(
      `   ✓ ${report.findings.length} findings · ${report.strengths.length} strengths · hardening_index=${report.hardeningIndex ?? '—'}`,
    );

    info('🧮 Scoring & prioritizing…');
    const analyzed = analyze(report);
    info(
      `   ✓ grade ${kleur.bold(analyzed.summary.grade)} · risk ${analyzed.summary.riskScore}/100 · ${analyzed.summary.strengthsPointsAwarded}${analyzed.summary.strengthsPointsMax ? `/${analyzed.summary.strengthsPointsMax}` : ''} hardening pts`,
    );

    let enriched;
    if (opts.llm) {
      const provider = createProvider({
        provider: opts.provider as ProviderKind,
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey ?? process.env['LYNSIGHT_API_KEY'],
        model: opts.model,
      });
      info(`🤖 LLM enrichment via ${kleur.bold(provider.name)}…`);
      enriched = await enrichReport(provider, analyzed, {
        language: opts.language,
        audience: opts.audience,
        topFindings: Number.parseInt(opts.top, 10),
        concurrency: Number.parseInt(opts.concurrency, 10),
        onProgress: (e) => {
          if (e.type === 'section_start') process.stdout.write(kleur.gray(`\n  ┌ ${e.name}…`));
          else if (e.type === 'section_chunk' && opts.stream)
            process.stdout.write(kleur.dim(e.delta));
          else if (e.type === 'section_done')
            process.stdout.write(kleur.green(` ✓ (${(e.ms / 1000).toFixed(1)}s)`));
          else if (e.type === 'section_error') process.stdout.write(kleur.red(` ✗ ${e.error}`));
          else if (e.type === 'finding_done') process.stdout.write(kleur.cyan('.'));
          else if (e.type === 'finding_error') process.stdout.write(kleur.red('!'));
        },
      });
      process.stdout.write('\n');
      info(
        `   ✓ ${enriched.meta.enrichedCount} enriched · ${enriched.meta.skippedCount} skipped · ${
          Object.values(enriched.narratives).filter(Boolean).length
        } narrative sections`,
      );
      if (enriched.meta.errors.length) {
        warn(`   ⚠ ${enriched.meta.errors.length} LLM errors`);
        for (const e of enriched.meta.errors) warn(`     • ${e}`);
      }
    }

    const outDir = resolve(opts.out);
    await mkdir(outDir, { recursive: true });
    const formats = new Set(opts.format.split(',').map((s) => s.trim().toLowerCase()));

    if (formats.has('html')) {
      await writeFile(join(outDir, 'report.html'), renderHtml({ analyzed, enriched }), 'utf8');
      ok(`   → ${join(outDir, 'report.html')}`);
    }
    if (formats.has('md') || formats.has('markdown')) {
      await writeFile(join(outDir, 'report.md'), renderMarkdown(analyzed, enriched), 'utf8');
      ok(`   → ${join(outDir, 'report.md')}`);
    }
    if (formats.has('json')) {
      await writeFile(join(outDir, 'report.json'), renderJson(analyzed, enriched), 'utf8');
      ok(`   → ${join(outDir, 'report.json')}`);
    }
    if (formats.has('pdf')) {
      info('📄 Rendering PDF (Playwright)…');
      const pdf = await renderPdf({ analyzed, enriched });
      await writeFile(join(outDir, 'report.pdf'), pdf);
      ok(`   → ${join(outDir, 'report.pdf')}`);
    }

    info(`✨ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });

program
  .command('ping')
  .description('Check connectivity to an LLM provider.')
  .option('--provider <kind>', 'ollama|openai|openai-compatible|anthropic', 'ollama')
  .option('--model <name>', 'Model id', 'llama3.1:8b')
  .option('--base-url <url>', 'Override provider base URL')
  .option('--api-key <key>', 'API key')
  .action(async (opts: PingOpts) => {
    const provider = createProvider({
      provider: opts.provider as ProviderKind,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey ?? process.env['LYNSIGHT_API_KEY'],
      model: opts.model,
      timeoutMs: 5_000,
    });
    const result = await provider.ping();
    if (result.ok) {
      ok(`✓ ${provider.name} reachable in ${result.latencyMs}ms`);
      if (result.modelCount !== undefined) info(`  ${result.modelCount} models available`);
      if (result.modelAvailable === false) warn(`  ⚠ requested model "${opts.model}" not found`);
      if (result.serverInfo) info(`  ${result.serverInfo}`);
    } else {
      err(`✗ ${provider.name} unreachable: ${result.error ?? 'unknown error'}`);
      process.exit(1);
    }
  });

program
  .command('models')
  .description('List models available on a provider.')
  .option('--provider <kind>', 'ollama|openai|openai-compatible|anthropic', 'ollama')
  .option('--base-url <url>', 'Override provider base URL')
  .option('--api-key <key>', 'API key')
  .action(async (opts: ModelsOpts) => {
    const provider = createProvider({
      provider: opts.provider as ProviderKind,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey ?? process.env['LYNSIGHT_API_KEY'],
      model: '',
      timeoutMs: 5_000,
    });
    const models = await provider.listModels();
    if (!models.length) {
      warn('No models found.');
      return;
    }
    info(`${models.length} model(s) on ${kleur.bold(provider.name)}:`);
    for (const m of models) {
      const size = m.sizeBytes ? kleur.gray(` (${formatBytes(m.sizeBytes)})`) : '';
      console.log(`  • ${m.id}${size}`);
    }
  });

program.parseAsync().catch((e: unknown) => {
  err(`✗ ${(e as Error).message}`);
  process.exit(1);
});

interface ScanOpts {
  out: string;
  format: string;
  llm?: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  language: string;
  audience: string;
  top: string;
  concurrency: string;
  stream?: boolean;
}

interface PingOpts {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

interface ModelsOpts {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
}

function info(msg: string) {
  console.log(kleur.cyan(msg));
}
function ok(msg: string) {
  console.log(kleur.green(msg));
}
function warn(msg: string) {
  console.log(kleur.yellow(msg));
}
function err(msg: string) {
  console.error(kleur.red(msg));
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
