// Tests for publish-packages.mjs: the package.json Studio installs. Run: node --test scripts/test-publish-packages.mjs
import test from 'node:test';
import assert from 'node:assert';
import { publishedManifest, registryName } from './publish-packages.mjs';

const pkg = {
  name: '@firstpass/playhq', version: '0.2.0', type: 'module', main: 'src/index.ts', types: 'src/index.ts', 'react-native': 'src/index.ts',
  files: ['dist'], scripts: { build: 'node build.mjs' }, devDependencies: { vitest: '^4' }, dependencies: { other: '^1.0.0' },
  publishConfig: { main: 'dist/index.cjs', types: 'dist/types/index.d.ts', exports: { '.': { require: './dist/index.cjs' } } },
};

test('publishes under the repository owner\'s scope, as GitHub Packages requires', () => {
  assert.equal(registryName('@firstpass/playhq'), '@zapheus-runplaywin/playhq');
  assert.equal(publishedManifest(pkg).name, '@zapheus-runplaywin/playhq');
});

test('points at the built files and the GitHub registry, without workspace-only fields', () => {
  const out = publishedManifest(pkg);
  assert.equal(out.main, 'dist/index.cjs');
  assert.equal(out.types, 'dist/types/index.d.ts');
  assert.deepEqual(out.exports, { '.': { require: './dist/index.cjs' } });
  assert.deepEqual(out.publishConfig, { registry: 'https://npm.pkg.github.com' });
  assert.equal(out.version, '0.2.0');
  assert.deepEqual(out.dependencies, { other: '^1.0.0' });
  for (const gone of ['scripts', 'devDependencies', 'react-native']) assert.equal(out[gone], undefined, gone);
});

test('refuses a package that still depends on another through the workspace', () => {
  assert.throws(() => publishedManifest({ ...pkg, dependencies: { '@firstpass/schema': 'workspace:*' } }), /publish @firstpass\/schema too/);
});
