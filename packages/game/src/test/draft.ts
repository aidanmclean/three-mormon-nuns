import { expect } from "vitest";
import { WHEEL_REVEAL_MS, WHEEL_SPIN_MS } from "../constants";
import { checkInvariants } from "../invariants";
import { lobbyWith, ok } from "./helpers";

export function finishDraft(l: ReturnType<typeof lobbyWith>) {
  let transitions = 0;
  while (l.state.draft?.stage !== "complete") {
    if (++transitions > 100) throw Error("draft did not finish");
    l.tick(WHEEL_SPIN_MS + WHEEL_REVEAL_MS);
    ok(l.act(null, { type: "_draftTick" }));
    expect(checkInvariants(l.state)).toEqual([]);
  }
}

export function namedTeams() {
  const l = lobbyWith("Alex", "Blair", "Casey", "Drew");
  ok(l.act(l.id("Alex"), { type: "startTeams" }));
  finishDraft(l);
  l.state.teamOrder.forEach((teamId, i) => {
    ok(
      l.act(l.state.teams[teamId]?.captainId ?? null, {
        type: "nameTeam",
        teamId,
        name: `Named team ${i + 1}`,
      }),
    );
  });
  return l;
}
