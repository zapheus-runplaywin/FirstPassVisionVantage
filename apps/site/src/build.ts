// Builds the public pages into apps/site/dist.
//
//   node src/build.ts            build, placeholders allowed (CI, local preview)
//   node src/build.ts --publish  build for publishing: refuses placeholder pages

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSite, placeholderPages } from './site.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (file: string) => readFileSync(join(root, 'content', file), 'utf8');

const publishing = process.argv.includes('--publish');
const placeholders = placeholderPages(read);
if (publishing && placeholders.length) {
  console.error(
    `Not publishing: ${placeholders.join(', ')} still hold placeholder text or a blank such as [SUPPORT EMAIL]. ` +
      'Fill them in HQ, then copy the words again with scripts/sync-public-pages.sh.',
  );
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'static'), dist, { recursive: true });
for (const file of buildSite(read)) {
  writeFileSync(join(dist, file.path), file.contents);
}
console.log(`Built ${dist}${placeholders.length ? ` (placeholders: ${placeholders.join(', ')})` : ''}`);
