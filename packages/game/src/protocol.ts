import { z } from "zod";
import { ConfigSchema } from "./config";
import {
  ADD_TIME_MAX_MS,
  EMOTES,
  PHRASE_MAX_LEN,
  TURN_MAX_MS,
  TURN_MIN_MS,
} from "./constants";
import type { LobbyView } from "./view";

// Raw strings are bounded here; names are cleaned and fully validated in the
// reducer so the client and server share one rule (validateName).
const RawName = z.string().max(100);
const Id = z.string().min(1).max(64);

/** Everything a client may send, besides the raw "ping" heartbeat frame. */
export const ClientMessage = z.discriminatedUnion("type", [
  /** From the host screen: create this lobby (D14, D18). */
  z.strictObject({
    type: z.literal("create"),
    config: ConfigSchema.optional(),
  }),
  /** From the host screen: reconnect with the token it got from `create`. */
  z.strictObject({
    type: z.literal("screen"),
    token: z.string().min(1).max(64),
  }),
  z.strictObject({
    type: z.literal("join"),
    name: RawName,
    token: z.string().max(64).optional(),
  }),
  z.strictObject({
    type: z.literal("updateConfig"),
    config: ConfigSchema.partial(),
  }),
  z.strictObject({ type: z.literal("kick"), playerId: Id }),
  z.strictObject({ type: z.literal("rename"), playerId: Id, name: RawName }),
  z.strictObject({ type: z.literal("setGamemaster"), playerId: Id }),
  z.strictObject({
    type: z.literal("startTeams"),
    mode: z.enum(["wheel", "manual"]).optional(),
  }),
  z.strictObject({ type: z.literal("nameTeam"), teamId: Id, name: RawName }),
  z.strictObject({ type: z.literal("addToTeam"), teamId: Id, playerId: Id }),
  z.strictObject({
    type: z.literal("removeFromTeam"),
    teamId: Id,
    playerId: Id,
  }),
  z.strictObject({ type: z.literal("spinRest") }),
  z.strictObject({ type: z.literal("confirmTeams") }),
  z.strictObject({
    type: z.literal("submitPhrase"),
    text: z.string().max(PHRASE_MAX_LEN * 2),
  }),
  z.strictObject({ type: z.literal("deletePhrase"), phraseId: Id }),
  // Cavan (D30): GM-only.
  z.strictObject({ type: z.literal("setCavan"), playerId: Id.nullable() }),
  z.strictObject({ type: z.literal("approvePhrase"), phraseId: Id }),
  z.strictObject({ type: z.literal("rejectPhrase"), phraseId: Id }),
  // The game loop (D31). Clients send intents; the server owns time and scores.
  z.strictObject({ type: z.literal("startGame") }),
  z.strictObject({ type: z.literal("acknowledge") }),
  z.strictObject({ type: z.literal("beginRound") }),
  z.strictObject({ type: z.literal("startTurn") }),
  z.strictObject({ type: z.literal("next") }),
  z.strictObject({ type: z.literal("back") }),
  z.strictObject({ type: z.literal("forward") }),
  z.strictObject({ type: z.literal("pauseTimer") }),
  z.strictObject({ type: z.literal("resumeTimer") }),
  z.strictObject({
    type: z.literal("addTime"),
    ms: z.int().min(-ADD_TIME_MAX_MS).max(ADD_TIME_MAX_MS),
  }),
  z.strictObject({ type: z.literal("endTurn") }),
  z.strictObject({ type: z.literal("proceed") }),
  z.strictObject({
    type: z.literal("restartPrevTurn"),
    ms: z.int().min(TURN_MIN_MS).max(TURN_MAX_MS),
  }),
  z.strictObject({ type: z.literal("reveal") }),
  // Before a turn: whoever is up swaps with their next teammate (D41).
  z.strictObject({ type: z.literal("skipTurn") }),
  z.strictObject({ type: z.literal("playAgain") }),
  z.strictObject({ type: z.literal("emote"), kind: z.enum(EMOTES) }),
]);

export type EmoteKind = (typeof EMOTES)[number];

export type ClientMessage = z.infer<typeof ClientMessage>;

export type ErrorCode =
  | "BAD_MESSAGE"
  | "NOT_JOINED"
  | "FORBIDDEN"
  | "WRONG_PHASE"
  | "INVALID"
  | "NAME_TAKEN"
  | "LOBBY_FULL"
  | "LOBBY_NOT_FOUND"
  | "CODE_TAKEN"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ByeReason = "kicked" | "replaced" | "expired";

export type ServerMessage =
  | { type: "state"; view: LobbyView; now: number }
  /** This socket is now that player, or the host screen (D18). */
  | { type: "joined"; as: "player"; playerId: string; token: string }
  | { type: "joined"; as: "screen"; token: string }
  | { type: "error"; code: ErrorCode; message: string }
  /** A reaction from a player, broadcast to every socket (D31). */
  | { type: "emote"; playerId: string; name: string; kind: EmoteKind }
  /** Sent right before the server closes this socket on purpose. */
  | { type: "bye"; reason: ByeReason }
  /** Protocol version mismatch: the client should reload the page (§6.8). */
  | { type: "reload" };
