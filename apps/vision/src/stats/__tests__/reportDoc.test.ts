import { describe, expect, it } from 'vitest';
import type { GameReport } from '../report';
import { REPORT_NOTE, escapeHtml, reportHtml, reportText, reportTitle, type ReportHeading } from '../reportDoc';

/*
 * The report to keep: the text and the printable page hold what the screen's
 * tables hold, both carry the note about naming players, and a name can never
 * be read as markup.
 */

const heading: ReportHeading = { us: 'Hawks', them: 'Kestrels', score: { us: 44, them: 47 }, label: 'Full time', teamName: '17 & Under', date: 'Sat 21 Nov 2026' };
const report: GameReport = {
  tables: [
    { title: 'By quarter', head: ['Qtr', 'Score', 'Shooting'], rows: [['Q1', '13–10', '72%'], ['Game', '44–47', '77%']], empty: 'No quarters played yet.' },
    { title: 'Shooters', head: ['Shooter', 'Goals', '%'], rows: [['7 Priya (GS)', '34 of 41', '83%']], empty: 'No shots recorded.' },
    { title: 'Rebounds', head: ['', 'Offensive', 'Defensive'], rows: [], empty: 'No rebounds recorded.' },
  ],
  unforcedByThird: 'attack 3 · centre 5',
};

describe('reportTitle', () => {
  it('is the two teams and the score', () => {
    expect(reportTitle(heading)).toBe('Hawks 44 – 47 Kestrels');
  });
});

describe('reportText', () => {
  const text = reportText(heading, report);

  it('opens with the score, then the stage, team and date', () => {
    expect(text.split('\n').slice(0, 2)).toEqual(['Hawks 44 – 47 Kestrels', 'Full time · 17 & Under · Sat 21 Nov 2026']);
  });

  it('lines the columns up', () => {
    expect(text).toContain(['Qtr   Score  Shooting', 'Q1    13–10       72%', 'Game  44–47       77%'].join('\n'));
  });

  it('says so in words where a table is empty, and keeps the thirds line', () => {
    expect(text).toContain('REBOUNDS\nNo rebounds recorded.');
    expect(text).toContain('UNFORCED TURNOVERS BY THIRD\nattack 3 · centre 5');
  });

  it('carries the note about naming players', () => {
    expect(text).toContain(REPORT_NOTE);
  });

  it('leaves out the team when it is not known', () => {
    expect(reportText({ ...heading, teamName: null }, report).split('\n')[1]).toBe('Full time · Sat 21 Nov 2026');
  });
});

describe('reportHtml', () => {
  const html = reportHtml(heading, report);

  it('holds every cell of every table, with the Game row marked', () => {
    for (const t of report.tables) for (const r of t.rows) for (const c of r) expect(html).toContain(escapeHtml(c));
    expect(html).toContain('<tr class="total"><td>Game</td>');
    expect(html).toContain('No rebounds recorded.');
    expect(html).toContain('attack 3 · centre 5');
  });

  it('carries the title, the team (escaped) and the note about naming players', () => {
    expect(html).toContain('<title>Hawks 44 – 47 Kestrels</title>');
    expect(html).toContain('17 &amp; Under');
    expect(html).toContain(REPORT_NOTE);
  });

  it('never lets a name be read as markup, and loads nothing from anywhere', () => {
    const nasty: GameReport = { tables: [{ title: 'Shooters', head: ['Shooter'], rows: [['<img src=x onerror=alert(1)>']], empty: '' }], unforcedByThird: '' };
    const page = reportHtml({ ...heading, us: '<script>alert(1)</script>', them: '"Storm"' }, nasty);
    expect(page).not.toContain('<script');
    expect(page).not.toContain('<img');
    expect(page).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(page).toContain('&quot;Storm&quot;');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
