import { AppleAuthenticationButton, AppleAuthenticationButtonStyle, AppleAuthenticationButtonType } from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { appleSignInAvailable } from '../lib/apple';

/** True on an iPhone, iPad or Mac where Apple offers its sign-in; false everywhere else. */
export function useAppleSignIn(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void appleSignInAvailable().then((yes) => {
      if (live) setAvailable(yes);
    });
    return () => {
      live = false;
    };
  }, []);
  return available;
}

/**
 * Apple's own button, as App Review expects: white on our black, never
 * recoloured. It takes its colour and corners from its props and needs a
 * width and a height from `style`, or it doesn't show.
 */
export function AppleButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <AppleAuthenticationButton
      buttonType={AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={10}
      onPress={onPress}
      style={[{ height: 52, minWidth: 220 }, style]}
    />
  );
}
