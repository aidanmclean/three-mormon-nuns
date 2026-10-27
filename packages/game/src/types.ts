import type { Config } from "./config";

export type PlayerId = string;
export type TeamId = string;

export interface Team {
  id: TeamId;
  name: string;
  nameConfirmed: boolean;
  captainId: PlayerId | null;
  memberIds: PlayerId[];
}

export type Phase =
  | "lobby"
  | "teams"
  | "writing"
  | "roundIntro"
  | "turnReady"
  | "turnActive"
  | "turnReview"
  | "results";

export interface Phrase {
  id: string;
  authorId: PlayerId;
  text: string;
}

export interface TeamDraft {
  remainingIds: PlayerId[];
  nextTeamIndex: number;
  stage: "spinning" | "revealing" | "complete";
  nextAt: number | null;
}

export interface Player {
  id: PlayerId;
  /** Display name; nameKey(name) is unique within the lobby. */
  name: string;
  /** Session token for seamless reconnects (D7). Never leaves the server. */
  token: string;
  teamId: TeamId | null;
  status: "active" | "inactive";
  /** Joined after team confirmation; waits for the game master to assign a team. */
  waiting: boolean;
  joinedAt: number;
}

/**
 * Everything persisted for one lobby. Fields for later phases (phrases,
 * turns) are added by the slices that build them, with a
 * SCHEMA_VERSION bump. Target shape: docs/ARCHITECTURE.md §5.1.
 */
export interface LobbyState {
  schemaVersion: number;
  code: string;
  phase: Phase;
  config: Config;
  /** Phones. The host screen is not a player (D18). */
  players: Record<PlayerId, Player>;
  teams: Record<TeamId, Team>;
  teamOrder: TeamId[];
  draft: TeamDraft | null;
  phrases: Record<string, Phrase>;
  /** Public result of the latest server-owned random pick. */
  lastDraw: {
    sequence: number;
    teamId: TeamId;
    playerId: PlayerId;
    candidates: { id: PlayerId; name: string }[];
    startedAt: number;
    endsAt: number;
  } | null;
  /** Token of the host screen that created the lobby; lets it reconnect. Never sent to clients. */
  screenToken: string;
  roles: {
    /** The player in control (D18). Null only until the first player joins. */
    gamemasterId: PlayerId | null;
  };
  createdAt: number;
  expiresAt: number;
}
