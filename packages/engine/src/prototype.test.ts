import {
  ACTIONS,
  CAUSES_LOST,
  CAUSES_WON,
  POSITIONS,
  type ActionPayload,
  type CourtPoint,
  type GameConfig,
  type GameEvent,
  type PlayerRef,
  type Team,
} from '@firstpass/schema';
import { describe, expect, it } from 'vitest';
import { prototype } from '../test/reference/prototype.js';
import { deriveGame, type GameState } from './game';
import { legalPositions, zoneOf } from './geometry';

/*
 * Differential test: random games are played through both the engine and the
 * Vantage prototype's own fold, and every derived number must match.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  return { next, pick, chance: (p: number) => next() < p };
}

interface ProtoEvent {
  id: string;
  type: string;
  period: number;
  team?: Team;
  player?: PlayerRef | null;
  action?: string;
  cause?: string | null;
  rebound?: string | null;
  zone?: ReturnType<typeof zoneOf> | null;
  deleted?: boolean;
}

function randomGame(seed: number) {
  const r = rng(seed);
  const config: GameConfig = {
    us: 'Hawks',
    them: 'Kestrels',
    quarterMs: 15 * 60_000,
    q1AttackEnd: r.pick(['left', 'right'] as const),
    firstCentrePass: r.pick(['us', 'them'] as const),
  };
  const proto = { firstCP: config.firstCentrePass, events: [] as ProtoEvent[], periodOverrides: {} as Record<number, { cp: Team }> };
  const events: GameEvent[] = [];
  let seq = 0;
  const envelope = () => ({ id: `e${++seq}`, gameId: 'g', stream: 'primary' as const, seq, recordedAt: '2026-10-14T00:00:00Z' });
  const actionIds: string[] = [];

  for (let period = 1; period <= 4; period++) {
    const centrePass: Team = period === 1 ? config.firstCentrePass : r.pick(['us', 'them'] as const);
    if (period > 1) proto.periodOverrides[period] = { cp: centrePass };
    const start = envelope();
    events.push({ ...start, type: 'period_start', payload: { period, clockMs: config.quarterMs, attackEnd: 'right', centrePass, mode: 'core' } });
    proto.events.push({ id: start.id, type: 'period_start', period });

    const count = 10 + Math.floor(r.next() * 50);
    for (let i = 0; i < count; i++) {
      const roll = r.next();
      if (roll < 0.04) {
        const e = envelope();
        events.push({ ...e, type: 'flag', payload: { period, clockMs: 0 } });
        proto.events.push({ id: e.id, type: 'flag', period });
        continue;
      }
      if (roll < 0.12 && actionIds.length) {
        // A correction of an earlier action: delete or edit.
        const target = r.pick(actionIds);
        const p = proto.events.find((x) => x.id === target)!;
        const e = envelope();
        if (r.chance(0.5)) {
          events.push({ ...e, type: 'correction', payload: { target, op: 'delete' } });
          p.deleted = true;
        } else {
          const patch = randomPatch(r);
          events.push({ ...e, type: 'correction', payload: { target, op: 'edit', patch } });
          Object.assign(p, patch);
          if (p.team === 'them') p.player = null;
        }
        continue;
      }
      const team = r.pick(['us', 'them'] as const);
      const action = r.pick(ACTIONS);
      const at: CourtPoint | null = r.chance(0.1) ? null : { x: r.next(), y: r.next() };
      const payload: ActionPayload = {
        period,
        clockMs: config.quarterMs - i * 10_000,
        team,
        player: team === 'us' ? (r.chance(0.08) ? '?' : r.chance(0.05) ? null : r.pick(POSITIONS)) : null,
        action,
        cause: r.chance(0.6) ? r.pick([...CAUSES_LOST, ...CAUSES_WON]) : null,
        rebound: action === 'Miss' && r.chance(0.8) ? r.pick(['ours', 'theirs', 'out'] as const) : null,
        at,
      };
      const e = envelope();
      events.push({ ...e, type: 'action', payload });
      proto.events.push({ id: e.id, type: 'action', ...payload, zone: at ? zoneOf(at) : null });
      actionIds.push(e.id);
    }
  }
  return { config, events, proto };
}

function randomPatch(r: ReturnType<typeof rng>): NonNullable<Extract<GameEvent, { type: 'correction' }>['payload']['patch']> {
  const patch: ReturnType<typeof randomPatch> = {};
  if (r.chance(0.5)) patch.action = r.pick(ACTIONS);
  if (r.chance(0.3)) patch.team = r.pick(['us', 'them'] as const);
  if (r.chance(0.4)) patch.player = r.pick([...POSITIONS, '?'] as const);
  if (r.chance(0.3)) patch.cause = r.pick(CAUSES_LOST);
  if (r.chance(0.3)) patch.rebound = r.pick(['ours', 'theirs', 'out'] as const);
  return patch;
}

const CHAIN_NAMES: Record<string, string> = { cp: 'centre pass', rebound: 'rebound', throwin: 'throw in', gain: 'gain', turnover: 'turnover' };

/** The prototype's fold result, renamed into the engine's shape. */
function fromPrototype(st: any): Partial<GameState> {
  const quarters: GameState['quarters'] = {};
  for (const [k, q] of Object.entries<any>(st.perQ)) {
    quarters[Number(k)] = {
      us: q.us,
      them: q.them,
      gains: q.gains,
      unforced: q.unforced,
      shots: q.shotsN,
      goals: q.shotsG,
      centrePasses: q.cpN,
      centrePassGoals: q.cpG,
    };
  }
  const unforcedByThird: Record<string, number> = {};
  for (const [k, n] of Object.entries<number>(st.stats.unforcedByZone)) unforcedByThird[k === '?' ? 'unknown' : k] = n;
  const shotsByPosition: Record<string, { attempts: number; goals: number }> = {};
  for (const [k, s] of Object.entries<any>(st.stats.shots)) shotsByPosition[k] = { attempts: s.att, goals: s.g };
  return {
    score: { us: st.us, them: st.them },
    nextCentrePass: st.nextCP,
    centrePassPending: st.cpPending,
    possession: st.poss,
    chain: st.chain ? { team: st.chain.team, from: CHAIN_NAMES[st.chain.from] as any } : null,
    shotsByPosition,
    centrePass: {
      us: { received: st.stats.cp.us.n, goals: st.stats.cp.us.g },
      them: { received: st.stats.cp.them.n, goals: st.stats.cp.them.g },
    },
    gains: st.stats.gains,
    unforced: st.stats.unforced,
    unforcedByThird,
    turnoversByPosition: st.stats.turnoverPos,
    quarters,
  };
}

describe('engine matches the Vantage prototype', () => {
  it.each(Array.from({ length: 300 }, (_, i) => i + 1))('random game %i', (seed) => {
    const { config, events, proto } = randomGame(seed);
    const expected = fromPrototype(prototype(proto).fold());
    const actual = deriveGame(config, events);
    expect(actual).toMatchObject(expected);
  });

  it('agrees on zones and legal positions across the court', () => {
    const p = prototype({});
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 30; j++) {
        const at = { x: i / 60, y: j / 30 };
        const theirs = p.zoneOf(at.x, at.y);
        const ours = zoneOf(at);
        expect({ ...ours, chan: ours.channel, centre: ours.centreCircle }).toMatchObject({
          third: theirs.third,
          chan: theirs.chan,
          circle: theirs.circle,
          sector: theirs.sector,
          range: theirs.range,
          centre: theirs.centre,
          label: theirs.label,
        });
        expect([...legalPositions(ours)].sort()).toEqual([...p.legalOurs(theirs)].sort());
      }
    }
  });
});
