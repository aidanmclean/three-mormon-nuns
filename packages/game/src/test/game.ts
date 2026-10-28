import { expect } from "vitest";
import type { Config } from "../config";
import { checkInvariants } from "../invariants";
import type { LobbyState } from "../types";
import { finishDraft } from "./draft";
import { lobbyWith, ok } from "./helpers";

export const NAMES = ["Alex", "Blair", "Casey", "Drew"];

/** Lobby → wheel → named teams → writing, with optional config set in the lobby. */
export function writingLobby(
  config: Partial<Config> = {},
  names: string[] = NAMES,
) {
  const l = lobbyWith(...names);
  const gm = l.id(names[0] ?? "");
  if (Object.keys(config).length)
    ok(l.act(gm, { type: "updateConfig", config }));
  ok(l.act(gm, { type: "startTeams" }));
  finishDraft(l);
  l.state.teamOrder.forEach((teamId, i) => {
    ok(
      l.act(l.state.teams[teamId]?.captainId ?? null, {
        type: "nameTeam",
        teamId,
        name: `Team ${String.fromCharCode(65 + i)}`,
      }),
    );
  });
  ok(l.act(gm, { type: "confirmTeams" }));
  expect(l.state.phase).toBe("writing");
  return l;
}

const WORDS = ["one", "two", "three", "four", "five"];

/** Everyone writes their full quota of unique phrases. */
export function writeAll(l: ReturnType<typeof lobbyWith>, skip: string[] = []) {
  for (const p of Object.values(l.state.players)) {
    if (skip.includes(p.name) || !p.teamId) continue;
    for (let i = 0; i < l.state.config.phrasesPerPlayer; i++)
      ok(l.act(p.id, { type: "submitPhrase", text: `${p.name} ${WORDS[i]}` }));
  }
}

/** A started game sitting in round 1's `turnReady`. */
export function startedGame(config: Partial<Config> = {}, names = NAMES) {
  const l = writingLobby(config, names);
  writeAll(l);
  const gm = l.id(names[0] ?? "");
  ok(l.act(gm, { type: "startGame" }));
  expect(l.state.phase).toBe("roundIntro");
  for (const p of Object.values(l.state.players))
    ok(l.act(p.id, { type: "acknowledge" }));
  expect(l.state.phase).toBe("turnReady");
  expect(checkInvariants(l.state)).toEqual([]);
  return { l, gm };
}

export const turn = (state: LobbyState) => {
  const t = state.game?.turn;
  if (!t) throw new Error("no turn");
  return t;
};

/** GM starts the turn and the countdown finishes. */
export function startTurn(l: ReturnType<typeof lobbyWith>, gm: string) {
  ok(l.act(gm, { type: "startTurn" }, () => 0));
  l.tick(3_000);
}
