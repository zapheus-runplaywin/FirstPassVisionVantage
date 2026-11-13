// Shared checks for the packages as npm installs them, run from require() (CommonJS) and import() (ESM).
const assert = require('node:assert/strict');
const { config, events } = require('./game.cjs');

module.exports = function check(schema, engine, version) {
  assert.deepEqual([...schema.POSITIONS], ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK']);
  assert.equal(engine.ENGINE_VERSION, version);

  const state = engine.deriveGame(config, events);
  assert.deepEqual(state.score, { us: 1, them: 1 });
  assert.deepEqual(state.shotsByPlayer.Mia, { attempts: 1, goals: 1, positions: ['GS'] });
  assert.equal(state.centrePass.us.goals, 1);

  // A snapshot is plain JSON: folding the rest of the log onto it gives the same state.
  const live = engine.liveEvents(events);
  const snapshot = JSON.parse(JSON.stringify(live.slice(0, 4).reduce(engine.applyEvent, engine.initialState(config))));
  assert.deepEqual(live.slice(4).reduce(engine.applyEvent, snapshot), state);

  // The deleted Feed earns Jade nothing.
  const points = engine.netPoints(events);
  assert.equal(points.byPlayer.Jade, undefined);
  assert.equal(points.byPlayer.Mia, 2);

  const time = engine.courtTime(events, config.quarterMs);
  assert.equal(time.Mia.totalMs, 100000);
};
