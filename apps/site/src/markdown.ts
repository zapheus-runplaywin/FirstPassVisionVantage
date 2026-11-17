// A small Markdown renderer for the public pages.
//
// It knows only what the pages use: headings, paragraphs, bullet and numbered
// lists, bold, italic, inline code and links. Every character of the source is
// escaped before any markup is added, so raw HTML in a page shows as text and
// can never add a script or a frame. Links may point only to https:, mailto:
// or a path on this site.

export class MarkdownError extends Error {}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Whether a link target is one the site may point to. */
export function isSafeHref(href: string): boolean {
  if (/^https:\/\/[^\s]+$/i.test(href)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return true;
  // A path on this site, such as /privacy or /privacy#contact. Not //host.
  return /^\/(?!\/)[A-Za-z0-9\-._~/#]*$/.test(href);
}

/** Inline markup: `code`, **bold**, *italic*, [text](href). Underscores stay as text. */
export function renderInline(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      out += `<code>${escapeHtml(code[1] ?? '')}</code>`;
      i += code[0].length;
      continue;
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = link[2] ?? '';
      if (!isSafeHref(href)) {
        throw new MarkdownError(`Link not allowed: ${href}`);
      }
      out += `<a href="${escapeHtml(href)}">${renderInline(link[1] ?? '')}</a>`;
      i += link[0].length;
      continue;
    }

    const bold = /^\*\*(.+?)\*\*/.exec(rest);
    if (bold) {
      out += `<strong>${renderInline(bold[1] ?? '')}</strong>`;
      i += bold[0].length;
      continue;
    }

    const italic = /^\*([^*\s][^*]*?)\*/.exec(rest);
    if (italic) {
      out += `<em>${renderInline(italic[1] ?? '')}</em>`;
      i += italic[0].length;
      continue;
    }

    out += escapeHtml(source[i] ?? '');
    i += 1;
  }
  return out;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface RenderedPage {
  /** The text of the page's one level-1 heading. */
  title: string;
  /** The page body, without the level-1 heading. */
  html: string;
  headings: Heading[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;

/**
 * Render a page. The source must start with exactly one "# Title" line, and
 * may not contain HTML comments, tables or code blocks, which the pages don't
 * use; finding one means the copy from HQ changed shape and needs a look.
 */
export function renderMarkdown(source: string): RenderedPage {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const headings: Heading[] = [];
  const usedIds = new Set<string>();
  let title: string | null = null;
  let paragraph: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      html.push(`<${list.kind}>${items}</${list.kind}>`);
      list = null;
    }
  };

  for (const [index, line] of lines.entries()) {
    const where = `line ${index + 1}`;
    if (/^\s*(```|~~~)/.test(line)) throw new MarkdownError(`Code blocks are not supported (${where})`);
    if (/^\s*\|/.test(line)) throw new MarkdownError(`Tables are not supported (${where})`);
    if (/^\s*<!--/.test(line)) throw new MarkdownError(`HTML comments are not supported (${where})`);

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = (heading[1] ?? '#').length;
      const text = heading[2] ?? '';
      if (level === 1) {
        if (title !== null) throw new MarkdownError(`A page has one "# " title (${where})`);
        if (html.length) throw new MarkdownError(`The "# " title comes first (${where})`);
        title = text;
        continue;
      }
      let id = slugify(text) || 'section';
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(text)}-${n}`;
      usedIds.add(id);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (list && list.kind !== kind) flushList();
      if (!list) list = { kind, items: [] };
      list.items.push(((bullet ?? numbered)?.[1] ?? '').trim());
      continue;
    }

    if (list && /^\s{2,}\S/.test(line)) {
      // A list item that wraps onto the next line.
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();

  if (title === null) throw new MarkdownError('A page starts with a "# " title');
  return { title, html: html.join('\n'), headings };
}
