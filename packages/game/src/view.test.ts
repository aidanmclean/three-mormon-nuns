import { describe, expect, it } from "vitest";
import { lobbyWith } from "./test/helpers";
import { viewFor } from "./view";

describe("viewFor", () => {
  it("never includes session or screen tokens, for any viewer", () => {
    const l = lobbyWith("Hazel", "Alex", "Sam");
    const tokens = [
      l.state.screenToken,
      ...Object.values(l.state.players).map((p) => p.token),
    ];
    for (const viewer of [null, ...Object.keys(l.state.players), "ghost"]) {
      const json = JSON.stringify(viewFor(l.state, viewer));
      for (const token of tokens) expect(json).not.toContain(token);
    }
  });

  it("lists players in join order with role flags", () => {
    const l = lobbyWith("Hazel", "Alex");
    l.act(l.id("Hazel"), { type: "setCavan", playerId: l.id("Alex") });
    const view = viewFor(l.state, l.id("Alex"));
    expect(view.you).toBe(l.id("Alex"));
    expect(
      view.players.map((p) => [p.name, p.isGamemaster, p.isCavan]),
    ).toEqual([
      ["Hazel", true, false],
      ["Alex", false, true],
    ]);
  });

  it("reports you: null for the screen and unknown viewers", () => {
    const l = lobbyWith("Hazel");
    expect(viewFor(l.state, "ghost").you).toBeNull();
    expect(viewFor(l.state, null).you).toBeNull();
  });
});
