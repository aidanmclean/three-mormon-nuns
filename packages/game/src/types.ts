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

/** Cavan's phrases start `pending` until the GM vets them (D30). */
export type PhraseStatus = "approved" | "pending" | "rejected";

export interface Phrase {
  id: string;
  authorId: PlayerId;
  text: string;
  status: PhraseStatus;
}

/** One player's turn (D13, D17, D31). Present from `turnReady` through `turnReview`. */
export interface Turn {
  playerId: PlayerId;
  teamId: TeamId;
  /** Phrase ids in the order shown this turn. */
  seen: string[];
  /** seen[0…cursor) currently count as guessed; the live score is `cursor`. */
  cursor: number;
  /** Furthest the cursor got while the timer ran; review can't go past it. */
  maxCursor: number;
  /** Time left while the clock isn't running (ready, paused, review). */
  remainingMs: number;
  /** Deadline while running; null when ready, paused or in review. */
  endsAt: number | null;
  /** The active phone shows 3-2-1 until this; the clock starts after it. */
  countdownEndsAt: number | null;
  paused: boolean;
  /** Why the turn stopped; null while it's ready or live. */
  endedBy: "timer" | "pile" | "gm" | "left" | null;
  /** Same player continuing with leftover time after a pile-out (D17). */
  carried: boolean;
  /** The GM is peeking at the current phrase. */
  revealed: boolean;
}

/** What `restartPrevTurn` restores: the game just before the last Proceed. */
export interface GameSnapshot {
  round: number;
  pile: string[];
  scores: Record<TeamId, number>;
  playerScores: Record<PlayerId, number>;
  teamCursor: number;
  memberCursor: Record<TeamId, number>;
  playerId: PlayerId;
  teamId: TeamId;
  carried: boolean;
}

/** Rounds and turns (D31). Null before the GM starts the game. */
export interface Game {
  /** 1…ROUNDS. */
  round: number;
  /** Approved phrase ids not yet guessed this round. */
  pile: string[];
  scores: Record<TeamId, number>;
  /** Index into teamOrder of the team that plays next. */
  teamCursor: number;
  /** Per team, index into memberIds of the player who plays next. */
  memberCursor: Record<TeamId, number>;
  /** Who has tapped "Got it" on the current round intro. */
  acknowledged: PlayerId[];
  turn: Turn | null;
  previous: GameSnapshot | null;
  /** Phrases each player got their team to guess while describing (D36). */
  playerScores: Record<PlayerId, number>;
  /** Players the GM skipped who haven't had a turn since (D35). */
  skipped: PlayerId[];
  /** A skipped player the GM sent up: they take their team's next turn (D35). */
  upNext: PlayerId | null;
}

/** How teams are made: the server wheel, or the GM placing everyone (D32). */
export type TeamMode = "wheel" | "manual";

export interface TeamDraft {
  mode: TeamMode;
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
  game: Game | null;
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
    /** The moderated player: the GM vets every phrase they write (D30). */
    cavanId: PlayerId | null;
  };
  createdAt: number;
  expiresAt: number;
}
