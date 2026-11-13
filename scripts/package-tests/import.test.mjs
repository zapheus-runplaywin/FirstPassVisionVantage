import { test } from 'node:test';
import { createRequire } from 'node:module';
import * as schema from '@firstpass/schema';
import * as engine from '@firstpass/engine';

const require = createRequire(import.meta.url);
const check = require('./check.cjs');

test('the packages load with import, named exports included', async () => {
  const { deriveGame } = await import('@firstpass/engine');
  if (typeof deriveGame !== 'function') throw new Error('deriveGame is not a named export');
  check(schema, engine, require('@firstpass/engine/package.json').version);
});
