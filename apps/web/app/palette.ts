// Player colours: picked from the player id, so they look shuffled but stay
// put across renders and screens (D39).

export const PLAYER_COLORS = [
  "#bce6e3",
  "#ffe4a0",
  "#f5c5b2",
  "#d8ccec",
  "#cbdba6",
  "#f2b6c1",
] as const;

export function playerColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // FNV's low bits are weak; mix them before taking the remainder.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return PLAYER_COLORS[(h >>> 0) % PLAYER_COLORS.length] ?? PLAYER_COLORS[0];
}

// Team colours follow the team's position, matching the team cards and the TV
// columns.
export const TEAM_COLORS = [
  "#ffdc4a",
  "#bce6e3",
  "#fac1a6",
  "#d8ccec",
] as const;

export function teamColor(index: number): string {
  return TEAM_COLORS[Math.max(0, index) % TEAM_COLORS.length] ?? TEAM_COLORS[0];
}
