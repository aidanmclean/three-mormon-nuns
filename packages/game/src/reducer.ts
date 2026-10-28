import { isValidCode } from "./code";
import { type Config, ConfigSchema, DEFAULT_CONFIG } from "./config";
import { IDLE_EXPIRY_MS, SCHEMA_VERSION } from "./constants";
import { advanceDraft, changeTeam, spinRest, startDraft } from "./draft";
import {
  gmGameAction,
  inGame,
  normalizeGame,
  playerGameAction,
  turnTick,
} from "./game";
import { nameKey, validateName } from "./names";
import { moderationAction, phraseAction } from "./phrases";
import type { ClientMessage, EmoteKind, ErrorCode } from "./protocol";
import type { LobbyState, Player, PlayerId } from "./types";

/** Actions only the server shell issues. They aren't in ClientMessage, so clients can't send them. */
export type ServerAction =
  /** Presence transitions computed from socket heartbeats (D15). */
  | { type: "_presence"; active: PlayerId[]; inactive: PlayerId[] }
  /** Extends expiry while people are still connected. */
  | { type: "_touch" }
  | { type: "_draftTick" }
  /** The turn deadline passed (D31). */
  | { type: "_turnTick" };

export type Action = Exclude<ClientMessage, { type: "create" }> | ServerAction;

export interface Ctx {
  /** The player bound to the sending socket; null for unjoined sockets, the host screen and server actions. */
  actorId: PlayerId | null;
  now: number;
  /** Fresh random id (player ids, tokens). Injected for deterministic tests. */
  newId: () => string;
  /** Server-owned randomness; tests can supply a deterministic source. */
  rng?: () => number;
}

/** Side effects the shell must carry out (it owns the sockets). */
export type Effect =
  | { type: "bound"; playerId: PlayerId; token: string }
  | { type: "screenBound"; token: string }
  | { type: "kicked"; playerId: PlayerId }
  /** Broadcast a reaction; not a state change (D31). */
  | { type: "emote"; playerId: PlayerId; kind: EmoteKind };

export type Result =
  | { ok: true; state: LobbyState; effects: Effect[] }
  | { ok: false; code: ErrorCode; message: string };

const fail = (code: ErrorCode, message: string): Result => ({
  ok: false,
  code,
  message,
});
const done = (state: LobbyState, effects: Effect[] = []): Result => ({
  ok: true,
  state,
  effects,
});

const byJoinOrder = (a: Player, b: Player) =>
  a.joinedAt - b.joinedAt || a.id.localeCompare(b.id);

/**
 * Called by the host screen (D18). The lobby starts with no players; the
 * first player to join becomes game master.
 */
export function createLobby(
  code: string,
  ctx: Ctx,
  config: Config = DEFAULT_CONFIG,
): Result {
  if (!isValidCode(code))
    return fail("INVALID", "That isn't a valid lobby code.");
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success || parsed.data.teamCount > parsed.data.maxPlayers)
    return fail("INVALID", "Choose valid settings with room for every team.");
  const screenToken = ctx.newId();
  return done(
    {
      schemaVersion: SCHEMA_VERSION,
      code,
      phase: "lobby",
      config: parsed.data,
      players: {},
      teams: {},
      teamOrder: [],
      lastDraw: null,
      draft: null,
      phrases: {},
      game: null,
      screenToken,
      roles: { gamemasterId: null, cavanId: null },
      createdAt: ctx.now,
      expiresAt: ctx.now + IDLE_EXPIRY_MS,
    },
    [{ type: "screenBound", token: screenToken }],
  );
}

/**
 * Pure transition function. Never mutates `state` and never throws on bad
 * input; returns the same `state` object when nothing changed.
 */
export function reduce(state: LobbyState, action: Action, ctx: Ctx): Result {
  const result = apply(state, action, ctx);
  if (!result.ok || result.state === state) return result;
  let next = normalizeGame(
    normalizeRoles(normalizeTeams(result.state)),
    ctx.now,
  );
  // Presence sweeps run every few seconds and shouldn't count as activity.
  if (action.type !== "_presence")
    next = { ...next, expiresAt: ctx.now + IDLE_EXPIRY_MS };
  return { ...result, state: next };
}

function apply(state: LobbyState, action: Action, ctx: Ctx): Result {
  switch (action.type) {
    case "_presence":
      return presence(state, action.active, action.inactive);
    case "_draftTick":
      return advanceDraft(state, ctx);
    case "_turnTick":
      return turnTick(state, ctx);
    case "_touch":
      return done({ ...state });
    case "join":
      return join(state, action.name, action.token, ctx);
    case "screen":
      // The shell only lets unbound sockets send this.
      if (action.token !== state.screenToken) {
        return fail(
          "FORBIDDEN",
          "This browser does not have the host key for this room.",
        );
      }
      // Re-binding the screen isn't a state change; the effect is all that matters.
      return {
        ok: true,
        state,
        effects: [{ type: "screenBound", token: state.screenToken }],
      };
  }

  // Player identity comes from the socket binding (§6.3). Team actions have
  // player/captain permissions (D22); remaining controls belong to the GM.
  const actor = ctx.actorId === null ? undefined : state.players[ctx.actorId];
  if (!actor) return fail("NOT_JOINED", "Join the lobby first.");
  if (actor.status !== "active")
    return fail("FORBIDDEN", "Reconnect before making changes.");
  if (["nameTeam", "addToTeam", "removeFromTeam"].includes(action.type)) {
    return changeTeam(state, action, actor);
  }
  if (action.type === "submitPhrase" || action.type === "deletePhrase")
    return phraseAction(state, action, actor, ctx);
  // The active player's buttons, round intros and emotes (D31).
  if (["next", "back", "forward", "acknowledge", "emote"].includes(action.type))
    return playerGameAction(state, action, actor, ctx);
  if (actor.id !== state.roles.gamemasterId) {
    return fail("FORBIDDEN", "Only the game master can do that.");
  }
  if (["setCavan", "approvePhrase", "rejectPhrase"].includes(action.type))
    return moderationAction(state, action);
  if (
    [
      "startGame",
      "beginRound",
      "startTurn",
      "pauseTimer",
      "resumeTimer",
      "addTime",
      "endTurn",
      "proceed",
      "restartPrevTurn",
      "reveal",
      "skipTurn",
      "upNext",
      "playAgain",
    ].includes(action.type)
  )
    return gmGameAction(state, action, ctx);

  switch (action.type) {
    case "updateConfig": {
      if (state.phase !== "lobby")
        return fail("WRONG_PHASE", "Settings are locked once the game starts.");
      const parsed = ConfigSchema.safeParse({
        ...state.config,
        ...action.config,
      });
      if (!parsed.success)
        return fail("INVALID", "Those settings are out of range.");
      const config = parsed.data;
      if (config.teamCount > config.maxPlayers)
        return fail("INVALID", "There must be room for every team.");
      if (Object.keys(state.players).length > config.maxPlayers) {
        return fail("INVALID", "There are already more players than that.");
      }
      return done({ ...state, config });
    }
    case "startTeams":
      return startDraft(state, ctx, action.mode ?? "wheel");
    case "spinRest":
      return spinRest(state, ctx);
    case "confirmTeams": {
      if (state.phase !== "teams")
        return fail("WRONG_PHASE", "Select teams first.");
      if (state.draft?.stage !== "complete")
        return fail("INVALID", "Wait for the wheel to finish.");
      if (state.teamOrder.some((id) => !state.teams[id]?.nameConfirmed))
        return fail("INVALID", "Every captain must save a team name first.");
      if (
        Object.values(state.players).some(
          (p) => p.status === "active" && !p.waiting && !p.teamId,
        ) ||
        state.teamOrder.some(
          (id) =>
            !state.teams[id]?.memberIds.some(
              (pid) => state.players[pid]?.status === "active",
            ),
        )
      )
        return fail(
          "INVALID",
          "Give every connected player a team, with someone connected on every team.",
        );
      // From here on, anyone still unplaced (offline) waits for the GM (D34).
      const players = Object.fromEntries(
        Object.values(state.players).map((p) => [
          p.id,
          p.teamId ? p : { ...p, waiting: true },
        ]),
      );
      return done({ ...state, phase: "writing", players, lastDraw: null });
    }
    case "kick": {
      const target = state.players[action.playerId];
      if (!target) return fail("INVALID", "That player isn't in the lobby.");
      if (target.id === actor.id)
        return fail("INVALID", "You can't kick yourself.");
      const { [target.id]: _removed, ...players } = state.players;
      const roles = { ...state.roles };
      // Once the game has started their phrases stay in the pile (D31).
      const phrases = inGame(state.phase)
        ? state.phrases
        : Object.fromEntries(
            Object.entries(state.phrases).filter(
              ([, p]) => p.authorId !== target.id,
            ),
          );
      return done({ ...state, players, roles, phrases }, [
        { type: "kicked", playerId: target.id },
      ]);
    }
    case "rename": {
      const target = state.players[action.playerId];
      if (!target) return fail("INVALID", "That player isn't in the lobby.");
      const check = validateName(action.name);
      if (!check.ok) return fail("INVALID", check.message);
      if (findByName(state, check.name, target.id)) {
        return fail("NAME_TAKEN", `Someone is already called ${check.name}.`);
      }
      return done(withPlayer(state, { ...target, name: check.name }));
    }
    case "setGamemaster": {
      const target = state.players[action.playerId];
      if (!target) return fail("INVALID", "That player isn't in the lobby.");
      if (target.status !== "active")
        return fail("INVALID", `${target.name} isn't connected right now.`);
      if (target.id === state.roles.cavanId)
        return fail(
          "INVALID",
          "Cavan can't be game master: the GM vets Cavan.",
        );
      return done({
        ...state,
        roles: { ...state.roles, gamemasterId: target.id },
      });
    }
  }
  return fail("INVALID", "Unknown action.");
}

/** Join rules, in order (§5.6): token → inactive name → active name → new player. */
function join(
  state: LobbyState,
  rawName: string,
  token: string | undefined,
  ctx: Ctx,
): Result {
  if (ctx.actorId !== null && state.players[ctx.actorId])
    return fail("INVALID", "You've already joined.");

  if (token) {
    const owner = Object.values(state.players).find((p) => p.token === token);
    if (owner) return bind(state, owner, owner.token);
  }

  const check = validateName(rawName);
  if (!check.ok) return fail("INVALID", check.message);

  const existing = findByName(state, check.name);
  if (existing) {
    if (existing.status === "active") {
      return fail(
        "NAME_TAKEN",
        `${existing.name} is already playing. If that's you on another device, wait about 20 seconds and try again.`,
      );
    }
    // Rejoin as an inactive player, e.g. after a phone died. A new token
    // invalidates whatever device they were on before.
    return bind(state, existing, ctx.newId());
  }

  if (Object.keys(state.players).length >= state.config.maxPlayers) {
    return fail("LOBBY_FULL", "This lobby is full.");
  }
  // Until teams are final, newcomers join the pool of unplaced players; the
  // wheel draws them too if it's spinning (D34). After that they wait.
  const player = newPlayer(
    check.name,
    ctx,
    state.phase !== "lobby" && state.phase !== "teams",
  );
  return done(
    { ...state, players: { ...state.players, [player.id]: player } },
    [{ type: "bound", playerId: player.id, token: player.token }],
  );
}

function bind(state: LobbyState, player: Player, token: string): Result {
  const updated: Player = { ...player, status: "active", token };
  return done(withPlayer(state, updated), [
    { type: "bound", playerId: updated.id, token },
  ]);
}

function presence(
  state: LobbyState,
  active: PlayerId[],
  inactive: PlayerId[],
): Result {
  let players = state.players;
  const set = (ids: PlayerId[], status: Player["status"]) => {
    for (const id of ids) {
      const p = players[id];
      if (p && p.status !== status)
        players = { ...players, [id]: { ...p, status } };
    }
  };
  set(active, "active");
  set(inactive, "inactive");
  return done(players === state.players ? state : { ...state, players });
}

/**
 * Keeps someone connected in control so the game never gets stuck (§5.6):
 * the first player to join becomes GM, and if the GM drops, the role passes
 * to the earliest-joined active player.
 */
function normalizeRoles(state: LobbyState): LobbyState {
  let { gamemasterId, cavanId } = state.roles;
  if (cavanId !== null && !state.players[cavanId]) cavanId = null;
  const everyone = Object.values(state.players).sort(byJoinOrder);
  // Prefer someone other than Cavan, since the GM vets Cavan (D30).
  const firstActive =
    everyone.find((p) => p.status === "active" && p.id !== cavanId) ??
    everyone.find((p) => p.status === "active");

  const gm = gamemasterId === null ? undefined : state.players[gamemasterId];
  if (!gm || (gm.status !== "active" && firstActive)) {
    gamemasterId = firstActive?.id ?? everyone[0]?.id ?? null;
  }

  const { roles } = state;
  if (gamemasterId === roles.gamemasterId && cavanId === roles.cavanId)
    return state;
  return { ...state, roles: { gamemasterId, cavanId } };
}

function newPlayer(name: string, ctx: Ctx, waiting: boolean): Player {
  return {
    id: ctx.newId(),
    name,
    token: ctx.newId(),
    teamId: null,
    status: "active",
    waiting,
    joinedAt: ctx.now,
  };
}

function withPlayer(state: LobbyState, player: Player): LobbyState {
  return { ...state, players: { ...state.players, [player.id]: player } };
}

function findByName(
  state: LobbyState,
  name: string,
  exceptId?: PlayerId,
): Player | undefined {
  const key = nameKey(name);
  return Object.values(state.players).find(
    (p) => p.id !== exceptId && nameKey(p.name) === key,
  );
}

/** Membership has one source of truth; derive lists and repair captains after kicks/moves. */
function normalizeTeams(state: LobbyState): LobbyState {
  let changed = false;
  const teams = { ...state.teams };
  for (const id of state.teamOrder) {
    const team = teams[id];
    if (!team) continue;
    const members = Object.values(state.players)
      .filter((p) => p.teamId === id)
      .sort(byJoinOrder);
    const memberIds = [
      ...team.memberIds.filter((pid) => members.some((p) => p.id === pid)),
      ...members.filter((p) => !team.memberIds.includes(p.id)).map((p) => p.id),
    ];
    const orderedMembers = memberIds.flatMap((pid) =>
      state.players[pid] ? [state.players[pid]] : [],
    );
    const captainId =
      members.find((p) => p.id === team.captainId && p.status === "active")
        ?.id ??
      orderedMembers.find((p) => p.status === "active")?.id ??
      orderedMembers[0]?.id ??
      null;
    if (
      captainId !== team.captainId ||
      memberIds.join(",") !== team.memberIds.join(",")
    ) {
      teams[id] = { ...team, captainId, memberIds };
      changed = true;
    }
  }
  return changed ? { ...state, teams } : state;
}
