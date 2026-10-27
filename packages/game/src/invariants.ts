import { isValidCode } from "./code";
import { ConfigSchema } from "./config";
import { PHRASE_MAX_LEN, SCHEMA_VERSION } from "./constants";
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
  for (const [id, phrase] of Object.entries(state.phrases)) {
    if (phrase.id !== id || !state.players[phrase.authorId])
      err("invalid phrase author/id");
    if (
      !state.players[phrase.authorId]?.teamId ||
      state.players[phrase.authorId]?.waiting
    )
      err("phrase author is not an eligible team member");
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
      Object.values(state.phrases).filter((p) => p.authorId === id).length >
      state.config.phrasesPerPlayer
    )
      err("phrase quota exceeded");
  return errors;
}
