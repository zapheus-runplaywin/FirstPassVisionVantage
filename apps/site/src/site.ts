// The public pages for the app stores: privacy policy, support and
// delete-my-account. Their words are written once in the HQ repo
// (docs/store/public-pages/) and copied into content/ by
// scripts/sync-public-pages.sh; this file only lays them out.

import { escapeHtml, renderMarkdown } from './markdown.ts';

export interface PageSource {
  /** The address on the site, such as "privacy" for /privacy. */
  slug: string;
  /** The file in content/. */
  file: string;
  /** The short name in the site's navigation. */
  nav: string;
}

export const PAGES: readonly PageSource[] = [
  { slug: 'privacy', file: 'privacy.md', nav: 'Privacy' },
  { slug: 'support', file: 'support.md', nav: 'Support' },
  { slug: 'delete-account', file: 'delete-account.md', nav: 'Delete my account' },
];

/** Text that marks a page as not ready to publish. */
export const PLACEHOLDER_MARK = 'PLACEHOLDER: not for publishing';

/**
 * Nothing on the site runs a script or loads anything from another address.
 * The pages are plain text, so the policy can be this strict.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src 'self'",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const STYLE = `
:root {
  color-scheme: light dark;
  --surface: #FFFFFF;
  --surface-soft: #F8FAFC;
  --ink: #0F172A;
  --ink-muted: #475569;
  --link: #2274A5;
  --rule: #E2E8F0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #0F172A;
    --surface-soft: #1E293B;
    --ink: #FFFFFF;
    --ink-muted: #CBD5E1;
    --link: #7DB9DF;
    --rule: #334155;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font: 16px/24px "Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
header, main, footer { max-width: 720px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 24px; padding-bottom: 8px; }
.logo { display: inline-block; }
.logo img { width: 200px; height: auto; display: block; }
.logo .dark { display: none; }
@media (prefers-color-scheme: dark) {
  .logo .light { display: none; }
  .logo .dark { display: block; }
}
nav { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px 20px; }
nav a { color: var(--ink-muted); font-weight: 800; text-decoration: none; padding: 8px 0; }
nav a[aria-current="page"] { color: var(--ink); border-bottom: 3px solid #F75C03; }
main { padding-bottom: 48px; }
h1 { font-size: 32px; line-height: 38px; font-weight: 800; margin: 24px 0 16px; }
h2 { font-size: 22px; line-height: 28px; font-weight: 800; margin: 32px 0 8px; }
h3, h4 { font-size: 18px; line-height: 24px; font-weight: 800; margin: 24px 0 8px; }
p, ul, ol { margin: 0 0 16px; }
li { margin-bottom: 6px; }
a { color: var(--link); }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14px; background: var(--surface-soft); padding: 1px 4px; border-radius: 4px; }
.updated { color: var(--ink-muted); font-size: 14px; }
footer { border-top: 1px solid var(--rule); padding-top: 16px; padding-bottom: 32px; color: var(--ink-muted); font-size: 14px; }
`;

interface LayoutOptions {
  title: string;
  description: string;
  body: string;
  current: string | null;
}

export function layout({ title, description, body, current }: LayoutOptions): string {
  const nav = PAGES.map((page) => {
    const attr = page.slug === current ? ' aria-current="page"' : '';
    return `<a href="/${page.slug}"${attr}>${escapeHtml(page.nav)}</a>`;
  }).join('');
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
<meta name="referrer" content="no-referrer">
<meta name="description" content="${escapeHtml(description)}">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<header>
<a class="logo" href="/"><img class="light" src="/firstpass-hq-light.svg" alt="FirstPass HQ" width="200" height="31"><img class="dark" src="/firstpass-hq-dark.svg" alt="FirstPass HQ" width="200" height="31"></a>
<nav aria-label="Pages">${nav}</nav>
</header>
<main>
${body}
</main>
<footer>FirstPass HQ is a club administration app for netball clubs.</footer>
</body>
</html>
`;
}

export interface BuiltFile {
  path: string;
  contents: string;
}

/** Every page of the site, from the Markdown in content/. */
export function buildSite(read: (file: string) => string): BuiltFile[] {
  const files: BuiltFile[] = [];
  const titles: { slug: string; title: string }[] = [];

  for (const page of PAGES) {
    const rendered = renderMarkdown(read(page.file));
    titles.push({ slug: page.slug, title: rendered.title });
    files.push({
      path: `${page.slug}.html`,
      contents: layout({
        title: `${rendered.title} · FirstPass HQ`,
        description: `${rendered.title} for the FirstPass HQ app.`,
        body: `<h1>${escapeHtml(rendered.title)}</h1>\n${rendered.html}`,
        current: page.slug,
      }),
    });
  }

  const links = titles
    .map(({ slug, title }) => `<li><a href="/${slug}">${escapeHtml(title)}</a></li>`)
    .join('');
  files.unshift({
    path: 'index.html',
    contents: layout({
      title: 'FirstPass HQ',
      description: 'Privacy, support and account deletion for the FirstPass HQ app.',
      body: `<h1>FirstPass HQ</h1>\n<p>FirstPass HQ is a club administration app for netball clubs. These pages are for members and for the app stores.</p>\n<ul>${links}</ul>`,
      current: null,
    }),
  });
  files.push({
    path: '+not-found.html',
    contents: layout({
      title: 'Page not found · FirstPass HQ',
      description: 'Page not found.',
      body: `<h1>Page not found</h1>\n<p>There's no page at this address.</p>\n<ul>${links}</ul>`,
      current: null,
    }),
  });
  return files;
}

/**
 * A blank the HQ draft leaves for an answer, such as [SUPPORT EMAIL]: capitals
 * in square brackets that aren't the text of a link.
 */
export const BLANK = /\[[A-Z][A-Z0-9 ]*\](?!\()/;

/** The pages that still carry the placeholder mark or a blank. */
export function placeholderPages(read: (file: string) => string): string[] {
  return PAGES.filter((page) => {
    const text = read(page.file);
    return text.includes(PLACEHOLDER_MARK) || BLANK.test(text);
  }).map((page) => page.file);
}
