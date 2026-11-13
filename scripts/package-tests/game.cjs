// A short sample game for the package tests: one quarter, a starting lineup, a centre pass received,
// a goal by our GS, a goal by them, and a correction that deletes a Feed.
const gameId = 'game-1';
let seq = 0;
const ev = (type, payload) => ({
  id: `e${++seq}`,
  gameId,
  stream: 'primary',
  seq,
  type,
  payload,
  recordedAt: new Date(Date.UTC(2026, 10, 13, 9, 0, seq)).toISOString(),
});
const config = { us: 'Thunder', them: 'Storm', quarterMs: 600000, q1AttackEnd: 'left', firstCentrePass: 'us' };
const t = { period: 1, clockMs: 600000 };
const events = [
  ev('period_start', { ...t, attackEnd: 'left', centrePass: 'us', mode: 'core' }),
  ev('lineup_change', { ...t, team: 'us', lineup: { GS: 'Mia', GA: 'Jade', C: 'Ava' }, bench: [], detail: 'Starting lineup' }),
  ev('clock_start', t),
  ev('action', { period: 1, clockMs: 590000, team: 'us', player: 'C', action: 'Receive' }),
  ev('action', { period: 1, clockMs: 585000, team: 'us', player: 'GA', action: 'Feed' }),
  ev('action', { period: 1, clockMs: 580000, team: 'us', player: 'GS', action: 'Goal' }),
  ev('action', { period: 1, clockMs: 560000, team: 'them', player: null, action: 'Goal' }),
  ev('correction', { target: 'e5', op: 'delete' }),
  ev('clock_stop', { period: 1, clockMs: 500000 }),
  ev('period_end', { period: 1, clockMs: 500000 }),
];
module.exports = { config, events };
