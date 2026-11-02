import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { SKILL_POINTS, WHEEL_REVEAL_MS, WHEEL_SPIN_MS } from "./constants";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { createLobby, reduce } from "./reducer";
import { makeIds, ok } from "./test/helpers";
import type { LobbyState, Skill } from "./types";
import { viewFor } from "./view";

// Skill levels (D51): picked when joining, and the wheel balances teams by them.

/** A small seeded generator, so each run of a test is repeatable. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Joins everyone with their skill, then spins the wheel to the end. */
function draftWith(
  people: [string, Skill][],
  teamCount: number,
  rng: () => number,
  config: Partial<Config> = {},
) {
  const newId = makeIds();
  let now = 1_000;
  const ctx = (actorId: string | null) => ({ actorId, now, newId, rng });
  let state: LobbyState = ok(createLobby("ABCD", ctx(null))).state;
  const ids: Record<string, string> = {};
  for (const [name, skill] of people) {
    const r = ok(reduce(state, { type: "join", name, skill }, ctx(null)));
    state = r.state;
    const bound = r.effects.find((e) => e.type === "bound");
    if (bound?.type === "bound") ids[name] = bound.playerId;
  }
  const gm = ids[people[0]?.[0] ?? ""] ?? null;
  state = ok(
    reduce(
      state,
      { type: "updateConfig", config: { teamCount, ...config } },
      ctx(gm),
    ),
  ).state;
  state = ok(reduce(state, { type: "startTeams" }, ctx(gm))).state;
  const wheelOrder = (state.lastDraw?.candidates ?? []).map((c) => c.name);
  for (let i = 0; i < 100 && state.draft?.stage !== "complete"; i++) {
    now += WHEEL_SPIN_MS + WHEEL_REVEAL_MS;
    state = ok(reduce(state, { type: "_draftTick" }, ctx(null))).state;
    expect(checkInvariants(state)).toEqual([]);
  }
  expect(state.draft?.stage).toBe("complete");
  const teams = state.teamOrder.map((id) => {
    const members = state.teams[id]?.memberIds ?? [];
    return {
      size: members.length,
      points: members.reduce(
        (n, m) => n + SKILL_POINTS[state.players[m]?.skill ?? "intermediate"],
        0,
      ),
    };
  });
  return { state, ids, teams, wheelOrder };
}

describe("skill levels", () => {
  it("are picked on join, default to intermediate, and can be changed", () => {
    expect(
      ClientMessage.safeParse({ type: "join", name: "A", skill: "god" })
        .success,
    ).toBe(false);
    const { state, ids } = draftWith(
      [
        ["Alex", "expert"],
        ["Blair", "noob"],
      ],
      2,
      seeded(1),
    );
    // Only the GM (Alex, the first to join) sees everyone's level; players
    // see their own, and the TV none (D59).
    const level = (viewer: string | null, name: string) =>
      viewFor(state, viewer).players.find((p) => p.name === name)?.skill;
    expect(level(ids.Alex ?? null, "Alex")).toBe("expert");
    expect(level(ids.Alex ?? null, "Blair")).toBe("noob");
    expect(level(ids.Blair ?? null, "Blair")).toBe("noob");
    expect(level(ids.Blair ?? null, "Alex")).toBeNull();
    expect(level(null, "Alex")).toBeNull();

    // A join without one is intermediate; players can change their own.
    const ctx = (actorId: string | null) => ({
      actorId,
      now: 5_000,
      newId: makeIds(),
    });
    const fresh = ok(createLobby("WXYZ", ctx(null))).state;
    const joined = ok(
      reduce(fresh, { type: "join", name: "Casey" }, ctx(null)),
    );
    const casey = Object.values(joined.state.players)[0];
    expect(casey?.skill).toBe("intermediate");
    const changed = ok(
      reduce(
        joined.state,
        { type: "setSkill", skill: "expert" },
        ctx(casey?.id ?? null),
      ),
    );
    expect(changed.state.players[casey?.id ?? ""]?.skill).toBe("expert");
    expect(ids.Alex).toBeTruthy();
  });

  it("keeps the skill on a token rejoin, and updates it on a name rejoin", () => {
    const newId = makeIds();
    const ctx = (actorId: string | null) => ({ actorId, now: 1, newId });
    let state = ok(createLobby("ABCD", ctx(null))).state;
    const first = ok(
      reduce(state, { type: "join", name: "Alex", skill: "noob" }, ctx(null)),
    );
    state = first.state;
    const id = Object.keys(state.players)[0] ?? "";
    const token = state.players[id]?.token ?? "";
    state = ok(
      reduce(
        state,
        { type: "_presence", active: [], inactive: [id] },
        ctx(null),
      ),
    ).state;
    state = ok(
      reduce(
        state,
        { type: "join", name: "Alex", token, skill: "expert" },
        ctx(null),
      ),
    ).state;
    expect(state.players[id]?.skill).toBe("noob");
    state = ok(
      reduce(
        state,
        { type: "_presence", active: [], inactive: [id] },
        ctx(null),
      ),
    ).state;
    state = ok(
      reduce(state, { type: "join", name: "alex", skill: "expert" }, ctx(null)),
    ).state;
    expect(state.players[id]?.skill).toBe("expert");
  });
});

describe("the wheel balances teams by skill (D51)", () => {
  it("splits experts and noobs evenly, whatever the draw", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { teams } = draftWith(
        [
          ["Alex", "expert"],
          ["Blair", "expert"],
          ["Casey", "intermediate"],
          ["Drew", "intermediate"],
          ["Emery", "noob"],
          ["Frankie", "noob"],
        ],
        2,
        seeded(seed),
      );
      expect(teams.map((t) => t.size)).toEqual([3, 3]);
      expect(teams.map((t) => t.points)).toEqual([6, 6]);
    }
  });

  it("keeps sizes within one and points close with three teams", () => {
    const skills: Skill[] = ["expert", "noob", "intermediate"];
    for (let seed = 1; seed <= 40; seed++) {
      const { teams } = draftWith(
        ["A", "B", "C", "D", "E", "F", "G", "H"].map(
          (n, i) => [n, skills[i % 3] ?? "noob"] as [string, Skill],
        ),
        3,
        seeded(seed),
      );
      const sizes = teams.map((t) => t.size);
      const points = teams.map((t) => t.points);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(Math.max(...points) - Math.min(...points)).toBeLessThanOrEqual(2);
    }
  });

  it("still draws different captains from run to run", () => {
    const captains = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = draftWith(
        [
          ["Alex", "intermediate"],
          ["Blair", "intermediate"],
          ["Casey", "intermediate"],
          ["Drew", "intermediate"],
        ],
        2,
        seeded(seed),
      );
      captains.add(state.teams["team-1"]?.captainId ?? "");
    }
    expect(captains.size).toBeGreaterThan(1);
  });

  it("ignores skill when the house rule is off: every draw is uniform (D58)", () => {
    const people: [string, Skill][] = [
      ["Alex", "expert"],
      ["Blair", "expert"],
      ["Casey", "intermediate"],
      ["Drew", "intermediate"],
      ["Emery", "noob"],
      ["Frankie", "noob"],
    ];
    const splits = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { teams } = draftWith(people, 2, seeded(seed), {
        balanceTeams: false,
      });
      expect(teams.map((t) => t.size)).toEqual([3, 3]);
      splits.add(teams.map((t) => t.points).join("-"));
    }
    // Some drafts come out lopsided, which the balanced wheel never does.
    expect([...splits].some((s) => s !== "6-6")).toBe(true);
  });

  it("shows the wheel's names in a shuffled order, not join order", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 10; seed++)
      orders.add(
        draftWith(
          [
            ["Alex", "intermediate"],
            ["Blair", "intermediate"],
            ["Casey", "intermediate"],
            ["Drew", "intermediate"],
          ],
          2,
          seeded(seed),
        ).wheelOrder.join(),
      );
    expect(orders.size).toBeGreaterThan(1);
  });
});
