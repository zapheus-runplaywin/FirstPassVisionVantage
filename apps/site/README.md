# FirstPass HQ public pages

The privacy policy, support and delete-my-account pages that the App Store and Google Play link to, and the list of user guides. See "Public pages" in the root README for how the words get here and how the site is published.

- `content/*.md`: the pages, copied from FirstPass HQ's `docs/store/public-pages/`. Don't edit them here.
- `src/markdown.ts`: renders the small part of Markdown the pages use (headings, paragraphs, lists, bold, italic, code, links). It escapes everything first, refuses tables, code blocks and HTML comments, and allows links only to https:, mailto: or a page on this site.
- `src/site.ts`: the layout, in the brand kit's colours, light and dark. No scripts, no web fonts and a strict content security policy, so a visit sends nothing to anyone else.
- `/guides`: made in `src/site.ts`, not from Markdown. It links to the role guides the FirstPass HQ repo publishes on GitHub Pages; this site holds no PDFs.
- `static/`: the FirstPass HQ wordmark and the 1P HQ mark as the favicon.

Expo Hosting serves `/privacy` from `privacy.html`, as it does for an Expo Router export.
