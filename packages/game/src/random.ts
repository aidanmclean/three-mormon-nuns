/**
 * A shuffled copy of `items` (Fisher-Yates), using the shell's random source
 * (D58). Without one (tests), the order is kept, so results stay repeatable.
 */
export function shuffled<T>(items: readonly T[], rng?: () => number): T[] {
  const out = [...items];
  if (!rng) return out;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
