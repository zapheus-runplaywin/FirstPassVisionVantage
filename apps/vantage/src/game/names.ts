/** The detail on the lineup recorded at setup; Undo never removes it. */
export const STARTING_LINEUP = 'Starting lineup';

/** A player's name as the ribbon shows it: without the first word when there are several ("Mia Chen" is "Chen"). */
export function shortName(label: string | undefined): string {
  if (!label) return '';
  const parts = label.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');
}
