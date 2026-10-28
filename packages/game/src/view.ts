import type { Config } from "./config";
import { ROUND_RULES } from "./constants";
import type {
  LobbyState,
  Phase,
  PhraseStatus,
  PlayerId,
  Team,
  TeamId,
  Turn,
} from "./types";

export interface PlayerView {
  id: PlayerId;
  name: string;
  status: "active" | "inactive";
  waiting: boolean;
  teamId: TeamId | null;
  isGamemaster: boolean;
  /** The moderated player (D30). Public, so everyone knows who's being vetted. */
  isCavan: boolean;
  /** Phrases toward the quota (approved + pending). */
  phraseCount: number;
  /** Phrases that will go in the pile. */
  approvedCount: number;
}

export interface OwnPhraseView {
  id: string;
  authorId: PlayerId;
  text: string;
  status: PhraseStatus;
}

export interface TurnView {
  playerId: PlayerId;
  teamId: TeamId;
  /** Points scored so far this turn (the cursor, D13). */
  points: number;
  /** Shown/total positions, for "phrase 3 of 3" in review. */
  cursor: number;
  maxCursor: number;
  remainingMs: number;
  endsAt: number | null;
  countdownEndsAt: number | null;
  paused: boolean;
  endedBy: Turn["endedBy"];
  carried: boolean;
  revealed: boolean;
  /**
   * The phrase being described: only for the active player, and for the GM
   * while they reveal it. Everyone else gets null (§5.3).
   */
  currentPhrase: string | null;
  /**
   * Phrases guessed this turn, once it's in review. With `showGuessed` off
   * only the player who described gets them (D47); everyone else gets null
   * and sees `points` alone.
   */
  guessed: string[] | null;
}

export interface GameView {
  round: number;
  roundTitle: string;
  roundRules: string;
  scores: Record<TeamId, number>;
  /** Phrases left this round, and the whole pile size. */
  pileCount: number;
  totalPhrases: number;
  acknowledged: PlayerId[];
  turn: TurnView | null;
  canRestartPrevious: boolean;
  /** Teams with the top score once the game is over; more than one is a tie. */
  winners: TeamId[];
  /** Players who swapped and take their team's next turn (D41). */
  owed: PlayerId[];
  /**
   * Once the game is over: everyone who placed 1st–3rd by phrases guessed
   * while they described (D36). Ties share a place, so places can repeat.
   */
  leaders: { playerId: PlayerId; points: number; place: 1 | 2 | 3 }[];
}

export interface LobbyView {
  code: string;
  phase: Phase;
  config: Config;
  /** In join order. */
  players: PlayerView[];
  teams: Team[];
  lastDraw: LobbyState["lastDraw"];
  draft: LobbyState["draft"];
  ownPhrases: OwnPhraseView[];
  /** Cavan's phrases awaiting a decision; only the GM receives them (D30). */
  moderation: { id: string; authorId: PlayerId; text: string }[];
  game: GameView | null;
  /** The viewer's own player id, or null for the host screen and unjoined sockets. */
  you: PlayerId | null;
}

/**
 * The only thing ever sent to clients (§5.3). Copies fields explicitly so a
 * new secret on Player (like `token`) can't leak by accident.
 */
export function viewFor(state: LobbyState, viewer: PlayerId | null): LobbyView {
  const { roles } = state;
  const phrases = Object.values(state.phrases);
  const isGm = viewer !== null && viewer === roles.gamemasterId;
  const players = Object.values(state.players)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
    .map((p): PlayerView => {
      // Only the GM and Cavan themselves know who Cavan is (D40). Everyone
      // else, the TV included, sees unapproved phrases as not written yet.
      const knows = isGm || viewer === p.id;
      const approvedCount = phrases.filter(
        (ph) => ph.authorId === p.id && ph.status === "approved",
      ).length;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        waiting: p.waiting,
        teamId: p.teamId,
        isGamemaster: p.id === roles.gamemasterId,
        isCavan: knows && p.id === roles.cavanId,
        phraseCount: knows
          ? phrases.filter(
              (ph) => ph.authorId === p.id && ph.status !== "rejected",
            ).length
          : approvedCount,
        approvedCount,
      };
    });
  return {
    code: state.code,
    phase: state.phase,
    config: { ...state.config },
    players,
    teams: state.teamOrder.flatMap((id) => {
      const team = state.teams[id];
      return team
        ? [
            {
              id: team.id,
              name: team.name,
              nameConfirmed: team.nameConfirmed,
              captainId: team.captainId,
              memberIds: [...team.memberIds],
            },
          ]
        : [];
    }),
    lastDraw: state.lastDraw
      ? {
          ...state.lastDraw,
          candidates: state.lastDraw.candidates.map((p) => ({
            id: p.id,
            name: p.name,
          })),
        }
      : null,
    draft: state.draft
      ? { ...state.draft, remainingIds: [...state.draft.remainingIds] }
      : null,
    ownPhrases: phrases
      .filter((p) => p.authorId === viewer)
      .map((p) => ({
        id: p.id,
        authorId: p.authorId,
        text: p.text,
        status: p.status,
      })),
    moderation: isGm
      ? phrases
          .filter((p) => p.status === "pending")
          .map((p) => ({ id: p.id, authorId: p.authorId, text: p.text }))
      : [],
    game: gameView(state, viewer, isGm),
    you: viewer !== null && viewer in state.players ? viewer : null,
  };
}

function gameView(
  state: LobbyState,
  viewer: PlayerId | null,
  isGm: boolean,
): GameView | null {
  const game = state.game;
  if (!game) return null;
  const rules = ROUND_RULES[game.round - 1] ?? ROUND_RULES[0];
  const text = (id: string | undefined) =>
    id === undefined ? null : (state.phrases[id]?.text ?? null);
  const turn = game.turn;
  const live = state.phase === "turnActive" || state.phase === "turnReview";
  let turnView: TurnView | null = null;
  if (turn) {
    const mine = viewer !== null && viewer === turn.playerId;
    const current =
      live && (mine || (isGm && turn.revealed))
        ? text(turn.seen[turn.cursor])
        : null;
    turnView = {
      playerId: turn.playerId,
      teamId: turn.teamId,
      points: turn.cursor,
      cursor: turn.cursor,
      maxCursor: turn.maxCursor,
      remainingMs: turn.remainingMs,
      endsAt: turn.endsAt,
      countdownEndsAt: turn.countdownEndsAt,
      paused: turn.paused,
      endedBy: turn.endedBy,
      carried: turn.carried,
      revealed: turn.revealed,
      currentPhrase: current,
      // The describer saw them all already; the room sees them only if the
      // house rules say so (D47).
      guessed:
        state.phase === "turnReview" && (state.config.showGuessed || mine)
          ? turn.seen
              .slice(0, turn.cursor)
              .flatMap((id) =>
                state.phrases[id] ? [state.phrases[id].text] : [],
              )
          : null,
    };
  }
  const top = Math.max(0, ...state.teamOrder.map((id) => game.scores[id] ?? 0));
  return {
    round: game.round,
    roundTitle: rules?.title ?? "",
    roundRules: rules?.rules ?? "",
    scores: Object.fromEntries(
      state.teamOrder.map((id) => [id, game.scores[id] ?? 0]),
    ),
    pileCount: game.pile.length,
    totalPhrases: Object.values(state.phrases).filter(
      (p) => p.status === "approved",
    ).length,
    acknowledged: [...game.acknowledged],
    turn: turnView,
    canRestartPrevious: game.previous !== null,
    winners:
      state.phase === "results"
        ? state.teamOrder.filter((id) => (game.scores[id] ?? 0) === top)
        : [],
    owed: [...game.owed],
    leaders: state.phase === "results" ? leaders(state, game.playerScores) : [],
  };
}

/** Standard competition ranking (1, 1, 3), top three places, points > 0. */
function leaders(
  state: LobbyState,
  scores: Record<PlayerId, number>,
): GameView["leaders"] {
  const ranked = Object.entries(scores)
    .filter(([id, points]) => points > 0 && state.players[id])
    .sort(([, a], [, b]) => b - a);
  const out: GameView["leaders"] = [];
  ranked.forEach(([playerId, points], i) => {
    const firstWithScore = ranked.findIndex(([, p]) => p === points);
    const place = (i === firstWithScore ? i : firstWithScore) + 1;
    if (place <= 3) out.push({ playerId, points, place: place as 1 | 2 | 3 });
  });
  return out;
}
