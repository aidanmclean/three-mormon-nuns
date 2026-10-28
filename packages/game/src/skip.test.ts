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

describe("skipping a turn (D35)", () => {
  it("passes the turn to the next teammate with the same time, then rotation carries on", () => {
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
    expect(l.state.game?.skipped).toEqual([a?.[0]]);
    expect(viewFor(l.state, null).game?.skipped).toEqual([a?.[0]]);
    expectValid(l.state);

    const order: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      order.push(turn(l.state).playerId);
      emptyTurn(l, gm);
    }
    expect(order).toEqual([a?.[1], b?.[0], a?.[2]]);
    expectValid(l.state);
  });

  it("sends a skipped player up for their team's next turn without losing anyone's place", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a, b] = rosters(l.state);
    ok(l.act(gm, { type: "skipTurn" }));
    emptyTurn(l, gm); // a1 plays instead
    expect(turn(l.state).playerId).toBe(b?.[0]);
    ok(l.act(gm, { type: "upNext", playerId: a?.[0] ?? "" }));
    expect(l.state.game).toMatchObject({ skipped: [], upNext: a?.[0] });
    // b0 still plays now: it's their team's turn.
    expect(turn(l.state).playerId).toBe(b?.[0]);

    const order: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(turn(l.state).playerId);
      emptyTurn(l, gm);
    }
    // a0 makes up their turn, then team A carries on with a2.
    expect(order).toEqual([b?.[0], a?.[0], b?.[1], a?.[2]]);
    expect(l.state.game?.upNext).toBeNull();
    expectValid(l.state);
  });

  it("swaps a sent-up player in straight away when their team is up", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a, b] = rosters(l.state);
    ok(l.act(gm, { type: "skipTurn" }));
    expect(turn(l.state).playerId).toBe(a?.[1]);
    // They're back from the washroom already.
    ok(l.act(gm, { type: "upNext", playerId: a?.[0] ?? "" }));
    expect(turn(l.state).playerId).toBe(a?.[0]);
    expectValid(l.state);

    const order: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(turn(l.state).playerId);
      emptyTurn(l, gm);
    }
    // a1 was bumped but keeps their place: they're next for team A.
    expect(order).toEqual([a?.[0], b?.[0], a?.[1], b?.[1]]);
    expectValid(l.state);
  });

  it("gives the turn to the next team if nobody else on the team is connected", () => {
    const { l, gm } = startedGame({}, ["Alex", "Blair", "Casey", "Drew"]);
    const [a, b] = rosters(l.state);
    ok(l.act(gm, { type: "addTime", ms: 20_000 }));
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [a?.[1] ?? ""] }),
    );
    expect(a?.[1]).not.toBe(gm);
    ok(l.act(gm, { type: "skipTurn" }));
    expect(turn(l.state)).toMatchObject({
      playerId: b?.[0],
      teamId: l.state.teamOrder[1],
      remainingMs: 60_000,
      carried: false,
    });
    expectValid(l.state);
  });

  it("refuses when nobody else can play, and checks who and when", () => {
    const { l, gm } = startedGame({}, ["Alex", "Blair"]);
    const other = Object.keys(l.state.players).find((id) => id !== gm) ?? "";
    expect(l.act(other, { type: "skipTurn" })).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(l.act(gm, { type: "upNext", playerId: other })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(turn(l.state).playerId).toBe(gm);
    ok(l.act(null, { type: "_presence", active: [], inactive: [other] }));
    expect(l.act(gm, { type: "skipTurn" })).toMatchObject({
      ok: false,
      code: "INVALID",
    });
    startTurn(l, gm);
    expect(l.act(gm, { type: "skipTurn" })).toMatchObject({
      code: "WRONG_PHASE",
    });
    expectValid(l.state);
  });

  it("forgets a skipped player who gets kicked", () => {
    const { l, gm } = startedGame({}, SIX);
    const [a] = rosters(l.state);
    expect(turn(l.state).playerId).toBe(gm);
    ok(l.act(gm, { type: "skipTurn" })); // the GM passes on their own turn
    ok(l.act(gm, { type: "skipTurn" })); // and so does a1
    expect(l.state.game?.skipped).toEqual([a?.[0], a?.[1]]);
    expect(turn(l.state).playerId).toBe(a?.[2]);
    ok(l.act(gm, { type: "kick", playerId: a?.[1] ?? "" }));
    expect(l.state.game?.skipped).toEqual([a?.[0]]);
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
