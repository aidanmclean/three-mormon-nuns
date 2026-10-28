import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { type Action, reduce } from "./reducer";
import { startedGame } from "./test/game";
import { deepFreeze, makeIds } from "./test/helpers";
import type { LobbyState } from "./types";

// Random sequences of turn buttons, GM controls, clock jumps, disconnects,
// joins, kicks and garbage, starting from a real game. Properties: the
// reducer never throws, never mutates its input, and never produces a state
// that breaks an invariant (D10, §6.5).

const KINDS = [
  "next",
  "back",
  "forward",
  "acknowledge",
  "emote",
  "startTurn",
  "pauseTimer",
  "resumeTimer",
  "addTime",
  "endTurn",
  "proceed",
  "restartPrevTurn",
  "reveal",
  "beginRound",
  "playAgain",
  "startGame",
  "tick",
  "presence",
  "join",
  "kick",
  "addToTeam",
  "junk",
] as const;

const step = fc.record({
  kind: fc.constantFrom(...KINDS),
  who: fc.constantFrom("gm", "player", "random", "nobody"),
  pick: fc.nat(),
  ms: fc.integer({ min: -70_000, max: 70_000 }),
  wait: fc.integer({ min: 0, max: 20_000 }),
  mask: fc.nat(),
  junk: fc.anything(),
});
type Step = typeof step extends fc.Arbitrary<infer S> ? S : never;

function actorFor(state: LobbyState, s: Step): string | null {
  const ids = Object.keys(state.players);
  if (s.who === "gm") return state.roles.gamemasterId;
  if (s.who === "player") return state.game?.turn?.playerId ?? null;
  if (s.who === "random") return ids[s.pick % Math.max(1, ids.length)] ?? null;
  return null;
}

function actionFor(state: LobbyState, s: Step): Action | "tick" | null {
  const ids = Object.keys(state.players);
  const someone = ids[s.pick % Math.max(1, ids.length)] ?? "ghost";
  const raw: unknown =
    s.kind === "addTime"
      ? { type: "addTime", ms: s.ms }
      : s.kind === "restartPrevTurn"
        ? { type: "restartPrevTurn", ms: Math.abs(s.ms) }
        : s.kind === "emote"
          ? { type: "emote", kind: ["laugh", "tomato", "nope"][s.pick % 3] }
          : s.kind === "join"
            ? { type: "join", name: `New ${s.pick % 5}` }
            : s.kind === "kick"
              ? { type: "kick", playerId: someone }
              : s.kind === "addToTeam"
                ? {
                    type: "addToTeam",
                    teamId: state.teamOrder[s.pick % 2] ?? "team-1",
                    playerId: someone,
                  }
                : s.kind === "junk"
                  ? s.junk
                  : { type: s.kind };
  if (s.kind === "tick") return "tick";
  if (s.kind === "presence") {
    const active: string[] = [];
    const inactive: string[] = [];
    ids.forEach((id, i) => {
      const bits = (s.mask >> (i * 2)) & 3;
      if (bits === 1) active.push(id);
      if (bits === 2) inactive.push(id);
    });
    return { type: "_presence", active, inactive };
  }
  const parsed = ClientMessage.safeParse(raw);
  return parsed.success && parsed.data.type !== "create" ? parsed.data : null;
}

describe("game loop properties", () => {
  it("survives arbitrary play with invariants intact", () => {
    const succeeded = new Map<string, number>();
    fc.assert(
      fc.property(
        fc.array(step, { minLength: 30, maxLength: 90, size: "max" }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (steps, seed) => {
          const { l } = startedGame({
            phrasesPerPlayer: 1,
            roundLengthSec: 15,
          });
          let state = l.state;
          let now = 10_000_000;
          let r = seed;
          const rng = () => {
            r = (r * 1103515245 + 12345) % 2 ** 31;
            return r / 2 ** 31;
          };
          const newId = makeIds();
          for (const s of steps) {
            const action = actionFor(state, s);
            if (!action) continue;
            let run: Action =
              action === "tick" ? { type: "_turnTick" } : action;
            if (action === "tick") now += s.wait;
            const actorId =
              run.type.startsWith("_") || run.type === "join"
                ? null
                : actorFor(state, s);
            if (run.type === "join") run = { ...run, token: undefined };
            const before = JSON.stringify(state);
            const result = reduce(deepFreeze(state), run, {
              actorId,
              now,
              newId: () => `g${newId()}`,
              rng,
            });
            expect(JSON.stringify(state)).toBe(before);
            if (result.ok) {
              expect(checkInvariants(result.state), run.type).toEqual([]);
              if (result.state !== state || result.effects.length)
                succeeded.set(run.type, (succeeded.get(run.type) ?? 0) + 1);
              state = result.state;
            }
            now += 500;
          }
        },
      ),
      { numRuns: 150 },
    );
    // Guard against a vacuous test: the core loop really ran.
    for (const type of [
      "next",
      "back",
      "startTurn",
      "endTurn",
      "proceed",
      "pauseTimer",
      "resumeTimer",
      "addTime",
      "restartPrevTurn",
      "_turnTick",
      "emote",
    ])
      expect(succeeded.get(type) ?? 0, type).toBeGreaterThan(0);
  });
});
