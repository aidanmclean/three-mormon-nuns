import { CODE_LENGTH } from "./constants";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Uppercases and strips anything that isn't A–Z, capped at CODE_LENGTH. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && normalizeCode(code) === code;
}

/** Lobby codes aren't secrets, so any uniform source of randomness will do. */
export function randomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += LETTERS[Math.floor(random() * LETTERS.length)];
  }
  return code;
}
