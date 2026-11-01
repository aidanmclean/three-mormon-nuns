import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { startedGame, startTurn, turn, writingLobby } from "./test/game";
import { lobbyWith, ok } from "./test/helpers";
import { viewFor } from "./view";

// Backdoors (D48): a secret phrase typed during writing is never a phrase;
// it unlocks a perk that only its typist knows about.

const CODE = "alexemote";

describe("typing a backdoor code", () => {
  it("unlocks it for the typist only, with a private notice and no phrase", () => {
    const l = writingLobby();
    const blair = l.id("Blair");
    const result = ok(l.act(blair, { type: "submitPhrase", text: CODE }));
    expect(result.effects).toEqual([
      {
        type: "notice",
        playerId: blair,
        message: expect.stringContaining("Alex emote"),
      },
    ]);
    expect(Object.values(l.state.phrases)).toHaveLength(0);
    expect(l.state.players[blair]?.backdoors).toEqual(["alexEmote"]);
    expect(checkInvariants(l.state)).toEqual([]);
    // Only Blair's own view says so; not the GM's, another player's or the TV's.
    expect(viewFor(l.state, blair).backdoors).toEqual(["alexEmote"]);
    for (const viewer of [l.id("Alex"), l.id("Casey"), null])
      expect(viewFor(l.state, viewer).backdoors).toEqual([]);
    const gmView = JSON.stringify(viewFor(l.state, l.id("Alex")));
    expect(gmView).not.toContain("alexEmote");
    expect(gmView).not.toContain(CODE);
  });

  it("ignores case and spaces, and is idempotent", () => {
    const l = writingLobby();
    const blair = l.id("Blair");
    ok(l.act(blair, { type: "submitPhrase", text: "  Alex  EMOTE " }));
    const again = ok(l.act(blair, { type: "submitPhrase", text: CODE }));
    expect(again.effects).toHaveLength(1);
    expect(l.state.players[blair]?.backdoors).toEqual(["alexEmote"]);
  });

  it("uses no quota and works even when the quota is full", () => {
    const l = writingLobby({ phrasesPerPlayer: 1 });
    const casey = l.id("Casey");
    ok(l.act(casey, { type: "submitPhrase", text: "rubber duck" }));
    ok(l.act(casey, { type: "submitPhrase", text: CODE }));
    expect(
      Object.values(l.state.phrases).filter((p) => p.authorId === casey),
    ).toHaveLength(1);
    expect(
      viewFor(l.state, casey).players.find((p) => p.id === casey),
    ).toMatchObject({ phraseCount: 1, approvedCount: 1 });
  });

  it("from Cavan, leaves nothing for the GM to vet", () => {
    const l = writingLobby();
    const gm = l.id("Alex");
    const cavan = l.id("Blair");
    ok(l.act(gm, { type: "setCavan", playerId: cavan }));
    ok(l.act(cavan, { type: "submitPhrase", text: CODE }));
    const gmView = viewFor(l.state, gm);
    expect(gmView.moderation).toEqual([]);
    expect(gmView.players.find((p) => p.id === cavan)?.phraseCount).toBe(0);
    expect(viewFor(l.state, cavan).backdoors).toEqual(["alexEmote"]);
  });

  it("is an ordinary phrase outside writing, and unknown words stay phrases", () => {
    const l = lobbyWith("Alex", "Blair");
    expect(
      l.act(l.id("Blair"), { type: "submitPhrase", text: CODE }),
    ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
    const w = writingLobby();
    ok(w.act(w.id("Drew"), { type: "submitPhrase", text: "alex emotes" }));
    expect(Object.values(w.state.phrases)).toHaveLength(1);
    expect(w.state.players[w.id("Drew")]?.backdoors).toEqual([]);
  });
});

describe("the Alex emote", () => {
  it("is refused without the backdoor and sent with it", () => {
    const l = writingLobby();
    const blair = l.id("Blair");
    expect(l.act(l.id("Casey"), { type: "emote", kind: "alex" })).toMatchObject(
      { ok: false, code: "FORBIDDEN" },
    );
    ok(l.act(blair, { type: "submitPhrase", text: CODE }));
    expect(ok(l.act(blair, { type: "emote", kind: "alex" })).effects).toEqual([
      { type: "emote", playerId: blair, kind: "alex" },
    ]);
    // The free emotes stay free.
    ok(l.act(l.id("Casey"), { type: "emote", kind: "tomato" }));
  });

  it("lasts the game, survives a reconnect, and resets on Play again", () => {
    const { l } = startedGame({ phrasesPerPlayer: 1 });
    // Too late to type a code once the game has started.
    const drew = l.id("Drew");
    expect(l.act(drew, { type: "submitPhrase", text: CODE })).toMatchObject({
      ok: false,
    });
    expect(l.state.players[drew]?.backdoors).toEqual([]);

    // Fresh game with a backdoor: unlock during writing, then play it out.
    const w = writingLobby({ phrasesPerPlayer: 1 });
    const wgm = w.id("Alex");
    const blair = w.id("Blair");
    ok(w.act(blair, { type: "submitPhrase", text: CODE }));
    for (const p of Object.values(w.state.players))
      ok(w.act(p.id, { type: "submitPhrase", text: `${p.name} phrase` }));
    ok(w.act(wgm, { type: "startGame" }));
    ok(w.act(blair, { type: "emote", kind: "alex" }));
    ok(w.act(null, { type: "_presence", active: [], inactive: [blair] }));
    ok(w.act(null, { type: "_presence", active: [blair], inactive: [] }));
    expect(w.state.players[blair]?.backdoors).toEqual(["alexEmote"]);
    for (const p of Object.values(w.state.players))
      if (w.state.phase === "roundIntro")
        ok(w.act(p.id, { type: "acknowledge" }));
    for (let round = 1; round <= 3; round++) {
      if (w.state.phase === "roundIntro")
        ok(w.act(wgm, { type: "beginRound" }));
      startTurn(w, wgm);
      const player = turn(w.state).playerId;
      while (w.state.phase === "turnActive")
        ok(w.act(player, { type: "next" }));
      ok(w.act(wgm, { type: "proceed" }));
    }
    expect(w.state.phase).toBe("results");
    ok(w.act(wgm, { type: "playAgain" }));
    expect(w.state.players[blair]?.backdoors).toEqual([]);
    expect(w.act(blair, { type: "emote", kind: "alex" })).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(checkInvariants(w.state)).toEqual([]);
  });
});
