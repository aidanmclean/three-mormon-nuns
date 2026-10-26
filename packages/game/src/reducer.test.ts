import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { IDLE_EXPIRY_MS } from "./constants";
import { checkInvariants } from "./invariants";
import { type Action, createLobby } from "./reducer";
import { lobbyWith, makeIds, ok, T0 } from "./test/helpers";

describe("createLobby (host screen)", () => {
  it("starts with no players and no game master, and binds the screen", () => {
    const res = ok(
      createLobby("ABCD", { actorId: null, now: T0, newId: makeIds() }),
    );
    expect(res.state.players).toEqual({});
    expect(res.state.roles).toEqual({ gamemasterId: null, cavanId: null });
    expect(res.state.config).toEqual(DEFAULT_CONFIG);
    expect(res.state.config.maxWordsPerPhrase).toBe(3);
    expect(res.state.expiresAt).toBe(T0 + IDLE_EXPIRY_MS);
    expect(res.effects).toEqual([
      { type: "screenBound", token: res.state.screenToken },
    ]);
    expect(checkInvariants(res.state)).toEqual([]);
  });

  it("rejects bad codes", () => {
    const ctx = { actorId: null, now: T0, newId: makeIds() };
    expect(createLobby("AB", ctx)).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });

  it("lets the screen reconnect with its token, and nobody else", () => {
    const l = lobbyWith();
    const token = l.state.screenToken;
    const before = l.state;
    const res = ok(l.act(null, { type: "screen", token }));
    expect(res.effects).toEqual([{ type: "screenBound", token }]);
    expect(res.state).toBe(before); // not a state change
    expect(l.act(null, { type: "screen", token: "guess" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });
});

describe("join", () => {
  it("makes the first player game master", () => {
    const l = lobbyWith("Hazel", "Alex");
    expect(l.state.roles.gamemasterId).toBe(l.id("Hazel"));
    expect(Object.values(l.state.players).map((p) => p.name)).toEqual([
      "Hazel",
      "Alex",
    ]);
  });

  it("refuses the name of an active player, case-insensitively", () => {
    const l = lobbyWith("Hazel", "Alex");
    expect(l.act(null, { type: "join", name: " ALEX " })).toMatchObject({
      ok: false,
      code: "NAME_TAKEN",
    });
  });

  it("rejoins an inactive player by name, keeping their id and issuing a new token", () => {
    const l = lobbyWith("Hazel", "Alex");
    const alex = l.id("Alex");
    const oldToken = l.state.players[alex]?.token;
    ok(l.act(null, { type: "_presence", active: [], inactive: [alex] }));

    const res = ok(l.act(null, { type: "join", name: "alex" }));
    expect(res.effects).toEqual([
      { type: "bound", playerId: alex, token: expect.any(String) },
    ]);
    expect(l.state.players[alex]?.status).toBe("active");
    expect(l.state.players[alex]?.token).not.toBe(oldToken);
    expect(Object.keys(l.state.players)).toHaveLength(2);
  });

  it("reconnects by token even while the player is still active (newest socket wins)", () => {
    const l = lobbyWith("Hazel", "Alex");
    const alex = l.id("Alex");
    const token = l.state.players[alex]?.token;
    const res = ok(l.act(null, { type: "join", name: "whatever", token }));
    expect(res.effects).toEqual([{ type: "bound", playerId: alex, token }]);
  });

  it("falls back to the name when the token is unknown", () => {
    const l = lobbyWith("Hazel");
    const res = ok(l.act(null, { type: "join", name: "Alex", token: "stale" }));
    expect(res.effects[0]?.type).toBe("bound");
  });

  it("enforces maxPlayers", () => {
    const l = lobbyWith("Hazel", "Alex");
    ok(
      l.act(l.id("Hazel"), { type: "updateConfig", config: { maxPlayers: 2 } }),
    );
    expect(l.act(null, { type: "join", name: "Sam" })).toMatchObject({
      ok: false,
      code: "LOBBY_FULL",
    });
  });

  it("refuses a second join on an already-bound socket", () => {
    const l = lobbyWith("Hazel");
    expect(l.act(l.id("Hazel"), { type: "join", name: "Again" })).toMatchObject(
      {
        ok: false,
        code: "INVALID",
      },
    );
  });
});

describe("permissions", () => {
  const gmOnly: Action[] = [
    { type: "updateConfig", config: { teamCount: 3 } },
    { type: "kick", playerId: "x" },
    { type: "rename", playerId: "x", name: "y" },
    { type: "setGamemaster", playerId: "x" },
    { type: "setCavan", playerId: null },
  ];

  it.each(gmOnly)("$type is game-master-only", (action) => {
    const l = lobbyWith("Hazel", "Alex");
    expect(l.act(l.id("Alex"), action)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it.each(gmOnly)(
    "$type needs a joined player (not the screen, not a stranger)",
    (action) => {
      const l = lobbyWith("Hazel");
      expect(l.act(null, action)).toMatchObject({
        ok: false,
        code: "NOT_JOINED",
      });
      expect(l.act("ghost", action)).toMatchObject({
        ok: false,
        code: "NOT_JOINED",
      });
    },
  );
});

describe("game master actions", () => {
  it("updates config within range and rejects out-of-range values", () => {
    const l = lobbyWith("Hazel");
    const gm = l.id("Hazel");
    ok(
      l.act(gm, {
        type: "updateConfig",
        config: { roundLengthSec: 90, maxWordsPerPhrase: 4 },
      }),
    );
    expect(l.state.config).toMatchObject({
      roundLengthSec: 90,
      maxWordsPerPhrase: 4,
      teamCount: 2,
    });
    expect(
      l.act(gm, {
        type: "updateConfig",
        config: { roundLengthSec: 5 } as never,
      }),
    ).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });

  it("refuses maxPlayers below the current player count", () => {
    const l = lobbyWith("Hazel", "Alex", "Sam");
    expect(
      l.act(l.id("Hazel"), { type: "updateConfig", config: { maxPlayers: 2 } }),
    ).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });

  it("kicks a player, clearing Cavan if they held it", () => {
    const l = lobbyWith("Hazel", "Alex");
    const [gm, alex] = [l.id("Hazel"), l.id("Alex")];
    ok(l.act(gm, { type: "setCavan", playerId: alex }));
    const res = ok(l.act(gm, { type: "kick", playerId: alex }));
    expect(res.effects).toEqual([{ type: "kicked", playerId: alex }]);
    expect(l.state.players[alex]).toBeUndefined();
    expect(l.state.roles).toEqual({ gamemasterId: gm, cavanId: null });
  });

  it("can't kick yourself or a stranger", () => {
    const l = lobbyWith("Hazel");
    const gm = l.id("Hazel");
    expect(l.act(gm, { type: "kick", playerId: gm })).toMatchObject({
      ok: false,
    });
    expect(l.act(gm, { type: "kick", playerId: "nobody" })).toMatchObject({
      ok: false,
    });
  });

  it("renames, keeping names unique", () => {
    const l = lobbyWith("Hazel", "Alex", "Sam");
    const [gm, alex] = [l.id("Hazel"), l.id("Alex")];
    ok(l.act(gm, { type: "rename", playerId: alex, name: "  Big  Al " }));
    expect(l.state.players[alex]?.name).toBe("Big Al");
    expect(
      l.act(gm, { type: "rename", playerId: alex, name: "sam" }),
    ).toMatchObject({
      ok: false,
      code: "NAME_TAKEN",
    });
    // Changing only the casing of a name is fine.
    ok(l.act(gm, { type: "rename", playerId: alex, name: "BIG AL" }));
  });

  it("hands game master to a connected player, who then holds the controls", () => {
    const l = lobbyWith("Hazel", "Alex");
    const [hazel, alex] = [l.id("Hazel"), l.id("Alex")];
    ok(l.act(hazel, { type: "setGamemaster", playerId: alex }));
    expect(l.state.roles.gamemasterId).toBe(alex);
    expect(l.act(hazel, { type: "setCavan", playerId: null })).toMatchObject({
      code: "FORBIDDEN",
    });
    ok(l.act(alex, { type: "setCavan", playerId: hazel }));
  });

  it("only hands game master to a connected player", () => {
    const l = lobbyWith("Hazel", "Alex");
    const alex = l.id("Alex");
    ok(l.act(null, { type: "_presence", active: [], inactive: [alex] }));
    expect(
      l.act(l.id("Hazel"), { type: "setGamemaster", playerId: alex }),
    ).toMatchObject({ ok: false });
  });

  it("sets and clears Cavan", () => {
    const l = lobbyWith("Hazel", "Cavan");
    const gm = l.id("Hazel");
    ok(l.act(gm, { type: "setCavan", playerId: l.id("Cavan") }));
    expect(l.state.roles.cavanId).toBe(l.id("Cavan"));
    ok(l.act(gm, { type: "setCavan", playerId: null }));
    expect(l.state.roles.cavanId).toBeNull();
  });
});

describe("presence & game master handoff", () => {
  it("passes GM to the earliest-joined active player when the GM drops", () => {
    const l = lobbyWith("Hazel", "Alex", "Sam");
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Hazel")] }),
    );
    expect(l.state.roles.gamemasterId).toBe(l.id("Alex"));
    // The original GM coming back doesn't take the role back (Q2).
    ok(
      l.act(null, { type: "_presence", active: [l.id("Hazel")], inactive: [] }),
    );
    expect(l.state.roles.gamemasterId).toBe(l.id("Alex"));
  });

  it("keeps the GM when everyone is inactive, then hands it to the next joiner", () => {
    const l = lobbyWith("Hazel", "Alex");
    ok(
      l.act(null, {
        type: "_presence",
        active: [],
        inactive: [l.id("Hazel"), l.id("Alex")],
      }),
    );
    expect(l.state.roles.gamemasterId).toBe(l.id("Hazel"));
    const res = ok(l.act(null, { type: "join", name: "Sam" }));
    const sam = res.effects[0]?.type === "bound" ? res.effects[0].playerId : "";
    expect(l.state.roles.gamemasterId).toBe(sam);
    expect(checkInvariants(l.state)).toEqual([]);
  });

  it("returns the same state object when presence changes nothing", () => {
    const l = lobbyWith("Hazel");
    const before = l.state;
    const res = ok(
      l.act(null, {
        type: "_presence",
        active: [l.id("Hazel")],
        inactive: ["ghost"],
      }),
    );
    expect(res.state).toBe(before);
  });

  it("presence doesn't extend expiry, but _touch and player actions do", () => {
    const l = lobbyWith("Hazel", "Alex");
    const start = l.state.expiresAt;
    l.tick(1000);
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Alex")] }),
    );
    expect(l.state.expiresAt).toBe(start);
    ok(l.act(null, { type: "_touch" }));
    expect(l.state.expiresAt).toBe(start + 1000);
  });
});
