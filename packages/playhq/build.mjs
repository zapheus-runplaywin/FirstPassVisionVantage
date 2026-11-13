// Builds what Studio (and anything else outside this workspace) installs from GitHub Packages:
// dist/index.mjs (ES module), dist/index.cjs (CommonJS, for Studio's plain-JS require) and the
// type definitions in dist/types. Vantage and Vision don't use this: they read src/ through the workspace.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';

rmSync('dist', { recursive: true, force: true });
const common = { entryPoints: ['src/index.ts'], bundle: true, platform: 'neutral', target: 'es2020', sourcemap: true, logLevel: 'warning' };
await build({ ...common, format: 'esm', outfile: 'dist/index.mjs' });
await build({ ...common, format: 'cjs', outfile: 'dist/index.cjs' });
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
