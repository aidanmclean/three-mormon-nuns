import { z } from "zod";
import { MAX_PLAYERS_CAP } from "./constants";

export const CONFIG_RANGES = {
  roundLengthSec: [15, 180],
  teamCount: [2, 8],
  maxPlayers: [2, MAX_PLAYERS_CAP],
  phrasesPerPlayer: [1, 10],
  maxWordsPerPhrase: [1, 10],
} as const;

const int = ([min, max]: readonly [number, number]) =>
  z.int().min(min).max(max);

export const ConfigSchema = z.strictObject({
  roundLengthSec: int(CONFIG_RANGES.roundLengthSec),
  teamCount: int(CONFIG_RANGES.teamCount),
  maxPlayers: int(CONFIG_RANGES.maxPlayers),
  phrasesPerPlayer: int(CONFIG_RANGES.phrasesPerPlayer),
  maxWordsPerPhrase: int(CONFIG_RANGES.maxWordsPerPhrase),
  profanityFilter: z.enum(["off", "names", "phrases", "both"]),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Defaults follow the house rules: 2 teams, 3 phrases of up to 3 words each,
 * 1-minute turns. There is no moderation setting: Cavan's phrases are always
 * vetted by the game master (D16).
 */
export const DEFAULT_CONFIG: Config = {
  roundLengthSec: 60,
  teamCount: 2,
  maxPlayers: 20,
  phrasesPerPlayer: 3,
  maxWordsPerPhrase: 3,
  profanityFilter: "off",
};
