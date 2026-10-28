import { isValidCode } from "./code";
import { ConfigSchema } from "./config";
import {
  PHRASE_MAX_LEN,
  ROUNDS,
  SCHEMA_VERSION,
  TURN_MAX_MS,
} from "./constants";
import { inGame } from "./game";
import { cleanName, nameKey, validateName } from "./names";
import type { LobbyState } from "./types";

/**
 * Returns every rule `state` breaks (empty = valid). The shell runs this
 * after every transition and rejects any that would produce a broken lobby
 * (§6.5). Add a rule here whenever you add state.
 */
export function checkInvariants(state: LobbyState): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  if (state.schemaVersion !== SCHEMA_VERSION)
    err(`schemaVersion ${state.schemaVersion}`);
  if (!isValidCode(state.code)) err(`invalid code ${state.code}`);
  if (!ConfigSchema.safeParse(state.config).success) err("config out of range");
  if (state.expiresAt < state.createdAt) err("expiresAt before createdAt");

  if (!state.screenToken) err("missing screenToken");

  const players = Object.entries(state.players);
  if (players.length > state.config.maxPlayers)
    err("more players than maxPlayers");

  const keys = new Set<string>();
  for (const [id, p] of players) {
    if (p.id !== id) err(`player key ${id} != id ${p.id}`);
    const check = validateName(p.name);
    if (!check.ok || check.name !== p.name) err(`invalid name for ${id}`);
    const key = nameKey(p.name);
    if (keys.has(key)) err(`duplicate name ${p.name}`);
    keys.add(key);
    if (!p.token) err(`missing token for ${id}`);
    if (p.token === state.screenToken)
      err(`player ${id} shares the screen token`);
    if (p.teamId !== null && !state.teams[p.teamId])
      err(`missing team for ${id}`);
  }

  // The GM is the one in control (D18): there must be one as soon as anyone
  // has joined, and they must be connected whenever anyone is.
  const { gamemasterId } = state.roles;
  const gm = gamemasterId === null ? undefined : state.players[gamemasterId];
  if (gamemasterId !== null && !gm) err("game master missing");
  if (players.length > 0 && gamemasterId === null)
    err("players but no game master");
  if (players.length === 0 && gamemasterId !== null)
    err("game master without players");

  const { cavanId } = state.roles;
  if (cavanId !== null && !state.players[cavanId]) err("cavan missing");

  const anyActive = players.some(([, p]) => p.status === "active");
  if (anyActive && gm?.status !== "active")
    err("game master inactive while others are active");

  if (
    new Set(state.teamOrder).size !== state.teamOrder.length ||
    state.teamOrder.length !== Object.keys(state.teams).length
  )
    err("invalid team order");
  if (state.phase === "lobby" && state.teamOrder.length)
    err("teams before team selection");
  if (
    state.phase !== "lobby" &&
    state.teamOrder.length !== state.config.teamCount
  )
    err("wrong number of teams");
  for (const id of state.teamOrder) {
    const team = state.teams[id];
    if (!team || team.id !== id) {
      err("missing team in order");
      continue;
    }
    const name = validateName(team.name);
    if (!name.ok || name.name !== team.name) err("invalid team name");
    if (typeof team.nameConfirmed !== "boolean")
      err("invalid team name confirmation");
    const members = players
      .filter(([, p]) => p.teamId === id)
      .map(([pid]) => pid);
    if (
      team.memberIds.length !== members.length ||
      new Set(team.memberIds).size !== members.length ||
      members.some((pid) => !team.memberIds.includes(pid))
    )
      err("team membership mismatch");
    if (
      team.captainId === null
        ? members.length > 0
        : !members.includes(team.captainId)
    )
      err("invalid captain");
    if (
      members.some((pid) => state.players[pid]?.status === "active") &&
      (!team.captainId || state.players[team.captainId]?.status !== "active")
    )
      err("inactive captain");
  }
  if (
    new Set(Object.values(state.teams).map((team) => nameKey(team.name)))
      .size !== state.teamOrder.length
  )
    err("duplicate team name");
  if (state.config.teamCount > state.config.maxPlayers)
    err("more teams than capacity");
  if (state.phase === "lobby" && state.draft) err("draft in lobby");
  if (state.phase !== "lobby" && !state.draft) err("missing draft");
  if (state.draft) {
    if (state.draft.mode !== "wheel" && state.draft.mode !== "manual")
      err("invalid team mode");
    if (state.draft.mode === "manual" && state.draft.stage !== "complete")
      err("manual teams with a running wheel");
    if (state.draft.stage !== "complete" && state.phase !== "teams")
      err("draft running outside teams");
    if (
      state.draft.nextTeamIndex < 0 ||
      state.draft.nextTeamIndex >= state.teamOrder.length
    )
      err("invalid next draft team");
    if (
      new Set(state.draft.remainingIds).size !== state.draft.remainingIds.length
    )
      err("duplicate draft entry");
    if (
      state.draft.stage === "complete"
        ? state.draft.nextAt !== null
        : !Number.isFinite(state.draft.nextAt)
    )
      err("invalid draft deadline");
    if (state.draft.stage !== "complete" && !state.lastDraw)
      err("draft without spin");
    if (state.draft.stage === "complete" && state.draft.remainingIds.length)
      err("completed draft has remaining players");
  }
  if (state.lastDraw) {
    const draw = state.lastDraw;
    if (
      !state.teams[draw.teamId] ||
      !draw.candidates.some((p) => p.id === draw.playerId) ||
      new Set(draw.candidates.map((p) => p.id)).size !== draw.candidates.length
    )
      err("invalid wheel candidates/winner");
    if (
      !Number.isFinite(draw.startedAt) ||
      !Number.isFinite(draw.endsAt) ||
      draw.endsAt <= draw.startedAt
    )
      err("invalid wheel timing");
    if (state.draft?.stage === "spinning" && state.draft.nextAt !== draw.endsAt)
      err("spin deadline mismatch");
  }
  const phraseKeys = new Set<string>();
  const playing = inGame(state.phase);
  for (const [id, phrase] of Object.entries(state.phrases)) {
    if (phrase.id !== id) err("invalid phrase id");
    // Once the game starts, a kicked author's phrases stay in the pile (D31).
    if (!playing && !state.players[phrase.authorId])
      err("invalid phrase author");
    if (
      !playing &&
      (!state.players[phrase.authorId]?.teamId ||
        state.players[phrase.authorId]?.waiting)
    )
      err("phrase author is not an eligible team member");
    if (!["approved", "pending", "rejected"].includes(phrase.status))
      err("invalid phrase status");
    // Only Cavan's phrases wait for the GM, and only during writing (D30).
    if (
      phrase.status === "pending" &&
      (state.phase !== "writing" || phrase.authorId !== cavanId)
    )
      err("pending phrase outside Cavan's writing");
    if (
      !phrase.text ||
      cleanName(phrase.text) !== phrase.text ||
      [...phrase.text].length > PHRASE_MAX_LEN ||
      phrase.text.split(/\s+/u).length > state.config.maxWordsPerPhrase
    )
      err("invalid phrase text");
    const key = nameKey(phrase.text);
    if (phraseKeys.has(key)) err("duplicate phrase");
    phraseKeys.add(key);
  }
  for (const [id] of players)
    if (
      Object.values(state.phrases).filter(
        (p) => p.authorId === id && p.status !== "rejected",
      ).length > state.config.phrasesPerPlayer
    )
      err("phrase quota exceeded");
  checkGame(state, err);
  return errors;
}

/** Rules for rounds and turns (D13, D17, D31). */
function checkGame(state: LobbyState, err: (msg: string) => void) {
  const game = state.game;
  if (inGame(state.phase) !== (game !== null)) err("game state/phase mismatch");
  if (!game) return;
  if (!Number.isInteger(game.round) || game.round < 1 || game.round > ROUNDS)
    err("invalid round");
  const approved = new Set(
    Object.values(state.phrases)
      .filter((p) => p.status === "approved")
      .map((p) => p.id),
  );
  if (new Set(game.pile).size !== game.pile.length) err("duplicate pile entry");
  if (game.pile.some((id) => !approved.has(id)))
    err("pile has an unapproved phrase");
  if (state.phase !== "results" && game.pile.length === 0)
    err("empty pile mid-game");
  const scoreIds = Object.keys(game.scores);
  if (
    scoreIds.length !== state.teamOrder.length ||
    state.teamOrder.some(
      (id) => !Number.isInteger(game.scores[id]) || (game.scores[id] ?? -1) < 0,
    )
  )
    err("invalid scores");
  if (
    !Number.isInteger(game.teamCursor) ||
    game.teamCursor < 0 ||
    game.teamCursor >= Math.max(1, state.teamOrder.length)
  )
    err("invalid team cursor");
  if (
    Object.values(game.memberCursor).some((i) => !Number.isInteger(i) || i < 0)
  )
    err("invalid member cursor");
  if (new Set(game.acknowledged).size !== game.acknowledged.length)
    err("duplicate acknowledgement");

  const turn = game.turn;
  const live = state.phase === "turnActive" || state.phase === "turnReview";
  if (live && !turn) err("live phase without a turn");
  if (state.phase === "results" && turn) err("turn after the game ended");
  if (state.phase === "roundIntro" && turn && !turn.carried)
    err("non-carried turn during round intro");
  if (!turn) return;
  if (!state.teams[turn.teamId]) err("turn for a missing team");
  if (new Set(turn.seen).size !== turn.seen.length)
    err("phrase shown twice in a turn");
  if (turn.seen.some((id) => !game.pile.includes(id)))
    err("shown phrase not in the pile");
  if (
    !(
      0 <= turn.cursor &&
      turn.cursor <= turn.maxCursor &&
      turn.maxCursor <= turn.seen.length
    )
  )
    err("invalid turn cursor");
  if (turn.remainingMs < 0 || turn.remainingMs > TURN_MAX_MS)
    err("invalid turn time");
  if (state.phase === "turnReady" || state.phase === "roundIntro") {
    if (turn.seen.length || turn.endedBy || turn.endsAt !== null || turn.paused)
      err("prepared turn already started");
  }
  if (state.phase === "turnActive") {
    if (turn.endedBy !== null) err("live turn marked ended");
    if (turn.paused !== (turn.endsAt === null)) err("paused/deadline mismatch");
    if (turn.seen.length === 0) err("live turn without a phrase");
  }
  if (
    state.phase === "turnReview" &&
    (turn.endedBy === null || turn.endsAt !== null)
  )
    err("review turn still running");
}
