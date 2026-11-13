import { expect, it } from 'vitest';
import pkg from '../package.json';
import { ENGINE_VERSION } from './index';

it('ENGINE_VERSION matches the package version', () => {
  expect(ENGINE_VERSION).toBe(pkg.version);
});
