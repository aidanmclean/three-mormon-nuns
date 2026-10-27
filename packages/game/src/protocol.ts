import { z } from "zod";
import { ConfigSchema } from "./config";
import { PHRASE_MAX_LEN } from "./constants";
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
  z.strictObject({ type: z.literal("startTeams") }),
  z.strictObject({ type: z.literal("nameTeam"), teamId: Id, name: RawName }),
  z.strictObject({ type: z.literal("addToTeam"), teamId: Id, playerId: Id }),
  z.strictObject({
    type: z.literal("removeFromTeam"),
    teamId: Id,
    playerId: Id,
  }),
  z.strictObject({ type: z.literal("confirmTeams") }),
  z.strictObject({
    type: z.literal("submitPhrase"),
    text: z.string().max(PHRASE_MAX_LEN * 2),
  }),
  z.strictObject({ type: z.literal("deletePhrase"), phraseId: Id }),
]);

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
  /** Sent right before the server closes this socket on purpose. */
  | { type: "bye"; reason: ByeReason }
  /** Protocol version mismatch: the client should reload the page (§6.8). */
  | { type: "reload" };
