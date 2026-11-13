/** Six digits, ignoring spaces and dashes; null when it can't be a pair code. */
export function normalisePairCode(code: string): string | null {
  const digits = code.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}
