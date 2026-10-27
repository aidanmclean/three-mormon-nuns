import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { namedTeams } from "./test/draft";
import { lobbyWith, ok } from "./test/helpers";
import { viewFor } from "./view";

function writing() {
  const l = namedTeams();
  ok(l.act(l.id("Alex"), { type: "confirmTeams" }));
  return l;
}

describe("writing phrases", () => {
  it("accepts cleaned phrases and exposes text only to their author", () => {
    const l = writing();
    const alex = l.id("Alex");
    ok(l.act(alex, { type: "submitPhrase", text: "  Flying   toaster " }));
    expect(viewFor(l.state, alex).ownPhrases[0]?.text).toBe("Flying toaster");
    for (const viewer of [null, l.id("Blair"), "unknown"])
      expect(JSON.stringify(viewFor(l.state, viewer))).not.toContain(
        "Flying toaster",
      );
    expect(
      viewFor(l.state, null).players.find((p) => p.id === alex)?.phraseCount,
    ).toBe(1);
    expect(checkInvariants(l.state)).toEqual([]);
  });
  it("checks phase, membership, length, word count, duplicates and quota", () => {
    const before = lobbyWith("Alex");
    expect(
      before.act(before.id("Alex"), { type: "submitPhrase", text: "No" }),
    ).toMatchObject({ ok: false, code: "WRONG_PHASE" });
    const l = writing();
    const alex = l.id("Alex");
    for (const text of ["", "one two three four", "x".repeat(81)])
      expect(l.act(alex, { type: "submitPhrase", text })).toMatchObject({
        ok: false,
      });
    ok(l.act(alex, { type: "submitPhrase", text: "Flying toaster" }));
    expect(
      l.act(l.id("Blair"), { type: "submitPhrase", text: "flying TOASTER" }),
    ).toMatchObject({ ok: false });
    ok(l.act(alex, { type: "submitPhrase", text: "Invisible banana" }));
    ok(l.act(alex, { type: "submitPhrase", text: "Dancing fridge" }));
    expect(
      l.act(alex, { type: "submitPhrase", text: "Fourth phrase" }),
    ).toMatchObject({ ok: false });
    ok(l.act(null, { type: "join", name: "Late" }));
    const late = Object.values(l.state.players).find((p) => p.name === "Late");
    expect(
      l.act(late?.id ?? null, { type: "submitPhrase", text: "Not eligible" }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("only permits the author to delete, restoring their quota; kicks remove authored phrases", () => {
    const l = writing();
    const blair = l.id("Blair");
    ok(l.act(blair, { type: "submitPhrase", text: "Private phrase" }));
    const id = viewFor(l.state, blair).ownPhrases[0]?.id ?? "";
    expect(
      l.act(l.id("Alex"), { type: "deletePhrase", phraseId: id }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    ok(l.act(blair, { type: "deletePhrase", phraseId: id }));
    expect(viewFor(l.state, blair).ownPhrases).toEqual([]);
    ok(l.act(blair, { type: "submitPhrase", text: "New phrase" }));
    ok(l.act(l.id("Alex"), { type: "kick", playerId: blair }));
    expect(Object.values(l.state.phrases)).toEqual([]);
    expect(checkInvariants(l.state)).toEqual([]);
  });
});
