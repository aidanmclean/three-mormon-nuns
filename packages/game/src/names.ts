import { NAME_MAX_LEN } from "./constants";

// Control and invisible formatting characters (zero-width spaces, bidi
// overrides, …) that would let two names look identical.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** The display form of a name: NFC, invisible chars stripped, whitespace collapsed. */
export function cleanName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identity key for a name: two players can't share one within a lobby (D7). */
export function nameKey(raw: string): string {
  return cleanName(raw).toLowerCase();
}

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; message: string };

export function validateName(raw: string): NameCheck {
  const name = cleanName(raw);
  if (name.length === 0) return { ok: false, message: "Enter a name." };
  if ([...name].length > NAME_MAX_LEN) {
    return {
      ok: false,
      message: `Names can be at most ${NAME_MAX_LEN} characters.`,
    };
  }
  return { ok: true, name };
}
