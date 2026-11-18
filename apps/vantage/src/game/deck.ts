import { legalPositions, reboundKind, rebounderChoices, reboundTeam, type GameState } from '@firstpass/engine';
import { CAUSES_LOST, CAUSES_WON, POSITIONS, type Action, type Cause, type PlayerRef, type Rebound, type Team } from '@firstpass/schema';
import { ACTION_GRID, FULL_ONLY, actionLook, type Pending } from './entry';
import { shortName } from './names';

/**
 * The game screen as 32 Stream Deck keys (a Stream Deck XL, 8 across and 4
 * down), for a statistician who would rather press keys than tap glass.
 *
 * There are no pages or folders. Every key keeps its place for the whole game:
 *
 *   row 1  our seven positions and "who?"            (who)
 *   row 2  the eight actions                         (what)
 *   row 3  the optional detail for the last action   (how it was lost or won, or who got the rebound)
 *   row 4  the other team, skip, mark, undo, score, ball, clock, end quarter
 *
 * Only row 3 changes its labels, and only to answer the action just pressed.
 * Where it happened (the court), substitutions, corrections and setup stay on
 * the screen.
 *
 * This file decides what each key says and what a press means. The Stream Deck
 * plugin (plugins/vantage-deck) only draws the keys and reports presses.
 */

export const DECK_COLUMNS = 8;
export const DECK_ROWS = 4;
export const DECK_KEYS = DECK_COLUMNS * DECK_ROWS;

/**
 * How a key is drawn. 'lit' is what the rules of netball expect next, 'plain'
 * works, 'dim' works but contradicts the state, 'selected' is already chosen,
 * 'alert' wants attention, 'info' only shows something, 'off' does nothing.
 */
export type DeckLook = 'lit' | 'plain' | 'dim' | 'selected' | 'alert' | 'info' | 'off';

export interface DeckKey {
  /** What a press means; '' for a key that does nothing. */
  id: string;
  /** Up to two short lines, split by a line break. */
  title: string;
  look: DeckLook;
}

export type DeckPress =
  | { kind: 'pick'; team: Team; player: PlayerRef | null }
  | { kind: 'action'; action: Action }
  | { kind: 'cause'; cause: Cause }
  | { kind: 'rebound'; rebound: Rebound }
  | { kind: 'rebounder'; player: PlayerRef }
  | { kind: 'skip' | 'flag' | 'undo' | 'clock' | 'endQuarter' };

export interface DeckInput {
  pending: Pending | null;
  state: GameState;
  /** Our lineup now: position to player name. */
  lineup: Partial<Record<string, string>>;
  names: Record<Team, string>;
  period: number;
  /** The game clock as shown on screen, such as "06:12". */
  clockText: string;
  running: boolean;
  /** The clock has reached 0:00 and the quarter is waiting to be ended. */
  timeUp: boolean;
  /** Between quarters: the screen shows the review, and the keys rest. */
  inBreak: boolean;
  /** End quarter was pressed once and is waiting for the second press. */
  endArmed: boolean;
}

const OFF: DeckKey = { id: '', title: '', look: 'off' };
const REBOUNDS: readonly Rebound[] = ['ours', 'theirs', 'out'];

const detailStage = (p: Pending | null): boolean => p?.stage === 'cause' || p?.stage === 'rebound' || p?.stage === 'rebounder';

/** Keeps a name to what fits on a key. */
const fit = (text: string, max = 9): string => (text.length > max ? text.slice(0, max - 1) + '…' : text);

function whoRow(i: DeckInput): DeckKey[] {
  const { pending } = i;
  if (pending?.stage === 'rebounder' && pending.rebound) {
    // After a rebound we took, this row answers "who took it?".
    const likely = new Set<PlayerRef>(rebounderChoices(pending.rebound, pending.team ?? 'us'));
    const kind = reboundKind(pending.rebound);
    return [...POSITIONS, '?' as const].map((p) => ({
      id: `rebounder:${p}`,
      title: p === '?' ? `${kind}\nwho?` : `${kind} ${p}\n${fit(shortName(i.lineup[p]))}`,
      look: likely.has(p) ? 'lit' : 'plain',
    }));
  }
  const legal = pending?.zone ? legalPositions(pending.zone) : null;
  return [...POSITIONS, '?' as const].map((p) => {
    const selected = pending?.team === 'us' && pending.player === p;
    const illegal = p !== '?' && legal !== null && !legal.has(p);
    return {
      id: `pick:us:${p}`,
      title: p === '?' ? '?\nwho?' : `${p}\n${fit(shortName(i.lineup[p]))}`,
      look: selected ? 'selected' : illegal ? 'dim' : 'plain',
    };
  });
}

function whatRow(i: DeckInput): DeckKey[] {
  const { pending, state } = i;
  return ACTION_GRID.map((a) => {
    if (!pending?.team || (FULL_ONLY.has(a) && state.mode !== 'full')) return { id: '', title: a, look: 'off' };
    if (detailStage(pending)) return { id: `action:${a}`, title: a, look: pending.action === a ? 'selected' : 'plain' };
    return { id: `action:${a}`, title: a, look: actionLook(a, pending, state, state.mode) };
  });
}

function detailRow(i: DeckInput): DeckKey[] {
  const { pending } = i;
  let keys: DeckKey[] = [];
  if (pending?.stage === 'cause') {
    const causes: readonly Cause[] = pending.action === 'Won it' ? CAUSES_WON : CAUSES_LOST;
    keys = causes.map((c) => ({ id: `cause:${c}`, title: causeTitle(c), look: 'lit' }));
  } else if (pending?.stage === 'rebound') {
    const shooter = pending.team ?? 'us';
    keys = REBOUNDS.map((r) => {
      const team = reboundTeam(r, shooter);
      return { id: `rebound:${r}`, title: `${reboundKind(r)}\n${team ? fit(i.names[team]) : 'of court'}`, look: 'lit' };
    });
  }
  return [...keys, ...Array<DeckKey>(DECK_COLUMNS).fill(OFF)].slice(0, DECK_COLUMNS);
}

/** A cause on two lines where it has two words. */
function causeTitle(c: Cause): string {
  if (c === 'Deflection, gain') return 'Deflect\ngain';
  if (c === 'Out of court') return 'Out of\ncourt';
  return c.replace(' ', '\n');
}

function bottomRow(i: DeckInput): DeckKey[] {
  const { pending, state } = i;
  const ball = state.possession ? i.names[state.possession] : state.centrePassPending ? `CP ${i.names[state.nextCentrePass]}` : '–';
  return [
    { id: 'pick:them', title: `${fit(i.names.them)}\n(team)`, look: pending?.team === 'them' ? 'selected' : 'plain' },
    detailStage(pending) ? { id: 'skip', title: 'Skip\ndetail', look: 'plain' } : { id: '', title: 'Skip\ndetail', look: 'off' },
    { id: 'flag', title: 'Mark\nmoment', look: 'alert' },
    { id: 'undo', title: pending ? 'Undo\nentry' : 'Undo\nlast', look: 'plain' },
    { id: '', title: `${fit(i.names.us)} ${state.score.us}\n${fit(i.names.them)} ${state.score.them}`, look: 'info' },
    { id: '', title: `Ball\n${fit(ball)}`, look: 'info' },
    { id: 'clock', title: `Q${i.period} ${i.clockText}\n${i.running ? 'Stop' : 'Start'}`, look: i.running ? 'lit' : i.timeUp ? 'dim' : 'alert' },
    i.endArmed
      ? { id: 'endQuarter', title: 'Press\nagain', look: 'alert' }
      : { id: 'endQuarter', title: 'End\nquarter', look: i.timeUp ? 'lit' : 'plain' },
  ];
}

/** The 32 keys, left to right and top to bottom. */
export function deckKeys(i: DeckInput): DeckKey[] {
  if (i.inBreak) {
    // The break review is on the screen: its fixes and the next quarter's settings are done there.
    const keys = Array<DeckKey>(DECK_KEYS).fill(OFF);
    keys[DECK_KEYS - 4] = { id: '', title: `${fit(i.names.us)} ${i.state.score.us}\n${fit(i.names.them)} ${i.state.score.them}`, look: 'info' };
    keys[DECK_KEYS - 2] = { id: '', title: `After Q${i.period}\nbreak`, look: 'info' };
    return keys;
  }
  return [...whoRow(i), ...whatRow(i), ...detailRow(i), ...bottomRow(i)];
}

const includes = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * What a press of the key with this id means, or null when the key is not on
 * the deck right now. A press only counts when its key is showing: a key
 * pressed just as row 3 changed must not answer a question that is no longer
 * being asked.
 */
export function deckPress(id: string, keys: readonly DeckKey[]): DeckPress | null {
  if (!id || !keys.some((k) => k.id === id && k.look !== 'off')) return null;
  const at = id.indexOf(':');
  const head = at < 0 ? id : id.slice(0, at);
  const rest = at < 0 ? '' : id.slice(at + 1);
  switch (head) {
    case 'pick': {
      if (rest === 'them') return { kind: 'pick', team: 'them', player: null };
      const player = rest.slice('us:'.length);
      return rest.startsWith('us:') && (player === '?' || includes(POSITIONS, player)) ? { kind: 'pick', team: 'us', player } : null;
    }
    case 'action':
      return includes(ACTION_GRID, rest) ? { kind: 'action', action: rest } : null;
    case 'cause':
      return includes(CAUSES_LOST, rest) || includes(CAUSES_WON, rest) ? { kind: 'cause', cause: rest } : null;
    case 'rebound':
      return includes(REBOUNDS, rest) ? { kind: 'rebound', rebound: rest } : null;
    case 'rebounder':
      return rest === '?' || includes(POSITIONS, rest) ? { kind: 'rebounder', player: rest } : null;
    case 'skip':
    case 'flag':
    case 'undo':
    case 'clock':
    case 'endQuarter':
      return { kind: head };
    default:
      return null;
  }
}

/** How long End quarter waits for its second press. */
export const END_CONFIRM_MS = 3000;
