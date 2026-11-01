import type { EmoteKind } from "./protocol";

// Backdoors (D48): secret phrases typed into the phrase box during writing
// unlock a perk for that player for the rest of the game. This file is the
// public half (what each perk changes). The codes are in backdoor-codes.ts,
// which only the reducer imports, so they never reach a phone (Q6, §6.9).

export const BACKDOOR_IDS = ["alexEmote"] as const;
export type BackdoorId = (typeof BACKDOOR_IDS)[number];

/** Emotes only players with that backdoor can send. */
export const LOCKED_EMOTES: Partial<Record<EmoteKind, BackdoorId>> = {
  alex: "alexEmote",
};

export function canSendEmote(
  kind: EmoteKind,
  backdoors: readonly BackdoorId[],
): boolean {
  const needs = LOCKED_EMOTES[kind];
  return !needs || backdoors.includes(needs);
}
