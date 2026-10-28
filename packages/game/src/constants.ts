// Every tunable number lives here. Changing one? Update docs/ARCHITECTURE.md §6.6.

export const GAME_NAME = "3 Mormon Nuns";

/** PartyServer namespace: the kebab-cased Durable Object binding name. */
export const PARTY = "lobby";

export const CODE_LENGTH = 4;

/** Bump on any breaking change to client/server messages or views (§6.8). */
export const PROTOCOL_VERSION = 7;

/** Bump whenever the persisted LobbyState shape changes (§6.5). */
export const SCHEMA_VERSION = 9;

/** Fixed by the game rules (§1.2). */
export const ROUNDS = 3;

/** What each round's intro screen explains (§1.2, Q9). Index 0 = round 1. */
export const ROUND_RULES = [
  {
    title: "Describe it",
    rules: "Describe the phrase without saying any of the words in it.",
  },
  {
    title: "Charades",
    rules: "Act it out. No talking.",
  },
  {
    title: "One word",
    rules: "Give a clue of exactly one word.",
  },
] as const satisfies readonly { title: string; rules: string }[];

export const MAX_MESSAGE_BYTES = 4096;
/** Short enough that every name fits on the TV and a phone row (D39). */
export const NAME_MAX_LEN = 16;
export const PHRASE_MAX_LEN = 80;
export const WHEEL_SPIN_MS = 2_600;
export const WHEEL_REVEAL_MS = 900;
/** 3-2-1 on the active player's phone before the clock starts (D31). */
export const TURN_COUNTDOWN_MS = 3_000;
/** Largest single "add/remove time" step, and bounds for any turn's time (D31). */
export const ADD_TIME_MAX_MS = 60_000;
export const TURN_MIN_MS = 1_000;
export const TURN_MAX_MS = 10 * 60_000;
/** Reactions anyone can send; shown on the host screen (D31). */
export const EMOTES = [
  "laugh",
  "clap",
  "fire",
  "thumbsUp",
  "thumbsDown",
  "tomato",
] as const;
export const MAX_PLAYERS_CAP = 40;
/** Players + TV screens + duplicate tabs. */
export const MAX_CONNECTIONS = 60;

export const HEARTBEAT_INTERVAL_MS = 5_000;
/** Show connection help while automatic retries continue, rather than an endless loading screen. */
export const LOBBY_RESPONSE_TIMEOUT_MS = 8_000;
/** Client reconnect backoff: first retry after 250 ms, growing 1.5× up to 4 s (D19). */
export const RECONNECT_MIN_DELAY_MS = 250;
export const RECONNECT_MAX_DELAY_MS = 4_000;
export const INACTIVE_AFTER_MS = 20_000;
export const PRESENCE_SWEEP_MS = 5_000;
export const IDLE_EXPIRY_MS = 2 * 60 * 60_000;
export const RESULTS_EXPIRY_MS = 15 * 60_000;

/** Per-connection token bucket. */
export const RATE_LIMIT_PER_SEC = 10;
export const RATE_LIMIT_BURST = 20;
