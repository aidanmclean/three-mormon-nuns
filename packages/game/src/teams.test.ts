import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { WHEEL_SPIN_MS } from "./constants";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { createLobby } from "./reducer";
import { finishDraft, namedTeams } from "./test/draft";
import { lobbyWith, makeIds, ok, T0 } from "./test/helpers";

describe("creation and protocol", () => {
  it("applies the host configuration atomically and rejects invalid capacities", () => {
    const ctx = { actorId: null, now: T0, newId: makeIds() };
    const config = {
      ...DEFAULT_CONFIG,
      teamCount: 3,
      roundLengthSec: 75,
      maxPlayers: 12,
    };
    expect(ok(createLobby("ABCD", ctx, config)).state.config).toEqual(config);
    expect(
      createLobby("ABCD", ctx, { ...config, maxPlayers: 2 }),
    ).toMatchObject({ ok: false, code: "INVALID" });
    expect(
      ClientMessage.safeParse({
        type: "create",
        config: { ...config, roundLengthSec: 999 },
      }).success,
    ).toBe(false);
  });
  it("rejects self-selection, shuffle, and client timer/winner messages", () => {
    for (const action of [
      { type: "joinTeam", teamId: "team-1" },
      { type: "shuffleTeams" },
      { type: "_draftTick" },
      { type: "_turnTick" },
      { type: "spin", winner: "x" },
    ])
      expect(ClientMessage.safeParse(action).success).toBe(false);
  });
});

describe("the server wheel", () => {
  it("requires the GM and enough connected people, and does not restart", () => {
    const l = lobbyWith("Alex", "Blair");
    expect(l.act(l.id("Blair"), { type: "startTeams" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    ok(l.act(l.id("Alex"), { type: "updateConfig", config: { teamCount: 3 } }));
    expect(l.act(l.id("Alex"), { type: "startTeams" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    ok(l.act(l.id("Alex"), { type: "updateConfig", config: { teamCount: 2 } }));
    ok(l.act(l.id("Alex"), { type: "startTeams" }));
    expect(l.act(l.id("Alex"), { type: "startTeams" })).toMatchObject({
      ok: false,
      code: "WRONG_PHASE",
    });
  });
  it("persists the chosen result and time, assigns only at the deadline, and appoints first-drawn captains", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    ok(l.act(l.id("Alex"), { type: "startTeams" }, () => 0.99));
    expect(l.state.lastDraw?.playerId).toBe(l.id("Drew"));
    expect(l.state.lastDraw?.candidates).toHaveLength(4);
    expect(l.state.players[l.id("Drew")]?.teamId).toBeNull();
    const before = l.state;
    l.tick(WHEEL_SPIN_MS - 1);
    expect(ok(l.act(null, { type: "_draftTick" })).state).toBe(before);
    l.tick(1);
    ok(l.act(null, { type: "_draftTick" }));
    expect(l.state.teams["team-1"]?.captainId).toBe(l.id("Drew"));
    expect(l.state.draft?.stage).toBe("revealing");
    finishDraft(l);
    expect(l.state.teams["team-1"]?.captainId).toBe(l.id("Drew"));
    expect(l.state.teams["team-1"]?.memberIds[0]).toBe(l.id("Drew"));
    expect(Object.values(l.state.teams).map((t) => t.memberIds.length)).toEqual(
      [2, 2],
    );
  });
  it("assigns every eligible player exactly once, with balanced uneven teams", () => {
    const l = lobbyWith(
      "Alex",
      "Blair",
      "Casey",
      "Drew",
      "Emery",
      "Frankie",
      "Gray",
    );
    ok(l.act(l.id("Alex"), { type: "updateConfig", config: { teamCount: 3 } }));
    ok(l.act(l.id("Alex"), { type: "startTeams" }));
    finishDraft(l);
    const members = Object.values(l.state.teams).flatMap((t) => t.memberIds);
    expect(members).toHaveLength(7);
    expect(new Set(members).size).toBe(7);
    expect(
      Object.values(l.state.teams)
        .map((t) => t.memberIds.length)
        .sort(),
    ).toEqual([2, 2, 3]);
  });
  it("skips a kicked winner and continues; a mid-wheel arrival is drawn too (D34)", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    ok(l.act(l.id("Alex"), { type: "startTeams" }, () => 0.99));
    ok(l.act(l.id("Alex"), { type: "kick", playerId: l.id("Drew") }));
    ok(l.act(null, { type: "join", name: "Emery" }));
    const late = Object.values(l.state.players).find((p) => p.name === "Emery");
    expect(late?.waiting).toBe(false);
    finishDraft(l);
    const members = Object.values(l.state.teams).flatMap((t) => t.memberIds);
    expect(members).not.toContain(l.id("Drew"));
    expect(members).toContain(late?.id);
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("skips offline names without blocking the draft", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    ok(l.act(l.id("Alex"), { type: "startTeams" }, () => 0.99));
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Drew")] }),
    );
    finishDraft(l);
    expect(l.state.players[l.id("Drew")]?.teamId).toBeNull();
    expect(
      Object.values(l.state.teams)
        .map((t) => t.memberIds.length)
        .sort(),
    ).toEqual([1, 2]);
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("transfers captains on disconnect and does not take the role back on rejoin", () => {
    const l = namedTeams();
    const team = l.state.teams["team-1"];
    const captain = team?.captainId ?? "";
    ok(l.act(null, { type: "_presence", active: [], inactive: [captain] }));
    expect(l.state.teams["team-1"]?.captainId).not.toBe(captain);
    ok(
      l.act(null, { type: "join", name: l.state.players[captain]?.name ?? "" }),
    );
    expect(l.state.players[captain]?.teamId).toBe("team-1");
    expect(l.state.teams["team-1"]?.captainId).not.toBe(captain);
    expect(checkInvariants(l.state)).toEqual([]);
  });
});

describe("captain naming and GM corrections", () => {
  it("blocks edits during spins, and requires saved names before writing", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    const gm = l.id("Alex");
    ok(l.act(gm, { type: "startTeams" }));
    expect(
      l.act(gm, { type: "nameTeam", teamId: "team-1", name: "One" }),
    ).toMatchObject({ ok: false });
    expect(l.act(gm, { type: "confirmTeams" })).toMatchObject({ ok: false });
    finishDraft(l);
    expect(l.act(gm, { type: "confirmTeams" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    for (const [i, id] of l.state.teamOrder.entries())
      ok(
        l.act(l.state.teams[id]?.captainId ?? null, {
          type: "nameTeam",
          teamId: id,
          name: `Team name ${i + 1}`,
        }),
      );
    ok(l.act(gm, { type: "confirmTeams" }));
    expect(l.state.phase).toBe("writing");
  });
  it("lets only a team's captain or the GM name it; only the GM moves members", () => {
    const l = namedTeams();
    const gm = l.id("Alex");
    expect(
      l.act(l.id("Drew"), { type: "nameTeam", teamId: "team-1", name: "Nope" }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(
      l.act(l.id("Blair"), {
        type: "addToTeam",
        teamId: "team-2",
        playerId: l.id("Casey"),
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    ok(
      l.act(gm, {
        type: "addToTeam",
        teamId: "team-2",
        playerId: l.id("Casey"),
      }),
    );
    expect(l.state.players[l.id("Casey")]?.teamId).toBe("team-2");
    expect(
      l.act(gm, { type: "nameTeam", teamId: "team-2", name: "named TEAM 1" }),
    ).toMatchObject({ ok: false });
    expect(
      l.act(gm, { type: "nameTeam", teamId: "team-2", name: "  " }),
    ).toMatchObject({ ok: false });
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("requires a connected member on every team, and rejects edits after writing starts", () => {
    const l = namedTeams();
    const gm = l.id("Alex");
    for (const id of l.state.teams["team-2"]?.memberIds ?? [])
      ok(l.act(gm, { type: "addToTeam", teamId: "team-1", playerId: id }));
    expect(l.act(gm, { type: "confirmTeams" })).toMatchObject({ ok: false });
    ok(
      l.act(gm, {
        type: "addToTeam",
        teamId: "team-2",
        playerId: l.id("Blair"),
      }),
    );
    ok(l.act(gm, { type: "confirmTeams" }));
    expect(
      l.act(gm, { type: "nameTeam", teamId: "team-2", name: "Too late" }),
    ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
  });
});

describe("manual teams (D32)", () => {
  it("skips the wheel: nobody is placed, and only the GM places players", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    const gm = l.id("Alex");
    ok(l.act(gm, { type: "startTeams", mode: "manual" }));
    expect(l.state.phase).toBe("teams");
    expect(l.state.draft).toMatchObject({ mode: "manual", stage: "complete" });
    expect(l.state.lastDraw).toBeNull();
    expect(Object.values(l.state.players).every((p) => !p.teamId)).toBe(true);
    // The alarm has nothing to do.
    l.tick(WHEEL_SPIN_MS * 10);
    const before = l.state;
    expect(ok(l.act(null, { type: "_draftTick" })).state).toBe(before);
    expect(
      l.act(l.id("Blair"), {
        type: "addToTeam",
        teamId: "team-1",
        playerId: l.id("Blair"),
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("makes the first player placed on a team its captain, and gates writing as usual", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
    const gm = l.id("Alex");
    ok(l.act(gm, { type: "startTeams", mode: "manual" }));
    const place = (name: string, teamId: string) =>
      ok(l.act(gm, { type: "addToTeam", teamId, playerId: l.id(name) }));
    place("Casey", "team-1");
    place("Alex", "team-1");
    place("Drew", "team-2");
    expect(l.state.teams["team-1"]?.captainId).toBe(l.id("Casey"));
    expect(l.state.teams["team-2"]?.captainId).toBe(l.id("Drew"));
    ok(
      l.act(l.id("Casey"), {
        type: "nameTeam",
        teamId: "team-1",
        name: "Nuns",
      }),
    );
    ok(
      l.act(l.id("Drew"), {
        type: "nameTeam",
        teamId: "team-2",
        name: "Monks",
      }),
    );
    // Blair is still unassigned.
    expect(l.act(gm, { type: "confirmTeams" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    place("Blair", "team-2");
    ok(l.act(gm, { type: "confirmTeams" }));
    expect(l.state.phase).toBe("writing");
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("puts arrivals in the pool until teams are final, then the waiting room (D34)", () => {
    const l = lobbyWith("Alex", "Blair");
    const gm = l.id("Alex");
    ok(l.act(gm, { type: "startTeams", mode: "manual" }));
    ok(l.act(null, { type: "join", name: "Casey" }));
    const idOf = (name: string) =>
      Object.values(l.state.players).find((p) => p.name === name)?.id ?? "";
    expect(l.state.players[idOf("Casey")]).toMatchObject({
      waiting: false,
      teamId: null,
    });
    ok(l.act(gm, { type: "addToTeam", teamId: "team-1", playerId: gm }));
    ok(
      l.act(gm, {
        type: "addToTeam",
        teamId: "team-2",
        playerId: l.id("Blair"),
      }),
    );
    ok(l.act(gm, { type: "nameTeam", teamId: "team-1", name: "Nuns" }));
    ok(l.act(gm, { type: "nameTeam", teamId: "team-2", name: "Monks" }));
    // Casey is connected and unplaced, so teams can't be final yet.
    expect(l.act(gm, { type: "confirmTeams" })).toMatchObject({ ok: false });
    ok(
      l.act(gm, {
        type: "addToTeam",
        teamId: "team-2",
        playerId: idOf("Casey"),
      }),
    );
    ok(l.act(gm, { type: "confirmTeams" }));
    ok(l.act(null, { type: "join", name: "Drew" }));
    expect(l.state.players[idOf("Drew")]?.waiting).toBe(true);
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("spins the wheel for whoever's left, keeping teams balanced (D34)", () => {
    const l = lobbyWith("Alex", "Blair", "Casey", "Drew", "Emery");
    const gm = l.id("Alex");
    expect(l.act(gm, { type: "spinRest" })).toMatchObject({
      ok: false,
      code: "WRONG_PHASE",
    });
    ok(l.act(gm, { type: "startTeams", mode: "manual" }));
    ok(l.act(gm, { type: "addToTeam", teamId: "team-1", playerId: gm }));
    expect(l.act(l.id("Blair"), { type: "spinRest" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    ok(l.act(gm, { type: "spinRest" }, () => 0));
    expect(l.state.draft).toMatchObject({ mode: "manual", stage: "spinning" });
    expect(l.state.lastDraw?.candidates.map((c) => c.name)).toEqual([
      "Blair",
      "Casey",
      "Drew",
      "Emery",
    ]);
    // GM edits wait for the wheel.
    expect(
      l.act(gm, {
        type: "addToTeam",
        teamId: "team-1",
        playerId: l.id("Blair"),
      }),
    ).toMatchObject({ ok: false });
    expect(l.act(gm, { type: "spinRest" })).toMatchObject({ ok: false });
    finishDraft(l);
    const sizes = l.state.teamOrder.map(
      (id) => l.state.teams[id]?.memberIds.length,
    );
    expect(sizes.sort()).toEqual([2, 3]);
    expect(l.state.teams["team-1"]?.captainId).toBe(gm);
    expect(l.act(gm, { type: "spinRest" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("defaults to the wheel and rejects unknown modes", () => {
    const l = lobbyWith("Alex", "Blair");
    ok(l.act(l.id("Alex"), { type: "startTeams" }));
    expect(l.state.draft?.mode).toBe("wheel");
    expect(
      ClientMessage.safeParse({ type: "startTeams", mode: "draft" }).success,
    ).toBe(false);
  });
});
