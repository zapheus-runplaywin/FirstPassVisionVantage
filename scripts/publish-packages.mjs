#!/usr/bin/env node
// Publishes the shared @firstpass/* packages to GitHub Packages, for products outside this
// workspace (Studio). Vantage and Vision don't need this: they use packages/ through the workspace.
//
// GitHub Packages only takes npm packages scoped to the repository's owner, so @firstpass/playhq is
// published as @zapheus-runplaywin/playhq. Studio installs it under its workspace name with an npm alias:
//   "@firstpass/playhq": "npm:@zapheus-runplaywin/playhq@^0.1.0"
// so require('@firstpass/playhq') means the same code everywhere.
//
// A package is published when it isn't "private", has a publishConfig, and its version isn't on the
// registry yet: bump "version" (and add a CHANGELOG.md line) in the pull request that changes it.
//
//   node scripts/publish-packages.mjs            publish what's new (the "Publish packages" workflow)
//   node scripts/publish-packages.mjs --check    pack each package, install the tarball in an empty
//                                                folder and require() it, as Studio will (CI, every PR)
//
// Run `pnpm -r build` first. Needs NODE_AUTH_TOKEN with write:packages to publish (the workflow's
// GITHUB_TOKEN); --check needs no token.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REGISTRY = 'https://npm.pkg.github.com';
const OWNER = (process.env.PUBLISH_SCOPE || process.env.GITHUB_REPOSITORY_OWNER || 'zapheus-runplaywin').toLowerCase();
const check = process.argv.includes('--check');

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });

/** The registry name for a workspace package: @firstpass/playhq -> @zapheus-runplaywin/playhq. */
export const registryName = (name) => `@${OWNER}/${name.replace(/^@[^/]+\//, '')}`;

/** The package.json as published: publishConfig applied, renamed, nothing only the workspace needs. */
export function publishedManifest(pkg) {
  const { publishConfig = {}, scripts, devDependencies, ...rest } = pkg;
  const out = { ...rest, ...publishConfig, name: registryName(pkg.name), publishConfig: { registry: REGISTRY } };
  delete out['react-native']; // the source entry; the built files serve every consumer outside the workspace
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(out[field] ?? {})) {
      if (String(range).startsWith('workspace:')) {
        throw new Error(`${pkg.name} depends on ${dep} through the workspace; publish ${dep} too and depend on its released version first.`);
      }
    }
  }
  return out;
}

function publishable() {
  const dir = join(ROOT, 'packages');
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((d) => existsSync(join(d, 'package.json')))
    .map((d) => ({ dir: d, pkg: JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')) }))
    .filter(({ pkg }) => !pkg.private && pkg.publishConfig);
}

/** Copies what would be published into a fresh folder with the published package.json. */
function stage({ dir, pkg }) {
  const out = mkdtempSync(join(tmpdir(), 'fp-publish-'));
  for (const entry of pkg.files ?? []) {
    if (!existsSync(join(dir, entry))) throw new Error(`${pkg.name}: ${entry} is missing. Run pnpm -r build first.`);
    cpSync(join(dir, entry), join(out, entry), { recursive: true });
  }
  writeFileSync(join(out, 'package.json'), `${JSON.stringify(publishedManifest(pkg), null, 2)}\n`);
  return out;
}

/** npm's answer for a package or version that isn't on the registry yet (GitHub Packages says E404). */
export const notPublished = (stderr) => /\bE404\b|404 Not Found|is not in this registry/.test(String(stderr ?? ''));

function onRegistry(name, version) {
  try {
    // stderr is captured (not shown) so a 404 can be told apart from a real failure.
    return run('npm', ['view', `${name}@${version}`, 'version', '--registry', REGISTRY], { stdio: ['ignore', 'pipe', 'pipe'] }).trim() === version;
  } catch (err) {
    if (notPublished(err.stderr)) return false;
    if (err.stderr) process.stderr.write(err.stderr);
    throw err;
  }
}

function checkPackage(target) {
  const name = registryName(target.pkg.name);
  const staged = stage(target);
  const packs = mkdtempSync(join(tmpdir(), 'fp-pack-'));
  const tarball = join(packs, run('npm', ['pack', '--silent', '--pack-destination', packs], { cwd: staged }).trim().split('\n').pop());
  // An empty project installing the tarball, as Studio installs the release.
  const app = mkdtempSync(join(tmpdir(), 'fp-consumer-'));
  writeFileSync(join(app, 'package.json'), '{ "name": "consumer", "private": true }\n');
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', tarball], { cwd: app });
  const exportsCount = run(process.execPath, ['-e', `const m = require(${JSON.stringify(name)}); console.log(Object.keys(m).length)`], { cwd: app }).trim();
  run(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(name)}); if (!m.createTransport) process.exit(1)`], { cwd: app });
  const types = JSON.parse(readFileSync(join(app, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')).types;
  if (!existsSync(join(app, 'node_modules', ...name.split('/'), types))) throw new Error(`${name}: types ${types} not in the package`);
  console.log(`${target.pkg.name} ${target.pkg.version} as ${name}: packed, installed, require() and import() give ${exportsCount} exports`);
  for (const d of [staged, packs, app]) rmSync(d, { recursive: true, force: true });
}

function publishPackage(target) {
  const name = registryName(target.pkg.name);
  const { version } = target.pkg;
  if (onRegistry(name, version)) {
    console.log(`${name}@${version} is already published`);
    return;
  }
  const staged = stage(target);
  run('npm', ['publish', '--registry', REGISTRY], { cwd: staged, stdio: 'inherit' });
  console.log(`Published ${name}@${version}`);
  rmSync(staged, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = publishable();
  if (!targets.length) console.log('No publishable packages.');
  for (const t of targets) (check ? checkPackage : publishPackage)(t);
}
