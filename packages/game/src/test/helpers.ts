import {
  type Action,
  type Ctx,
  createLobby,
  type Result,
  reduce,
} from "../reducer";
import type { LobbyState, PlayerId } from "../types";

export const T0 = 1_000_000;

/** Deterministic ids: id1, id2, … */
export function makeIds() {
  let n = 0;
  return () => `id${++n}`;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function ok(result: Result) {
  if (!result.ok)
    throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result;
}

/**
 * A lobby created by a host screen, then joined by `names` in order, so the
 * first name is the game master (D18). Helpers act as a given player.
 */
export function lobbyWith(...names: string[]) {
  const newId = makeIds();
  let now = T0;
  const ctx = (actorId: PlayerId | null): Ctx => ({ actorId, now, newId });
  let state = ok(createLobby("ABCD", ctx(null))).state;
  const ids: Record<string, PlayerId> = {};
  for (const name of names) {
    const joined = ok(reduce(state, { type: "join", name }, ctx(null)));
    state = joined.state;
    const bound = joined.effects.find((e) => e.type === "bound");
    if (bound?.type === "bound") ids[name] = bound.playerId;
  }
  return {
    get state() {
      return state;
    },
    ids,
    /** The id of the named player; throws on typos. */
    id(name: string): PlayerId {
      const id = ids[name];
      if (!id) throw new Error(`no player ${name}`);
      return id;
    },
    tick(ms: number) {
      now += ms;
    },
    /** Runs an action as `actor` against a frozen state, so any mutation throws. */
    act(actor: PlayerId | null, action: Action): Result {
      const result = reduce(deepFreeze(state), action, ctx(actor));
      if (result.ok) state = result.state;
      return result;
    },
  };
}
