import { describe, expect, it } from 'vitest';
import { formatClock, freshness, OFFLINE_MS, QUIET_MS, readConfig, scoreSummary } from '../summary';
import { config, Q, stream, T0 } from './fixtures';

describe('formatClock', () => {
  it('shows mm:ss, rounding part seconds up like a scoreboard', () => {
    expect(formatClock(Q)).toBe('10:00');
    expect(formatClock(452_001)).toBe('07:33');
    expect(formatClock(452_000)).toBe('07:32');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('readConfig', () => {
  it('keeps a config Vantage saved', () => {
    expect(readConfig(config)).toEqual(config);
  });

  it('fills in anything missing or odd so the screen still shows', () => {
    expect(readConfig(null)).toEqual({ us: 'Us', them: 'Them', quarterMs: 900_000, q1AttackEnd: 'left', firstCentrePass: 'us' });
    expect(readConfig({ us: '  ', them: 7, quarterMs: -1, q1AttackEnd: 'up', firstCentrePass: 'them' })).toEqual({
      us: 'Us',
      them: 'Them',
      quarterMs: 900_000,
      q1AttackEnd: 'left',
      firstCentrePass: 'them',
    });
  });
});

describe('scoreSummary', () => {
  it('says not started before any event', () => {
    const s = scoreSummary(config, [], T0);
    expect(s).toMatchObject({ label: 'Not started', phase: 'not started', score: { us: 0, them: 0 }, clock: '10:00', running: false, quarters: [] });
    expect(s.names).toEqual({ us: 'Thunder', them: 'Storm' });
  });

  it('counts goals and runs the clock from the tablet time the clock started', () => {
    const s = stream();
    const log = [
      s.start(1),
      s.clockStart(1, Q, 0),
      s.act(1, Q - 20_000, { team: 'us', action: 'Receive' }, 20_000),
      s.act(1, Q - 30_000, { team: 'us', action: 'Goal', player: 'GS' }, 30_000),
      s.act(1, Q - 60_000, { team: 'them', action: 'Goal' }, 60_000),
      s.act(1, Q - 80_000, { team: 'us', action: 'Goal', player: 'GA' }, 80_000),
    ];
    const sum = scoreSummary(config, log, T0 + 150_000);
    expect(sum.score).toEqual({ us: 2, them: 1 });
    expect(sum.label).toBe('Q1');
    expect(sum.phase).toBe('playing');
    expect(sum.running).toBe(true);
    expect(sum.clock).toBe('07:30');
    expect(sum.quarters).toEqual([{ period: 1, us: 2, them: 1 }]);
    expect(sum.centrePass).toBe('them');
  });

  it('holds the clock when it is stopped', () => {
    const s = stream();
    const log = [s.start(1), s.clockStart(1, Q, 0), s.clockStop(1, Q - 45_000, 45_000)];
    const sum = scoreSummary(config, log, T0 + 600_000);
    expect(sum.running).toBe(false);
    expect(sum.clock).toBe('09:15');
  });

  it('shows the break and each quarter, and full time after Q4', () => {
    const s = stream();
    const log = [s.start(1), s.act(1, 1, { team: 'us', action: 'Goal' }), s.end(1), s.start(2), s.act(2, 1, { team: 'them', action: 'Goal' }), s.end(2)];
    const half = scoreSummary(config, log, T0);
    expect(half.label).toBe('Q2 break');
    expect(half.phase).toBe('break');
    expect(half.centrePass).toBeNull();
    expect(half.quarters).toEqual([
      { period: 1, us: 1, them: 0 },
      { period: 2, us: 0, them: 1 },
    ]);
    const full = [...log, s.start(3), s.end(3), s.start(4), s.end(4)];
    expect(scoreSummary(config, full, T0)).toMatchObject({ label: 'Full time', phase: 'full time' });
  });

  it('honours corrections, so an undone goal comes off the score', () => {
    const s = stream();
    const goal = s.act(1, 1, { team: 'us', action: 'Goal' });
    const log = [s.start(1), goal, s.correction(goal.id)];
    expect(scoreSummary(config, log, T0).score).toEqual({ us: 0, them: 0 });
  });
});

describe('freshness', () => {
  const now = T0 + 100_000;

  it('is fresh while live updates are joined and stats keep coming', () => {
    expect(freshness({ connection: 'live', lastEventAt: now - 5_000, lastReadAt: now - 20_000 }, true, now)).toEqual({ kind: 'fresh' });
  });

  it('warns when the clock is running and nothing has arrived for a while', () => {
    expect(freshness({ connection: 'live', lastEventAt: now - QUIET_MS - 1_000, lastReadAt: now }, true, now)).toEqual({ kind: 'quiet', seconds: 31 });
  });

  it('does not warn about quiet while the clock is stopped or at a break', () => {
    expect(freshness({ connection: 'live', lastEventAt: now - 300_000, lastReadAt: now }, false, now)).toEqual({ kind: 'fresh' });
  });

  it('is fine without live updates while reads keep working', () => {
    expect(freshness({ connection: 'polling', lastEventAt: now - 5_000, lastReadAt: now - 4_000 }, true, now)).toEqual({ kind: 'fresh' });
  });

  it('warns when neither live updates nor reads are getting through', () => {
    expect(freshness({ connection: 'polling', lastEventAt: null, lastReadAt: now - OFFLINE_MS - 2_000 }, false, now)).toEqual({ kind: 'offline', seconds: 17 });
    expect(freshness({ connection: 'connecting', lastEventAt: null, lastReadAt: null }, false, now)).toEqual({ kind: 'offline', seconds: null });
  });
});
