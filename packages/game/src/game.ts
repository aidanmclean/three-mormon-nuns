import {
  ROUNDS,
  TURN_COUNTDOWN_MS,
  TURN_MAX_MS,
  TURN_MIN_MS,
} from "./constants";
import type { Action, Ctx, Result } from "./reducer";
import type {
  Game,
  GameSnapshot,
  LobbyState,
  Phase,
  Player,
  PlayerId,
  TeamId,
  Turn,
} from "./types";

// The game loop (D13, D17, D31): rounds, rotation, turns, review, results.
// Pure functions over LobbyState, like draft.ts; the reducer routes to them.

export const GAME_PHASES: readonly Phase[] = [
  "roundIntro",
  "turnReady",
  "turnActive",
  "turnReview",
  "results",
];
export const inGame = (phase: Phase) => GAME_PHASES.includes(phase);

const done = (state: LobbyState): Result => ({ ok: true, state, effects: [] });
const fail = (
  code: "WRONG_PHASE" | "INVALID" | "FORBIDDEN",
  message: string,
): Result => ({ ok: false, code, message });

const clampTime = (ms: number) =>
  Math.min(TURN_MAX_MS, Math.max(TURN_MIN_MS, ms));
const turnLength = (state: LobbyState) => state.config.roundLengthSec * 1000;

/** People who take part in rounds: on a team and not in the waiting room. */
const eligible = (state: LobbyState): Player[] =>
  Object.values(state.players).filter((p) => p.teamId && !p.waiting);

const approvedIds = (state: LobbyState) =>
  Object.values(state.phrases)
    .filter((p) => p.status === "approved")
    .map((p) => p.id);

const listNames = (players: Player[]) => {
  const names = players.slice(0, 3).map((p) => p.name);
  return players.length > 3
    ? `${names.join(", ")} and others`
    : names.join(", ");
};

function freshTurn(
  playerId: PlayerId,
  teamId: TeamId,
  remainingMs: number,
  carried: boolean,
): Turn {
  return {
    playerId,
    teamId,
    seen: [],
    cursor: 0,
    maxCursor: 0,
    remainingMs,
    endsAt: null,
    countdownEndsAt: null,
    paused: false,
    endedBy: null,
    carried,
    revealed: false,
  };
}

const canPlay = (p: Player | undefined): p is Player =>
  p?.status === "active" && !p.waiting && !!p.teamId;

/**
 * Rotation (D13): teams take turns in teamOrder; each team cycles through its
 * own members. Offline players are skipped, and the same team plays with its
 * next connected member (Q1); a team with nobody connected is skipped.
 * A player owed a turn after swapping (D41) plays before their team's
 * rotation continues, without moving it on; `exclude` passes over the player
 * who is swapping out.
 */
function prepare(
  state: LobbyState,
  game: Game,
  fromTeamIndex: number,
  remainingMs: number,
  exclude: PlayerId | null = null,
): Game {
  const n = state.teamOrder.length;
  for (let k = 0; k < n; k++) {
    const ti = (fromTeamIndex + k) % n;
    const teamId = state.teamOrder[ti];
    const members = teamId ? (state.teams[teamId]?.memberIds ?? []) : [];
    if (!teamId || members.length === 0) continue;
    const start = game.memberCursor[teamId] ?? 0;
    let regular: { player: Player; index: number } | null = null;
    for (let j = 0; j < members.length && !regular; j++) {
      const mi = (start + j) % members.length;
      const player = state.players[members[mi] ?? ""];
      if (canPlay(player) && player.id !== exclude)
        regular = { player, index: mi };
    }
    const owed = game.owed
      .map((id) => state.players[id])
      .find((p) => canPlay(p) && p.teamId === teamId && p.id !== exclude);
    if (owed && owed.id !== regular?.player.id)
      return {
        ...game,
        teamCursor: (ti + 1) % n,
        turn: freshTurn(owed.id, teamId, remainingMs, false),
      };
    if (regular)
      return {
        ...game,
        teamCursor: (ti + 1) % n,
        memberCursor: {
          ...game.memberCursor,
          [teamId]: (regular.index + 1) % members.length,
        },
        turn: freshTurn(regular.player.id, teamId, remainingMs, false),
      };
  }
  return { ...game, turn: null };
}

/** A random phrase from the pile that hasn't been shown this turn. */
function draw(game: Game, seen: string[], ctx: Ctx): string | null {
  const options = game.pile.filter((id) => !seen.includes(id));
  if (options.length === 0) return null;
  const random = ctx.rng ?? Math.random;
  return options[Math.floor(random() * options.length)] ?? null;
}

/** Time left on the clock at `now`, never negative. */
export function timeLeft(turn: Turn, now: number): number {
  if (turn.paused || turn.endsAt === null) return turn.remainingMs;
  return Math.max(0, turn.endsAt - Math.max(now, turn.countdownEndsAt ?? now));
}

function timeUp(state: LobbyState, now: number): boolean {
  const turn = state.game?.turn;
  return (
    state.phase === "turnActive" &&
    !!turn &&
    !turn.paused &&
    turn.endsAt !== null &&
    now >= turn.endsAt
  );
}

/** Stops the clock and moves the turn to review (§1.2 rule 5). */
function toReview(
  state: LobbyState,
  endedBy: NonNullable<Turn["endedBy"]>,
  now: number,
): LobbyState {
  const game = state.game;
  const turn = game?.turn;
  if (!game || !turn) return state;
  return {
    ...state,
    phase: "turnReview",
    game: {
      ...game,
      turn: {
        ...turn,
        remainingMs: endedBy === "timer" ? 0 : timeLeft(turn, now),
        endsAt: null,
        countdownEndsAt: null,
        paused: false,
        endedBy,
      },
    },
  };
}

function withTurn(state: LobbyState, turn: Turn): LobbyState {
  return state.game ? { ...state, game: { ...state.game, turn } } : state;
}

/** Round intro → whoever is up (a carried-over player, or the next in rotation). */
function enterTurnReady(state: LobbyState): LobbyState {
  const game = state.game;
  if (!game) return state;
  if (game.turn) return { ...state, phase: "turnReady" };
  return {
    ...state,
    phase: "turnReady",
    game: prepare(state, game, game.teamCursor, turnLength(state)),
  };
}

export function startGame(state: LobbyState): Result {
  if (state.phase !== "writing")
    return fail("WRONG_PHASE", "Finish writing phrases first.");
  const phrases = Object.values(state.phrases);
  if (phrases.some((p) => p.status === "pending"))
    return fail("INVALID", "Approve or reject Cavan's phrases first.");
  const writers = eligible(state).filter((p) => p.status === "active");
  const short = writers.filter(
    (p) =>
      phrases.filter((ph) => ph.authorId === p.id && ph.status === "approved")
        .length < state.config.phrasesPerPlayer,
  );
  if (short.length)
    return fail(
      "INVALID",
      `Waiting for ${listNames(short)} to finish writing.`,
    );
  if (
    state.teamOrder.some(
      (id) =>
        !state.teams[id]?.memberIds.some((pid) =>
          writers.some((w) => w.id === pid),
        ),
    )
  )
    return fail("INVALID", "Every team needs someone connected.");
  const pile = approvedIds(state);
  if (pile.length === 0) return fail("INVALID", "Write some phrases first.");
  const zeros = Object.fromEntries(state.teamOrder.map((id) => [id, 0]));
  return done({
    ...state,
    phase: "roundIntro",
    game: {
      round: 1,
      pile,
      scores: zeros,
      teamCursor: 0,
      memberCursor: zeros,
      acknowledged: [],
      turn: null,
      previous: null,
      playerScores: {},
      owed: [],
    },
  });
}

/** Actions any player can take: their own turn's buttons, round intros and emotes. */
export function playerGameAction(
  state: LobbyState,
  action: Action,
  actor: Player,
  ctx: Ctx,
): Result {
  if (action.type === "emote") {
    // Not a state change; the shell broadcasts it (D31).
    return {
      ok: true,
      state,
      effects: [{ type: "emote", playerId: actor.id, kind: action.kind }],
    };
  }
  const game = state.game;
  if (!game) return fail("WRONG_PHASE", "The game hasn't started.");

  if (action.type === "acknowledge") {
    if (state.phase !== "roundIntro")
      return fail("WRONG_PHASE", "There's nothing to acknowledge right now.");
    if (!actor.teamId || actor.waiting)
      return fail("FORBIDDEN", "You're not on a team this game.");
    if (game.acknowledged.includes(actor.id)) return done(state);
    return done({
      ...state,
      game: { ...game, acknowledged: [...game.acknowledged, actor.id] },
    });
  }

  let current = state;
  if (timeUp(current, ctx.now)) {
    // The clock ran out before this arrived: end the turn first (§1.2 rule 5).
    current = toReview(current, "timer", ctx.now);
    if (action.type === "next") return done(current);
  }
  const turn = current.game?.turn;
  if (
    !turn ||
    (current.phase !== "turnActive" && current.phase !== "turnReview")
  )
    return fail("WRONG_PHASE", "Nobody is playing a turn right now.");
  if (actor.id !== turn.playerId)
    return fail("FORBIDDEN", "It's not your turn.");

  switch (action.type) {
    case "next": {
      if (current.phase !== "turnActive")
        return fail(
          "WRONG_PHASE",
          "Time's up. Use back and forward to fix the last guess.",
        );
      if (turn.paused)
        return fail("INVALID", "The game master paused the clock.");
      if (turn.countdownEndsAt !== null && ctx.now < turn.countdownEndsAt)
        return fail("INVALID", "Wait for the countdown.");
      const cursor = turn.cursor + 1;
      let seen = turn.seen;
      if (cursor >= seen.length) {
        const nextId = current.game ? draw(current.game, seen, ctx) : null;
        if (nextId) seen = [...seen, nextId];
      }
      const updated = withTurn(current, {
        ...turn,
        cursor,
        maxCursor: Math.max(turn.maxCursor, cursor),
        seen,
      });
      // Every phrase guessed: the timer stops right there (§1.2 rule 7, D17).
      return done(
        cursor >= seen.length ? toReview(updated, "pile", ctx.now) : updated,
      );
    }
    case "back":
      if (turn.cursor === 0)
        return fail("INVALID", "That's the first phrase of your turn.");
      return done(withTurn(current, { ...turn, cursor: turn.cursor - 1 }));
    case "forward":
      if (current.phase !== "turnReview")
        return fail(
          "WRONG_PHASE",
          "Press Got it to move on while the clock runs.",
        );
      if (turn.cursor >= turn.maxCursor)
        return fail("INVALID", "That's the last phrase you saw.");
      return done(withTurn(current, { ...turn, cursor: turn.cursor + 1 }));
  }
  return fail("INVALID", "Unknown action.");
}

/** Game-master controls (D18, D31). The caller has already checked the actor is GM. */
export function gmGameAction(
  state: LobbyState,
  action: Action,
  ctx: Ctx,
): Result {
  if (action.type === "startGame") return startGame(state);
  const game = state.game;
  if (!game) return fail("WRONG_PHASE", "The game hasn't started.");

  if (action.type === "playAgain") {
    if (state.phase !== "results")
      return fail("WRONG_PHASE", "Finish the game first.");
    return done(playAgain(state));
  }
  if (action.type === "beginRound") {
    if (state.phase !== "roundIntro")
      return fail("WRONG_PHASE", "There's no round waiting to begin.");
    return done(enterTurnReady(state));
  }
  if (action.type === "restartPrevTurn") {
    const p = game.previous;
    if (!p || !["turnReady", "roundIntro", "results"].includes(state.phase))
      return fail("INVALID", "There's no previous turn to restart.");
    return done({
      ...state,
      phase: "turnReady",
      game: {
        ...game,
        round: p.round,
        pile: p.pile,
        scores: p.scores,
        playerScores: p.playerScores,
        teamCursor: p.teamCursor,
        memberCursor: p.memberCursor,
        acknowledged: [],
        previous: null,
        turn: freshTurn(p.playerId, p.teamId, clampTime(action.ms), p.carried),
      },
    });
  }
  if (action.type === "skipTurn") return skipTurn(state, game);

  let current = state;
  if (timeUp(current, ctx.now)) current = toReview(current, "timer", ctx.now);
  const turn = current.game?.turn ?? null;

  switch (action.type) {
    case "startTurn": {
      if (current.phase !== "turnReady")
        return fail("WRONG_PHASE", "There's no turn waiting to start.");
      let g = current.game ?? game;
      if (!g.turn) g = prepare(current, g, g.teamCursor, turnLength(current));
      if (!g.turn) return fail("INVALID", "Nobody on a team is connected.");
      const first = draw(g, [], ctx);
      if (!first) return fail("INVALID", "The pile is empty.");
      const countdownEndsAt = ctx.now + TURN_COUNTDOWN_MS;
      const playerId = g.turn.playerId;
      return done({
        ...current,
        phase: "turnActive",
        game: {
          ...g,
          // Their turn is happening, so nothing is owed any more (D41).
          owed: g.owed.filter((id) => id !== playerId),
          turn: {
            ...g.turn,
            seen: [first],
            countdownEndsAt,
            endsAt: countdownEndsAt + g.turn.remainingMs,
            paused: false,
          },
        },
      });
    }
    case "pauseTimer":
      if (current.phase !== "turnActive" || !turn)
        return current === state
          ? fail("WRONG_PHASE", "No clock is running.")
          : done(current);
      if (turn.paused) return fail("INVALID", "The clock is already paused.");
      return done(
        withTurn(current, {
          ...turn,
          remainingMs: timeLeft(turn, ctx.now),
          endsAt: null,
          countdownEndsAt: null,
          paused: true,
        }),
      );
    case "resumeTimer":
      if (current.phase !== "turnActive" || !turn?.paused)
        return fail("INVALID", "The clock isn't paused.");
      return done(
        withTurn(current, {
          ...turn,
          endsAt: ctx.now + turn.remainingMs,
          paused: false,
        }),
      );
    case "addTime": {
      const editable =
        (current.phase === "turnReady" && turn) ||
        (current.phase === "turnActive" && turn?.paused);
      if (!editable || !turn)
        return fail("WRONG_PHASE", "Pause the clock before changing the time.");
      return done(
        withTurn(current, {
          ...turn,
          remainingMs: clampTime(turn.remainingMs + action.ms),
        }),
      );
    }
    case "endTurn":
      if (current.phase !== "turnActive")
        return current === state
          ? fail("WRONG_PHASE", "No turn is running.")
          : done(current);
      return done(toReview(current, "gm", ctx.now));
    case "reveal":
      if (
        (current.phase !== "turnActive" && current.phase !== "turnReview") ||
        !turn
      )
        return fail("WRONG_PHASE", "Nobody is playing a turn right now.");
      return done(withTurn(current, { ...turn, revealed: !turn.revealed }));
    case "proceed":
      if (current.phase !== "turnReview" || !turn || !current.game)
        return fail("WRONG_PHASE", "Wait for the turn to end.");
      return done(proceed(current, current.game, turn));
  }
  return fail("INVALID", "Unknown action.");
}

/**
 * Locks in the turn's score (§1.2 rule 6). A pile-out keeps the same player
 * going with the time that was left (D17): into the next round if the pile is
 * empty, or in this round if a disputed phrase was put back during review.
 */
function proceed(state: LobbyState, game: Game, turn: Turn): LobbyState {
  const guessed = turn.seen.slice(0, turn.cursor);
  const pile = game.pile.filter((id) => !guessed.includes(id));
  const scores = {
    ...game.scores,
    [turn.teamId]: (game.scores[turn.teamId] ?? 0) + turn.cursor,
  };
  // The describer gets the credit on the leaderboard (D36).
  const playerScores =
    turn.cursor > 0
      ? {
          ...game.playerScores,
          [turn.playerId]:
            (game.playerScores[turn.playerId] ?? 0) + turn.cursor,
        }
      : game.playerScores;
  const previous: GameSnapshot = {
    round: game.round,
    pile: game.pile,
    scores: game.scores,
    playerScores: game.playerScores,
    teamCursor: game.teamCursor,
    memberCursor: game.memberCursor,
    playerId: turn.playerId,
    teamId: turn.teamId,
    carried: turn.carried,
  };
  let next: Game = {
    ...game,
    pile,
    scores,
    playerScores,
    previous,
    turn: null,
    acknowledged: [],
  };
  const player = state.players[turn.playerId];
  const keepGoing =
    turn.endedBy === "pile" &&
    turn.remainingMs > 0 &&
    player?.status === "active" &&
    player.teamId === turn.teamId;
  const carry = keepGoing
    ? freshTurn(turn.playerId, turn.teamId, turn.remainingMs, true)
    : null;

  if (pile.length === 0) {
    if (game.round >= ROUNDS) return { ...state, phase: "results", game: next };
    next = {
      ...next,
      round: game.round + 1,
      pile: approvedIds(state),
      turn: carry,
    };
    return { ...state, phase: "roundIntro", game: next };
  }
  if (carry)
    return { ...state, phase: "turnReady", game: { ...next, turn: carry } };
  return {
    ...state,
    phase: "turnReady",
    game: prepare(state, next, next.teamCursor, turnLength(state)),
  };
}

/**
 * GM, before a turn starts: whoever is up swaps with their next connected
 * teammate (washroom, or they'd rather go later). The teammate plays now with
 * the same time, and the player who swapped takes the team's next turn. It
 * never moves the turn to another team (D41).
 */
function skipTurn(state: LobbyState, game: Game): Result {
  const turn = game.turn;
  if (state.phase !== "turnReady" || !turn)
    return fail("WRONG_PHASE", "Skip someone before their turn starts.");
  const teamIndex = Math.max(0, state.teamOrder.indexOf(turn.teamId));
  const next = prepare(
    state,
    { ...game, turn: null },
    teamIndex,
    turn.remainingMs,
    turn.playerId,
  );
  if (!next.turn || next.turn.teamId !== turn.teamId)
    return fail("INVALID", "Nobody else on the team is connected to go first.");
  return done({
    ...state,
    game: {
      ...next,
      owed: [...game.owed.filter((id) => id !== turn.playerId), turn.playerId],
      turn: { ...next.turn, carried: turn.carried },
    },
  });
}

/** D9: back to the lobby with everyone still connected; game data cleared. */
function playAgain(state: LobbyState): LobbyState {
  const players = Object.fromEntries(
    Object.values(state.players)
      .filter((p) => p.status === "active")
      .map((p) => [p.id, { ...p, teamId: null, waiting: false }]),
  );
  return {
    ...state,
    phase: "lobby",
    players,
    teams: {},
    teamOrder: [],
    draft: null,
    lastDraw: null,
    phrases: {},
    game: null,
  };
}

/** Server alarm at the turn deadline (D31). */
export function turnTick(state: LobbyState, ctx: Ctx): Result {
  return done(
    timeUp(state, ctx.now) ? toReview(state, "timer", ctx.now) : state,
  );
}

/**
 * Runs after every transition so the game can't get stuck on someone who
 * left (D8, D31): a dropped active player ends their turn, a dropped
 * up-next player is replaced by their next teammate, and a round intro
 * advances once every connected player has acknowledged.
 */
export function normalizeGame(state: LobbyState, now: number): LobbyState {
  let game = state.game;
  if (!game) return state;
  let current = state;

  // Forget anyone who was kicked.
  const ids = new Set(Object.keys(state.players));
  if (
    game.acknowledged.some((id) => !ids.has(id)) ||
    game.owed.some((id) => !ids.has(id)) ||
    Object.keys(game.playerScores).some((id) => !ids.has(id))
  ) {
    game = {
      ...game,
      acknowledged: game.acknowledged.filter((id) => ids.has(id)),
      owed: game.owed.filter((id) => ids.has(id)),
      playerScores: Object.fromEntries(
        Object.entries(game.playerScores).filter(([id]) => ids.has(id)),
      ),
    };
    current = { ...current, game };
  }

  const turn = game.turn;
  if (turn) {
    const p = state.players[turn.playerId];
    const gone =
      p?.status !== "active" || p.waiting || p.teamId !== turn.teamId;
    if (gone && current.phase === "turnActive") {
      current = toReview(current, "left", now);
    } else if (
      gone &&
      (current.phase === "turnReady" || current.phase === "roundIntro")
    ) {
      const teamIndex = Math.max(0, state.teamOrder.indexOf(turn.teamId));
      const prepared = prepare(
        current,
        { ...game, turn: null },
        teamIndex,
        turnLength(state),
      );
      // In a round intro only a carried-over turn is pre-set; otherwise wait for beginRound.
      current = {
        ...current,
        game:
          current.phase === "roundIntro" ? { ...game, turn: null } : prepared,
      };
    }
  }

  game = current.game;
  if (game && current.phase === "turnReady" && !game.turn) {
    const prepared = prepare(
      current,
      game,
      game.teamCursor,
      turnLength(current),
    );
    if (prepared.turn) current = { ...current, game: prepared };
  }

  game = current.game;
  if (game && current.phase === "roundIntro") {
    const needed = eligible(current).filter((p) => p.status === "active");
    if (
      needed.length > 0 &&
      needed.every((p) => game?.acknowledged.includes(p.id))
    )
      current = enterTurnReady(current);
  }
  return current;
}
