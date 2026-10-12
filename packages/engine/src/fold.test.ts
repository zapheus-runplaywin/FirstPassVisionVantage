import { expect, it } from 'vitest';
import { fold } from './fold';

it('applies events in order', () => {
  const goals = [{ team: 'us' }, { team: 'them' }, { team: 'us' }] as const;
  const score = fold(goals, { us: 0, them: 0 }, (s, e) => ({ ...s, [e.team]: s[e.team] + 1 }));
  expect(score).toEqual({ us: 2, them: 1 });
});
