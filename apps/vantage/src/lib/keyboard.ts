import { getKv, setKv } from './db';

const KEYBOARD_KV = 'keyboardShortcuts';

/** Whether this device uses keyboard shortcuts on the game screen. Off unless someone turned it on (Home). */
export function keyboardWanted(): boolean {
  return getKv(KEYBOARD_KV) === '1';
}

export function setKeyboardWanted(on: boolean): void {
  setKv(KEYBOARD_KV, on ? '1' : '0');
}
