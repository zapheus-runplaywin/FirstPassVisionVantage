const { test } = require('node:test');
const check = require('./check.cjs');

test('the packages load with require()', () => {
  check(require('@firstpass/schema'), require('@firstpass/engine'), require('@firstpass/engine/package.json').version);
});
