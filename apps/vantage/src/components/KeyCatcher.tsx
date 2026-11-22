import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { BOX_LIMIT, SENTINEL, makeRepeatGuard, readTyped, type Typed } from '../game/keyboard';

/**
 * Hears the keyboard for the game screen's shortcuts.
 *
 * React Native has no way to hear a hardware key on an iPad or a Mac except
 * through a text box, so this is one: out of sight, never showing the
 * on-screen keyboard. It reads what each change added, and is put back to a
 * single character when it empties or fills up. While `active` it keeps
 * the keyboard's attention; when a sheet with its own text boxes opens,
 * `active` goes false and it lets go.
 */
export function KeyCatcher({ active, onKey }: { active: boolean; onKey: (typed: Typed) => void }) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const fresh = useRef(makeRepeatGuard());
  /** What the box held after its last change. */
  const held = useRef(SENTINEL);
  const live = useRef(active);
  live.current = active;

  useEffect(() => {
    if (active) input.current?.focus();
    else input.current?.blur();
  }, [active]);

  return (
    <TextInput
      ref={input}
      defaultValue={SENTINEL}
      onChangeText={(text) => {
        const typed = readTyped(held.current, text);
        held.current = text;
        if (text.length === 0 || text.length > BOX_LIMIT) {
          held.current = SENTINEL;
          input.current?.setNativeProps({ text: SENTINEL });
        }
        for (const key of typed) if (fresh.current(key, Date.now())) onKey(key);
      }}
      onBlur={() => {
        // A tap elsewhere can take the keyboard's attention; take it back.
        setTimeout(() => {
          if (live.current) input.current?.focus();
        }, 50);
      }}
      autoFocus={active}
      showSoftInputOnFocus={false}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      spellCheck={false}
      caretHidden
      contextMenuHidden
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={styles.hidden}
    />
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: 0, top: 0 },
});
