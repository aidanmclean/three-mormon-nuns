// Shared between apps/web and apps/party. Keep this package free of
// runtime-specific code (no DOM, no Workers APIs) so it runs anywhere.

export const GAME_NAME = "3 Mormon Nuns";

/** PartyServer namespace: the kebab-cased Durable Object binding name. */
export const PARTY = "lobby";

export const CODE_LENGTH = 4;

/** Uppercases and strips anything that isn't A–Z, capped at CODE_LENGTH. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, CODE_LENGTH);
}

export type ServerMessage = { type: "count"; n: number };
