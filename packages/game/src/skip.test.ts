import { describe, expect, it } from "vitest";
import { checkInvariants } from "./invariants";
import { startedGame, startTurn, turn } from "./test/game";
import { ok } from "./test/helpers";
import type { LobbyState } from "./types";
import { viewFor } from "./view";

const SIX = ["Alex", "Blair", "Casey", "Drew", "Emery", "Frankie"];

const expectValid = (state: LobbyState) =>
  expect(checkInvariants(state)).toEqual([]);

/** Members of each team, in rotation order. */
const rosters = (state: LobbyState) =>
  state.teamOrder.map((id) => state.teams[id]?.memberIds ?? []);

type L = ReturnType<typeof startedGame>["l"];

/** Plays the current turn with no guesses and proceeds. */
function emptyTurn(l: L, gm: string) {
  startTurn(l, gm);
  ok(l.act(gm, { type: "endTurn" }));
  ok(l.act(gm, { type: "proceed" }));
}

/** The active player guesses `n` phrases, then the GM ends and proceeds. */
function scoringTurn(l: L, gm: string, n: number) {
  startTurn(l, gm);
  const player = turn(l.state).playerId;
  for (let i = 0; i < n && l.state.phase === "turnActive"; i++)
    ok(l.act(player, { type: "next" }));
  if (l.state.phase === "turnActive") ok(l.act(gm, { type: "endTurn" }));
  ok(l.act(gm, { type: "proceed" }));
}

describe("skipping a turn swaps with the next teammate (D41)", () => {
  it("B plays now with the same time, A takes the team's next turn, then the rotation carries on", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a, b] = rosters(l.state);
    expect(turn(l.state).playerId).toBe(a?.[0]);
    ok(l.act(gm, { type: "addTime", ms: 10_000 }));
    ok(l.act(gm, { type: "skipTurn" }));
    expect(turn(l.state)).toMatchObject({
      playerId: a?.[1],
      teamId: l.state.teamOrder[0],
      remainingMs: 70_000,
    });
    expect(l.state.game?.owed).toEqual([a?.[0]]);
    expect(viewFor(l.state, null).game?.owed).toEqual([a?.[0]]);
    expectValid(l.state);

    const order: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(turn(l.state).playerId);
      emptyTurn(l, gm);
    }
    // A1 and A0 swapped; everything after is the normal rotation.
    expect(order).toEqual([a?.[1], b?.[0], a?.[0], b?.[1], a?.[2], b?.[2]]);
    expect(l.state.game?.owed).toEqual([]);
    expectValid(l.state);
  });

  it("never hands the turn to the other team", () => {
    const { l, gm } = startedGame({}, ["Alex", "Blair", "Casey", "Drew"]);
    const [a] = rosters(l.state);
    expect(a?.[1]).not.toBe(gm);
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [a?.[1] ?? ""] }),
    );
    const before = turn(l.state).playerId;
    expect(l.act(gm, { type: "skipTurn" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(turn(l.state).playerId).toBe(before);
    expectValid(l.state);
  });

  it("only the GM can skip, and only before the turn starts", () => {
    const { l, gm } = startedGame({}, SIX);
    const other = Object.keys(l.state.players).find((id) => id !== gm) ?? "";
    expect(l.act(other, { type: "skipTurn" })).toMatchObject({
      code: "FORBIDDEN",
    });
    startTurn(l, gm);
    expect(l.act(gm, { type: "skipTurn" })).toMatchObject({
      code: "WRONG_PHASE",
    });
    expectValid(l.state);
  });

  it("waits for an owed player who's away, and they go once they're back", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a] = rosters(l.state);
    const away = a?.[1] ?? "";
    expect(turn(l.state).playerId).toBe(gm);
    emptyTurn(l, gm); // a0 (the GM) plays; b0 is up
    emptyTurn(l, gm); // b0 plays; a1 is up
    expect(turn(l.state).playerId).toBe(away);
    ok(l.act(gm, { type: "skipTurn" })); // a1 swaps with a2
    expect(turn(l.state).playerId).toBe(a?.[2]);
    emptyTurn(l, gm); // a2 plays
    ok(l.act(null, { type: "_presence", active: [], inactive: [away] }));
    emptyTurn(l, gm); // b1 plays; a1 is away, so the rotation goes on
    expect(turn(l.state).playerId).toBe(a?.[0]);
    expect(l.state.game?.owed).toEqual([away]);
    emptyTurn(l, gm);
    ok(l.act(null, { type: "_presence", active: [away], inactive: [] }));
    emptyTurn(l, gm); // b2 plays
    expect(turn(l.state).playerId).toBe(away);
    expectValid(l.state);
  });

  it("forgets an owed player who gets kicked", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a] = rosters(l.state);
    expect(turn(l.state).playerId).toBe(gm);
    emptyTurn(l, gm);
    emptyTurn(l, gm);
    ok(l.act(gm, { type: "skipTurn" }));
    expect(l.state.game?.owed).toEqual([a?.[1]]);
    ok(l.act(gm, { type: "kick", playerId: a?.[1] ?? "" }));
    expect(l.state.game?.owed).toEqual([]);
    expectValid(l.state);
  });
});

describe("the leaderboard (D36)", () => {
  it("credits the describer and ranks the top three, ties sharing a place", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 3 }, SIX);
    const scorers: string[] = [];
    for (const n of [3, 1, 3, 2, 0, 1]) {
      scorers.push(turn(l.state).playerId);
      scoringTurn(l, gm, n);
    }
    expect(l.state.game?.playerScores).toEqual({
      [scorers[0] ?? ""]: 3,
      [scorers[1] ?? ""]: 1,
      [scorers[2] ?? ""]: 3,
      [scorers[3] ?? ""]: 2,
      [scorers[5] ?? ""]: 1,
    });
    // Mid-game nobody sees the podium.
    expect(viewFor(l.state, null).game?.leaders).toEqual([]);

    // Undoing a turn undoes its points too.
    ok(l.act(gm, { type: "restartPrevTurn", ms: 30_000 }));
    expect(l.state.game?.playerScores[scorers[5] ?? ""]).toBeUndefined();
    expectValid(l.state);
  });

  it("shows places 1–3 on the results screen", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 1 });
    const points: Record<string, number> = {};
    for (let i = 0; i < 30 && l.state.phase !== "results"; i++) {
      if (l.state.phase === "roundIntro") ok(l.act(gm, { type: "beginRound" }));
      const player = turn(l.state).playerId;
      // Guess one phrase per turn, so several people score.
      scoringTurn(l, gm, 1);
      points[player] = (points[player] ?? 0) + 1;
    }
    expect(l.state.phase).toBe("results");
    const leaders = viewFor(l.state, null).game?.leaders ?? [];
    expect(leaders.length).toBeGreaterThan(0);
    for (const { playerId, points: p, place } of leaders) {
      expect(p).toBe(points[playerId]);
      const better = Object.values(points).filter((x) => x > p).length;
      expect(place).toBe(better + 1);
      expect(place).toBeLessThanOrEqual(3);
    }
    expectValid(l.state);
  });
});
