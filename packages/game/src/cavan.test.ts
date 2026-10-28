import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { writeAll, writingLobby } from "./test/game";
import { lobbyWith, ok } from "./test/helpers";
import { viewFor } from "./view";

// Cavan is the moderated player: the GM vets every phrase Cavan writes (D30).

describe("designating Cavan", () => {
  it("is GM-only, can't be the GM, and is public", () => {
    const l = lobbyWith("Alex", "Cavan", "Blair");
    expect(
      ClientMessage.safeParse({ type: "setCavan", playerId: null }).success,
    ).toBe(true);
    expect(
      l.act(l.id("Blair"), { type: "setCavan", playerId: l.id("Cavan") }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      l.act(l.id("Alex"), { type: "setCavan", playerId: l.id("Alex") }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("can't be Cavan"),
    });
    ok(l.act(l.id("Alex"), { type: "setCavan", playerId: l.id("Cavan") }));
    expect(l.state.roles.cavanId).toBe(l.id("Cavan"));
    const seen = viewFor(l.state, l.id("Blair")).players.find((p) => p.isCavan);
    expect(seen?.name).toBe("Cavan");
    expect(viewFor(l.state, null).players.some((p) => p.isCavan)).toBe(true);
  });

  it("can't hand Cavan the GM role, and handoff prefers someone else", () => {
    const l = lobbyWith("Alex", "Cavan", "Blair");
    ok(l.act(l.id("Alex"), { type: "setCavan", playerId: l.id("Cavan") }));
    expect(
      l.act(l.id("Alex"), { type: "setGamemaster", playerId: l.id("Cavan") }),
    ).toMatchObject({
      ok: false,
    });
    // Cavan joined before Blair, but Blair takes over when Alex drops.
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Alex")] }),
    );
    expect(l.state.roles.gamemasterId).toBe(l.id("Blair"));
  });

  it("is cleared if Cavan is kicked", () => {
    const l = lobbyWith("Alex", "Cavan");
    ok(l.act(l.id("Alex"), { type: "setCavan", playerId: l.id("Cavan") }));
    ok(l.act(l.id("Alex"), { type: "kick", playerId: l.id("Cavan") }));
    expect(l.state.roles.cavanId).toBeNull();
  });
});

describe("vetting Cavan's phrases", () => {
  function withCavan() {
    const l = writingLobby();
    const gm = l.id("Alex");
    const cavan = l.id("Blair");
    ok(l.act(gm, { type: "setCavan", playerId: cavan }));
    return { l, gm, cavan };
  }

  it("holds Cavan's phrases as pending; only the GM sees them", () => {
    const { l, gm, cavan } = withCavan();
    ok(l.act(cavan, { type: "submitPhrase", text: "sneaky phrase" }));
    ok(l.act(l.id("Casey"), { type: "submitPhrase", text: "normal phrase" }));
    const phrases = Object.values(l.state.phrases);
    expect(phrases.find((p) => p.text === "sneaky phrase")?.status).toBe(
      "pending",
    );
    expect(phrases.find((p) => p.text === "normal phrase")?.status).toBe(
      "approved",
    );
    expect(viewFor(l.state, gm).moderation.map((p) => p.text)).toEqual([
      "sneaky phrase",
    ]);
    for (const viewer of [null, l.id("Casey"), cavan])
      expect(viewFor(l.state, viewer).moderation).toEqual([]);
    expect(viewFor(l.state, cavan).ownPhrases[0]?.status).toBe("pending");
    expect(JSON.stringify(viewFor(l.state, l.id("Casey")))).not.toContain(
      "sneaky phrase",
    );
  });

  it("approves, or rejects so Cavan writes a replacement", () => {
    const { l, gm, cavan } = withCavan();
    ok(l.act(cavan, { type: "submitPhrase", text: "first" }));
    ok(l.act(cavan, { type: "submitPhrase", text: "second" }));
    ok(l.act(cavan, { type: "submitPhrase", text: "third" }));
    expect(
      l.act(cavan, { type: "submitPhrase", text: "fourth" }),
    ).toMatchObject({ ok: false });
    const id = (text: string) =>
      Object.values(l.state.phrases).find((p) => p.text === text)?.id ?? "";
    expect(
      l.act(cavan, { type: "approvePhrase", phraseId: id("first") }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    ok(l.act(gm, { type: "approvePhrase", phraseId: id("first") }));
    ok(l.act(gm, { type: "rejectPhrase", phraseId: id("second") }));
    expect(
      l.act(gm, { type: "rejectPhrase", phraseId: id("second") }),
    ).toMatchObject({ ok: false });
    // The rejected one frees a slot, but the same text can't come back.
    expect(
      l.act(cavan, { type: "submitPhrase", text: "second" }),
    ).toMatchObject({ ok: false });
    ok(l.act(cavan, { type: "submitPhrase", text: "replacement" }));
    const me = viewFor(l.state, cavan).players.find((p) => p.id === cavan);
    expect(me).toMatchObject({ phraseCount: 3, approvedCount: 1 });
    expect(checkInvariants(l.state)).toEqual([]);
  });

  it("blocks the game until nothing is pending, and leaves rejected phrases out of the pile", () => {
    const { l, gm, cavan } = withCavan();
    writeAll(l);
    expect(l.act(gm, { type: "startGame" })).toMatchObject({
      ok: false,
      message: expect.stringContaining("Cavan"),
    });
    const pending = Object.values(l.state.phrases).filter(
      (p) => p.status === "pending",
    );
    expect(pending).toHaveLength(3);
    const [reject, ...approve] = pending;
    for (const p of approve)
      ok(l.act(gm, { type: "approvePhrase", phraseId: p.id }));
    ok(l.act(gm, { type: "rejectPhrase", phraseId: reject?.id ?? "" }));
    // Cavan is now one short.
    expect(l.act(gm, { type: "startGame" })).toMatchObject({ ok: false });
    ok(l.act(cavan, { type: "submitPhrase", text: "Blair redo" }));
    const redo = Object.values(l.state.phrases).find(
      (p) => p.text === "Blair redo",
    );
    ok(l.act(gm, { type: "approvePhrase", phraseId: redo?.id ?? "" }));
    ok(l.act(gm, { type: "startGame" }));
    expect(l.state.game?.pile).toHaveLength(12);
    expect(l.state.game?.pile).not.toContain(reject?.id);
    expect(l.act(gm, { type: "setCavan", playerId: null })).toMatchObject({
      code: "WRONG_PHASE",
    });
    expect(checkInvariants(l.state)).toEqual([]);
  });

  it("re-vets a player designated after writing, and clears pending when Cavan is unset", () => {
    const l = writingLobby();
    const gm = l.id("Alex");
    const casey = l.id("Casey");
    ok(l.act(casey, { type: "submitPhrase", text: "already in" }));
    ok(l.act(gm, { type: "setCavan", playerId: casey }));
    expect(Object.values(l.state.phrases)[0]?.status).toBe("pending");
    ok(l.act(gm, { type: "setCavan", playerId: null }));
    expect(Object.values(l.state.phrases)[0]?.status).toBe("approved");
    expect(checkInvariants(l.state)).toEqual([]);
  });
});
