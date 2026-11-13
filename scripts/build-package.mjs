// Builds the package in the current folder (one of packages/) for npm: CommonJS JavaScript (ES2022)
// with .d.ts files in dist/. The packages are "type": "module" for the apps, so dist/ gets its own
// package.json saying its files are CommonJS; Node then require()s and import()s them alike.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const tsc = createRequire(join(process.cwd(), 'package.json')).resolve('typescript/bin/tsc');
rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
