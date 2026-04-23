'use client';

import { useMemo } from 'react';

/**
 * Tiny markdown renderer for narrative content. Supports:
 * headings, bold, italic, inline code, fenced code, lists, tables, links,
 * paragraphs. Avoids pulling in a full markdown lib so the bundle stays small.
 */
export default function MarkdownView({ content }: { content: string }) {
  const html = useMemo(() => render(content), [content]);
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] dark:prose-code:bg-slate-800 prose-table:text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function render(input: string): string {
  const lines = input.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  let table: string[] | null = null;

  const flushTable = () => {
    if (!table) return;
    const rows = table.map((r) => r.trim()).filter((r) => r.startsWith('|'));
    const parsed = rows.map((r) =>
      r
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    );
    if (parsed.length >= 2) {
      const header = parsed[0]!;
      const body = parsed.slice(2);
      out.push('<table>');
      out.push(
        '<thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead>',
      );
      out.push('<tbody>');
      for (const r of body)
        out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
    }
    table = null;
  };

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      flushTable();
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(raw));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(raw)) {
      table ??= [];
      table.push(raw);
      continue;
    } else if (table) {
      flushTable();
    }
    if (/^\s*[-*]\s+/.test(raw)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(raw.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    const h = /^(#{1,6})\s+(.+)$/.exec(raw);
    if (h) {
      const lvl = Math.min(6, h[1]!.length + 2);
      out.push(`<h${lvl}>${inline(h[2]!)}</h${lvl}>`);
      continue;
    }
    if (raw.trim() === '') out.push('');
    else out.push(`<p>${inline(raw)}</p>`);
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</code></pre>');
  flushTable();
  return out.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    );
}
