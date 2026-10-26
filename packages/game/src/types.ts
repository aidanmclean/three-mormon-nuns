import type { Config } from "./config";

export type PlayerId = string;
export type TeamId = string;

export type Phase =
  | "lobby"
  | "teams"
  | "writing"
  | "roundIntro"
  | "turnReady"
  | "turnActive"
  | "turnReview"
  | "results";

export interface Player {
  id: PlayerId;
  /** Display name; nameKey(name) is unique within the lobby. */
  name: string;
  /** Session token for seamless reconnects (D7). Never leaves the server. */
  token: string;
  teamId: TeamId | null;
  status: "active" | "inactive";
  /** Joined after the lobby phase; waits for the game master to assign a team. */
  waiting: boolean;
  joinedAt: number;
}

/**
 * Everything persisted for one lobby. Fields for later phases (teams,
 * phrases, turns) are added by the slices that build them, with a
 * SCHEMA_VERSION bump. Target shape: docs/ARCHITECTURE.md §5.1.
 */
export interface LobbyState {
  schemaVersion: number;
  code: string;
  phase: Phase;
  config: Config;
  /** Phones. The host screen is not a player (D18). */
  players: Record<PlayerId, Player>;
  /** Token of the host screen that created the lobby; lets it reconnect. Never sent to clients. */
  screenToken: string;
  roles: {
    /** The player in control (D18). Null only until the first player joins. */
    gamemasterId: PlayerId | null;
    /** The moderated player: their phrases need GM approval (D16). */
    cavanId: PlayerId | null;
  };
  createdAt: number;
  expiresAt: number;
}
