import type { BackdoorId } from "./backdoors";
import { cleanName } from "./names";

// The secret half of the backdoors (D48). Server-only: imported by the
// reducer and nothing else, and not exported from the package index, so the
// codes stay out of the web app's JavaScript (Q6, §6.9).

/** The secret phrase for each backdoor, compared ignoring case and spaces. */
const CODES: Record<string, BackdoorId> = {
  alexemote: "alexEmote",
};

/** What the player's own phone says when a backdoor opens. */
export const BACKDOOR_UNLOCKED: Record<BackdoorId, string> = {
  alexEmote: "Alex emote unlocked!",
};

/** The backdoor a typed phrase opens, if any. */
export function backdoorFor(text: string): BackdoorId | null {
  const key = cleanName(text).toLowerCase().replace(/\s+/gu, "");
  return Object.hasOwn(CODES, key) ? (CODES[key] ?? null) : null;
}
