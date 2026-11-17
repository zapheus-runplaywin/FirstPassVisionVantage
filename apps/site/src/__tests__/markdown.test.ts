import { describe, expect, it } from 'vitest';

import { MarkdownError, escapeHtml, isSafeHref, renderInline, renderMarkdown } from '../markdown.ts';

describe('escapeHtml', () => {
  it('escapes every character that can open markup or end an attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('isSafeHref', () => {
  it.each(['https://support.google.com/x', 'mailto:help@example.com', '/privacy', '/privacy#contact', '/'])(
    'allows %s',
    (href) => expect(isSafeHref(href)).toBe(true),
  );

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'http://example.com',
    '//evil.example',
    'data:text/html,hi',
    'privacy',
    'mailto:nobody',
    '/a"onmouseover="x',
  ])('refuses %s', (href) => expect(isSafeHref(href)).toBe(false));
});

describe('renderInline', () => {
  it('renders bold, italic, code and links', () => {
    expect(renderInline('**Bold** and *soft*, `code` and [Support](/support).')).toBe(
      '<strong>Bold</strong> and <em>soft</em>, <code>code</code> and <a href="/support">Support</a>.',
    );
  });

  it('leaves underscores in names such as delete_my_account alone', () => {
    expect(renderInline('the delete_my_account function')).toBe('the delete_my_account function');
  });

  it('shows raw HTML as text', () => {
    expect(renderInline('<script>alert(1)</script><img src=x onerror=y>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=y&gt;',
    );
  });

  it('escapes HTML inside code and link text', () => {
    expect(renderInline('`<b>` [<i>x</i>](/support)')).toBe(
      '<code>&lt;b&gt;</code> <a href="/support">&lt;i&gt;x&lt;/i&gt;</a>',
    );
  });

  it('refuses a link to a script address', () => {
    expect(() => renderInline('[click](javascript:alert(1))')).toThrow(MarkdownError);
  });

  it('leaves a lone asterisk as text', () => {
    expect(renderInline('5 * 3 = 15')).toBe('5 * 3 = 15');
  });
});

describe('renderMarkdown', () => {
  const page = [
    '# Privacy policy',
    '',
    'Intro line one',
    'continues here.',
    '',
    '## What we collect',
    '',
    '- Your name',
    '- Your email, which',
    '  wraps onto two lines',
    '',
    '1. Open the app',
    '2. Tap **Delete my account**',
    '',
    '## What we collect',
    '',
    'Same heading twice.',
  ].join('\n');

  it('takes the title from the one level-1 heading and leaves it out of the body', () => {
    const out = renderMarkdown(page);
    expect(out.title).toBe('Privacy policy');
    expect(out.html).not.toContain('<h1');
  });

  it('joins the lines of a paragraph', () => {
    expect(renderMarkdown(page).html).toContain('<p>Intro line one continues here.</p>');
  });

  it('renders bullet and numbered lists, including a wrapped item', () => {
    const { html } = renderMarkdown(page);
    expect(html).toContain('<ul><li>Your name</li><li>Your email, which wraps onto two lines</li></ul>');
    expect(html).toContain('<ol><li>Open the app</li><li>Tap <strong>Delete my account</strong></li></ol>');
  });

  it('gives each heading a unique id for links', () => {
    const { headings, html } = renderMarkdown(page);
    expect(headings.map((h) => h.id)).toEqual(['what-we-collect', 'what-we-collect-2']);
    expect(html).toContain('<h2 id="what-we-collect-2">');
  });

  it('accepts Windows line endings', () => {
    expect(renderMarkdown('# Title\r\n\r\nText\r\n').html).toBe('<p>Text</p>');
  });

  it.each([
    ['no title', 'Just text'],
    ['two titles', '# One\n\n# Two'],
    ['text before the title', 'Intro\n\n# Title'],
    ['a table', '# T\n\n| a | b |'],
    ['a code block', '# T\n\n```\nx\n```'],
    ['an HTML comment', '# T\n\n<!-- hidden -->'],
    ['an unsafe link', '# T\n\n[x](http://plain.example)'],
  ])('refuses a page with %s', (_name, source) => {
    expect(() => renderMarkdown(source)).toThrow(MarkdownError);
  });
});
