import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { type Action, createLobby, reduce } from "./reducer";
import { deepFreeze, makeIds, T0 } from "./test/helpers";
import type { LobbyState } from "./types";

// Throws random sequences of valid, semi-valid and garbage messages from
// random actors at the reducer, going through the same zod gate as the shell.
// Properties: never throws, never mutates its input, never produces a state
// that breaks an invariant, and leaves state untouched on error (§6.5).

const KINDS = [
  "join",
  "updateConfig",
  "kick",
  "rename",
  "setGamemaster",
  "startTeams",
  "nameTeam",
  "addToTeam",
  "removeFromTeam",
  "confirmTeams",
  "draftTick",
  "submitPhrase",
  "deletePhrase",
  "presence",
  "touch",
  "screen",
  "junk",
] as const;

const step = fc.record({
  kind: fc.constantFrom(...KINDS),
  actor: fc.nat(),
  // Half the time act as the current game master, so GM-only actions get exercised.
  asHost: fc.boolean(),
  target: fc.nat(),
  mask: fc.nat(),
  name: fc.oneof(
    fc.constantFrom(
      "Hazel",
      "Alex",
      "alex",
      " SAM ",
      "Drew",
      "",
      "x".repeat(25),
    ),
    fc.string(),
  ),
  num: fc.integer({ min: -10, max: 300 }),
  str: fc.oneof(
    fc.constantFrom("off", "invalid", "all", "names", "both"),
    fc.string(),
  ),
  useToken: fc.boolean(),
  junk: fc.anything(),
});

type Step = typeof step extends fc.Arbitrary<infer S> ? S : never;

function toAction(
  state: LobbyState,
  s: Step,
): { actor: string | null; action: Action | null } {
  const players = Object.values(state.players);
  const pick = (n: number) => {
    const options = [...players.map((p) => p.id), "ghost"];
    return options[n % options.length] as string;
  };
  const actorChoice = s.actor % (players.length + 1);
  const chosen =
    actorChoice === players.length ? null : (players[actorChoice]?.id ?? null);
  // Joins normally come from unjoined sockets, as in the shell; asHost covers
  // the "already joined" path.
  const actor =
    s.kind === "join"
      ? s.asHost
        ? state.roles.gamemasterId
        : null
      : s.asHost
        ? state.roles.gamemasterId
        : chosen;

  if (s.kind === "presence") {
    const active: string[] = [];
    const inactive: string[] = [];
    players.forEach((p, i) => {
      const bits = (s.mask >> (i * 2)) & 3;
      if (bits === 1) active.push(p.id);
      if (bits === 2) inactive.push(p.id);
    });
    return { actor: null, action: { type: "_presence", active, inactive } };
  }
  if (s.kind === "draftTick")
    return { actor: null, action: { type: "_draftTick" } };
  if (s.kind === "touch") return { actor: null, action: { type: "_touch" } };

  const target = pick(s.target);
  const teamId =
    state.teamOrder[s.mask % Math.max(1, state.teamOrder.length)] ??
    "ghost-team";
  const raw: unknown = {
    join: {
      type: "join",
      name: s.name,
      ...(s.useToken ? { token: state.players[target]?.token ?? s.str } : {}),
    },
    updateConfig: {
      type: "updateConfig",
      config: [
        { roundLengthSec: s.num },
        { teamCount: s.num },
        { maxPlayers: s.num },
        { phrasesPerPlayer: s.num, maxWordsPerPhrase: s.num },
        { profanityFilter: s.str },
        { moderation: s.str }, // removed field: must be rejected
      ][s.mask % 6],
    },
    kick: { type: "kick", playerId: target },
    rename: { type: "rename", playerId: target, name: s.name },
    setGamemaster: { type: "setGamemaster", playerId: target },
    startTeams: { type: "startTeams" },
    nameTeam: { type: "nameTeam", teamId, name: s.name },
    addToTeam: {
      type: "addToTeam",
      teamId,
      playerId: s.useToken ? "random" : target,
    },
    removeFromTeam: { type: "removeFromTeam", teamId, playerId: target },
    confirmTeams: { type: "confirmTeams" },
    submitPhrase: { type: "submitPhrase", text: s.name },
    deletePhrase: {
      type: "deletePhrase",
      phraseId:
        Object.keys(state.phrases)[
          s.mask % Math.max(1, Object.keys(state.phrases).length)
        ] ?? "missing",
    },
    screen: { type: "screen", token: s.useToken ? state.screenToken : s.str },
    junk: s.junk,
  }[s.kind];

  const parsed = ClientMessage.safeParse(raw);
  if (!parsed.success || parsed.data.type === "create")
    return { actor, action: null };
  return { actor, action: parsed.data };
}

describe("reducer properties", () => {
  it("survives arbitrary message sequences with invariants intact", () => {
    const succeeded = new Map<string, number>();
    fc.assert(
      fc.property(
        fc.array(step, { minLength: 20, maxLength: 80, size: "max" }),
        (steps) => {
          const newId = makeIds();
          let now = T0;
          const created = createLobby("ABCD", { actorId: null, now, newId });
          if (!created.ok) throw new Error("setup failed");
          // Start with one player (the GM) so GM actions have someone to act as.
          const first = reduce(
            created.state,
            { type: "join", name: "Hazel" },
            { actorId: null, now, newId },
          );
          if (!first.ok) throw new Error("setup failed");
          let state = first.state;

          for (const s of steps) {
            now += 1000;
            const { actor, action } = toAction(state, s);
            if (!action) continue; // rejected at the schema gate, like the shell does
            const before = JSON.stringify(state);
            const result = reduce(deepFreeze(state), action, {
              actorId: actor,
              now,
              newId,
            });
            expect(JSON.stringify(state)).toBe(before);
            if (result.ok) {
              expect(checkInvariants(result.state)).toEqual([]);
              state = result.state;
              succeeded.set(action.type, (succeeded.get(action.type) ?? 0) + 1);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
    // Guard against a vacuous test: every kind of action must have actually succeeded.
    for (const type of [
      "join",
      "updateConfig",
      "kick",
      "rename",
      "setGamemaster",
      "screen",
      "_presence",
    ]) {
      expect(succeeded.get(type) ?? 0, type).toBeGreaterThan(0);
    }
  });
});
