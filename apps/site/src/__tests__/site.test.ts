import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_SECURITY_POLICY, PAGES, PLACEHOLDER_MARK, buildSite, placeholderPages } from '../site.ts';

const sample: Record<string, string> = {
  'privacy.md': '# Privacy policy\n\nWe keep **little**. See [Support](/support).',
  'support.md': '# Support\n\nEmail [help@example.com](mailto:help@example.com).',
  'delete-account.md': '# Delete my account\n\n1. Open the app\n2. Tap Delete my account',
};
const read = (file: string) => {
  const text = sample[file];
  if (text === undefined) throw new Error(`no sample for ${file}`);
  return text;
};

describe('buildSite', () => {
  const files = buildSite(read);
  const byPath = new Map(files.map((f) => [f.path, f.contents]));

  it('makes a page for each store link, plus a home page and a not-found page', () => {
    // Expo Hosting serves /privacy from privacy.html, as for an Expo Router export.
    expect([...byPath.keys()].sort()).toEqual(
      ['+not-found.html', 'delete-account.html', 'index.html', 'privacy.html', 'support.html'].sort(),
    );
  });

  it('uses each page’s own title and marks it current in the navigation', () => {
    const privacy = byPath.get('privacy.html') ?? '';
    expect(privacy).toContain('<title>Privacy policy · FirstPass HQ</title>');
    expect(privacy).toContain('<h1>Privacy policy</h1>');
    expect(privacy).toContain('<a href="/privacy" aria-current="page">Privacy</a>');
    expect(privacy).toContain('<a href="/support">Support</a>');
  });

  it('renders the Markdown body', () => {
    expect(byPath.get('delete-account.html')).toContain('<ol><li>Open the app</li><li>Tap Delete my account</li></ol>');
    expect(byPath.get('support.html')).toContain('<a href="mailto:help@example.com">help@example.com</a>');
  });

  it('links every page from the home and not-found pages', () => {
    for (const path of ['index.html', '+not-found.html']) {
      for (const page of PAGES) expect(byPath.get(path)).toContain(`href="/${page.slug}"`);
    }
  });

  it.each(files.map((f) => [f.path, f.contents] as const))(
    '%s runs no script and loads nothing from another address',
    (_path, html) => {
      expect(html).not.toMatch(/<script|<iframe|<form|<object|<embed/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/(src|href)="(https?:)?\/\/(?!support\.google)/i);
      expect(html).toContain(`content="${CONTENT_SECURITY_POLICY}"`);
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(html).toContain('<html lang="en-AU">');
    },
  );

  it('keeps the content security policy closed to scripts, frames and other sites', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src|https?:|\*/);
  });

  it('shows a page’s HTML as text rather than running it', () => {
    const html = buildSite((file) =>
      file === 'support.md' ? '# Support\n\n<script>alert(1)</script>' : read(file),
    );
    const support = html.find((f) => f.path === 'support.html')?.contents ?? '';
    expect(support).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(support).not.toContain('<script>');
  });
});

describe('placeholderPages', () => {
  it('lists the pages that still hold placeholder text', () => {
    const withPlaceholder = (file: string) =>
      file === 'support.md' ? `# Support\n\n${PLACEHOLDER_MARK}.` : read(file);
    expect(placeholderPages(withPlaceholder)).toEqual(['support.md']);
    expect(placeholderPages(read)).toEqual([]);
  });

  it('lists the pages that still have a blank such as [SUPPORT EMAIL]', () => {
    const withBlank = (file: string) =>
      file === 'privacy.md' ? '# Privacy policy\n\nLast updated [DATE PUBLISHED].' : read(file);
    expect(placeholderPages(withBlank)).toEqual(['privacy.md']);
  });

  it('does not take a link in capitals for a blank', () => {
    const withLink = (file: string) =>
      file === 'support.md' ? '# Support\n\nSee [FAQ](/support#faq) and [OK].' : read(file);
    expect(placeholderPages(withLink)).toEqual(['support.md']);
    const linkOnly = (file: string) => (file === 'support.md' ? '# Support\n\nSee [FAQ](/support).' : read(file));
    expect(placeholderPages(linkOnly)).toEqual([]);
  });
});

describe('the pages in content/', () => {
  const contentDir = join(__dirname, '..', '..', 'content');
  const readContent = (file: string) => readFileSync(join(contentDir, file), 'utf8');

  it('all build, so a copy from HQ that the renderer can’t show fails here first', () => {
    expect(() => buildSite(readContent)).not.toThrow();
  });
});
