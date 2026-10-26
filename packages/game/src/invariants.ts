import { isValidCode } from "./code";
import { ConfigSchema } from "./config";
import { SCHEMA_VERSION } from "./constants";
import { nameKey, validateName } from "./names";
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
    if (p.teamId !== null) err(`teamId set before teams exist (${id})`);
  }

  // The GM is the one in control (D18): there must be one as soon as anyone
  // has joined, and they must be connected whenever anyone is.
  const { gamemasterId, cavanId } = state.roles;
  const gm = gamemasterId === null ? undefined : state.players[gamemasterId];
  if (gamemasterId !== null && !gm) err("game master missing");
  if (players.length > 0 && gamemasterId === null)
    err("players but no game master");
  if (players.length === 0 && gamemasterId !== null)
    err("game master without players");
  if (cavanId !== null && !state.players[cavanId]) err("cavan missing");

  const anyActive = players.some(([, p]) => p.status === "active");
  if (anyActive && gm?.status !== "active")
    err("game master inactive while others are active");

  return errors;
}
