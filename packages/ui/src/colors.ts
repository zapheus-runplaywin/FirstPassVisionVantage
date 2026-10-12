/** FirstPass brand palette, from the style guide. */
export const brand = {
  pacificBlue: '#2274A5',
  blazeOrange: '#F75C03',
  electricGold: '#F1C40F',
  deepNavy: '#0F172A',
  lightGray: '#F8FAFC',
} as const;

/**
 * Colours by meaning. Both apps use the dark theme only: black background,
 * blue court, white tap targets, orange and gold reserved for attention.
 */
export const colors = {
  background: '#000000',
  surface: brand.deepNavy,
  court: brand.pacificBlue,
  courtLine: '#FFFFFF',
  target: '#FFFFFF',
  targetText: brand.deepNavy,
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.6)',
  ourTeam: brand.pacificBlue,
  opposition: brand.electricGold,
  attention: brand.blazeOrange,
  selected: brand.electricGold,
  /** Turnover the opponent won (forced). */
  forcedError: '#FF4F1F',
  /** Turnover we gave away (unforced). */
  unforcedError: brand.electricGold,
} as const;
