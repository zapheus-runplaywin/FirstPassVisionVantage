// Type-checked against the installed packages (Node16 resolution, strict), as a TypeScript user such as
// FirstPass Studio compiles them.
import { POSITIONS, type GameConfig, type GameEvent } from '@firstpass/schema';
import { deriveGame, ENGINE_VERSION, netPoints, type GameState } from '@firstpass/engine';

const config: GameConfig = { us: 'Thunder', them: 'Storm', quarterMs: 600000, q1AttackEnd: 'left', firstCentrePass: 'us' };
const events: GameEvent[] = [];
const state: GameState = deriveGame(config, events);
const major: number = Number(ENGINE_VERSION.split('.')[0]);
const mia: number | undefined = netPoints(events).byPlayer['Mia'];
export const used = [POSITIONS.length, state.score.us, major, mia];
