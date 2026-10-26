import { isValidCode } from "./code";
import { ConfigSchema, DEFAULT_CONFIG } from "./config";
import { IDLE_EXPIRY_MS, SCHEMA_VERSION } from "./constants";
import { nameKey, validateName } from "./names";
import type { ClientMessage, ErrorCode } from "./protocol";
import type { LobbyState, Phase, Player, PlayerId } from "./types";

/** Actions only the server shell issues. They aren't in ClientMessage, so clients can't send them. */
export type ServerAction =
  /** Presence transitions computed from socket heartbeats (D15). */
  | { type: "_presence"; active: PlayerId[]; inactive: PlayerId[] }
  /** Extends expiry while people are still connected. */
  | { type: "_touch" };

export type Action = Exclude<ClientMessage, { type: "create" }> | ServerAction;

export interface Ctx {
  /** The player bound to the sending socket; null for unjoined sockets, the host screen and server actions. */
  actorId: PlayerId | null;
  now: number;
  /** Fresh random id (player ids, tokens). Injected for deterministic tests. */
  newId: () => string;
}

/** Side effects the shell must carry out (it owns the sockets). */
export type Effect =
  | { type: "bound"; playerId: PlayerId; token: string }
  | { type: "screenBound"; token: string }
  | { type: "kicked"; playerId: PlayerId };

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

/** Phases in which the game master may still change who Cavan is. */
const CAVAN_PHASES: Phase[] = ["lobby", "teams", "writing"];

/**
 * Called by the host screen (D18). The lobby starts with no players; the
 * first player to join becomes game master.
 */
export function createLobby(code: string, ctx: Ctx): Result {
  if (!isValidCode(code))
    return fail("INVALID", "That isn't a valid lobby code.");
  const screenToken = ctx.newId();
  return done(
    {
      schemaVersion: SCHEMA_VERSION,
      code,
      phase: "lobby",
      config: { ...DEFAULT_CONFIG },
      players: {},
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
  let next = normalizeRoles(result.state);
  // Presence sweeps run every few seconds and shouldn't count as activity.
  if (action.type !== "_presence")
    next = { ...next, expiresAt: ctx.now + IDLE_EXPIRY_MS };
  return { ...result, state: next };
}

function apply(state: LobbyState, action: Action, ctx: Ctx): Result {
  switch (action.type) {
    case "_presence":
      return presence(state, action.active, action.inactive);
    case "_touch":
      return done({ ...state });
    case "join":
      return join(state, action.name, action.token, ctx);
    case "screen":
      // The shell only lets unbound sockets send this.
      if (action.token !== state.screenToken) {
        return fail(
          "FORBIDDEN",
          "This lobby is being hosted on another screen.",
        );
      }
      // Re-binding the screen isn't a state change; the effect is all that matters.
      return {
        ok: true,
        state,
        effects: [{ type: "screenBound", token: state.screenToken }],
      };
  }

  // Everything below needs a joined player, taken from the socket binding (§6.3),
  // and that player must be the game master: the GM controls the game (D18).
  const actor = ctx.actorId === null ? undefined : state.players[ctx.actorId];
  if (!actor) return fail("NOT_JOINED", "Join the lobby first.");
  if (actor.id !== state.roles.gamemasterId) {
    return fail("FORBIDDEN", "Only the game master can do that.");
  }

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
      if (Object.keys(state.players).length > config.maxPlayers) {
        return fail("INVALID", "There are already more players than that.");
      }
      return done({ ...state, config });
    }
    case "kick": {
      const target = state.players[action.playerId];
      if (!target) return fail("INVALID", "That player isn't in the lobby.");
      if (target.id === actor.id)
        return fail("INVALID", "You can't kick yourself.");
      const { [target.id]: _removed, ...players } = state.players;
      const roles = { ...state.roles };
      if (roles.cavanId === target.id) roles.cavanId = null;
      return done({ ...state, players, roles }, [
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
      return done({
        ...state,
        roles: { ...state.roles, gamemasterId: target.id },
      });
    }
    case "setCavan": {
      if (!CAVAN_PHASES.includes(state.phase)) {
        return fail(
          "WRONG_PHASE",
          "Cavan can't be changed once the game starts.",
        );
      }
      if (action.playerId !== null && !state.players[action.playerId]) {
        return fail("INVALID", "That player isn't in the lobby.");
      }
      return done({
        ...state,
        roles: { ...state.roles, cavanId: action.playerId },
      });
    }
  }
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
  const player = newPlayer(check.name, ctx, state.phase !== "lobby");
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
  const everyone = Object.values(state.players).sort(byJoinOrder);
  const firstActive = everyone.find((p) => p.status === "active");
  let { gamemasterId, cavanId } = state.roles;

  const gm = gamemasterId === null ? undefined : state.players[gamemasterId];
  if (!gm || (gm.status !== "active" && firstActive)) {
    gamemasterId = firstActive?.id ?? everyone[0]?.id ?? null;
  }
  if (cavanId !== null && !state.players[cavanId]) cavanId = null;

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
