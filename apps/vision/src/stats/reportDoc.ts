import type { GameReport } from './report';

/*
 * The game report as something to keep: plain text for a phone's share sheet,
 * and a page of its own for a browser to print or save as a PDF. Both are
 * made from the same tables the screen shows. Nothing here touches the
 * browser or the phone, so it can be tested.
 */

export interface ReportHeading {
  us: string;
  them: string;
  score: { us: number; them: number };
  /** "Full time", "Q3" and so on. */
  label: string;
  /** The team the game was recorded for, when known, such as "17 & Under". */
  teamName: string | null;
  /** The day the game was played, already written out, such as "Sat 21 Nov 2026". */
  date: string;
}

/** Who the report is for. It names players, so it says so on every copy. */
export const REPORT_NOTE = 'For the coaching team. This report names players: keep it within the team and do not post it publicly.';

export function reportTitle(h: ReportHeading): string {
  return `${h.us} ${h.score.us} – ${h.score.them} ${h.them}`;
}

function subtitle(h: ReportHeading): string {
  return [h.label, h.teamName, h.date].filter(Boolean).join(' · ');
}

/** The report as plain text, columns lined up with spaces. */
export function reportText(h: ReportHeading, report: GameReport): string {
  const out: string[] = [reportTitle(h), subtitle(h), ''];
  for (const t of report.tables) {
    out.push(t.title.toUpperCase());
    if (t.rows.length === 0) {
      out.push(t.empty, '');
      continue;
    }
    const all = [t.head, ...t.rows];
    const widths = t.head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
    for (const r of all) {
      out.push(
        r
          .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
          .join('  ')
          .trimEnd(),
      );
    }
    out.push('');
  }
  if (report.unforcedByThird) out.push('UNFORCED TURNOVERS BY THIRD', report.unforcedByThird, '');
  out.push(REPORT_NOTE, 'FirstPass Vision');
  return out.join('\n');
}

/** Makes text safe to put in a page: a player's name is never read as markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The report as a page of its own, black on white, for printing or saving as a PDF. */
export function reportHtml(h: ReportHeading, report: GameReport): string {
  const e = escapeHtml;
  const tables = report.tables
    .map((t) => {
      if (t.rows.length === 0) return `<h2>${e(t.title)}</h2><p class="muted">${e(t.empty)}</p>`;
      const head = t.head.map((c, i) => `<th${i ? ' class="n"' : ''}>${e(c)}</th>`).join('');
      const rows = t.rows
        .map((r) => `<tr${t.title === 'By quarter' && r[0] === 'Game' ? ' class="total"' : ''}>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${e(c)}</td>`).join('')}</tr>`)
        .join('');
      return `<h2>${e(t.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');
  const thirds = report.unforcedByThird ? `<h2>Unforced turnovers by third</h2><p>${e(report.unforcedByThird)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(reportTitle(h))}</title>
<style>
  @page { margin: 16mm; }
  body { font: 11pt/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; margin: 0; }
  h1 { font-size: 20pt; margin: 0; }
  .sub { color: #475569; margin: 2pt 0 14pt; }
  h2 { font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: #475569; margin: 16pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
  th, td { text-align: left; padding: 4pt 6pt 4pt 0; border-bottom: 0.5pt solid #cbd5e1; font-variant-numeric: tabular-nums; }
  th { font-size: 9pt; color: #475569; }
  .n { text-align: right; padding-right: 0; padding-left: 6pt; }
  .total td { font-weight: 700; }
  .muted { color: #475569; }
  .note { margin-top: 18pt; font-size: 9pt; color: #475569; }
</style>
</head>
<body>
<h1>${e(reportTitle(h))}</h1>
<p class="sub">${e(subtitle(h))}</p>
${tables}${thirds}
<p class="note">${e(REPORT_NOTE)}<br>FirstPass Vision</p>
</body>
</html>`;
}
