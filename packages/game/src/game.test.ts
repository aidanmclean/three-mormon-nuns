import { describe, expect, it } from "vitest";
import { TURN_COUNTDOWN_MS } from "./constants";
import { checkInvariants } from "./invariants";
import { ClientMessage } from "./protocol";
import { finishDraft } from "./test/draft";
import {
  startedGame,
  startTurn,
  turn,
  writeAll,
  writingLobby,
} from "./test/game";
import { lobbyWith, ok } from "./test/helpers";
import { viewFor } from "./view";

const expectValid = (state: Parameters<typeof checkInvariants>[0]) =>
  expect(checkInvariants(state)).toEqual([]);

/** Plays empty turns until someone other than the GM is up next. */
function untilNotGmUp(l: ReturnType<typeof lobbyWith>, gm: string) {
  for (let i = 0; i < 4 && turn(l.state).playerId === gm; i++) {
    startTurn(l, gm);
    ok(l.act(gm, { type: "endTurn" }));
    ok(l.act(gm, { type: "proceed" }));
  }
  const player = turn(l.state).playerId;
  expect(player).not.toBe(gm);
  return player;
}

describe("starting the game", () => {
  it("needs the GM, and every connected player's phrases", () => {
    const l = writingLobby();
    writeAll(l, ["Drew"]);
    expect(l.act(l.id("Blair"), { type: "startGame" })).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(l.act(l.id("Alex"), { type: "startGame" })).toMatchObject({
      ok: false,
      message: expect.stringContaining("Drew"),
    });
    // An offline player's missing phrases don't hold everyone up.
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Drew")] }),
    );
    ok(l.act(l.id("Alex"), { type: "startGame" }));
    expect(l.state.phase).toBe("roundIntro");
    expect(l.state.game).toMatchObject({ round: 1, acknowledged: [] });
    expect(l.state.game?.pile).toHaveLength(9);
    expectValid(l.state);
  });

  it("opens each round with its rules and waits for every connected player", () => {
    const l = writingLobby();
    writeAll(l);
    ok(l.act(l.id("Alex"), { type: "startGame" }));
    expect(viewFor(l.state, null).game).toMatchObject({
      round: 1,
      roundTitle: "Describe it",
      roundRules: expect.stringContaining("without saying"),
    });
    for (const name of ["Alex", "Blair", "Casey"])
      ok(l.act(l.id(name), { type: "acknowledge" }));
    expect(l.state.phase).toBe("roundIntro");
    // The last one going offline is enough to start too.
    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Drew")] }),
    );
    expect(l.state.phase).toBe("turnReady");
  });

  it("lets the GM begin a round without waiting", () => {
    const l = writingLobby();
    writeAll(l);
    ok(l.act(l.id("Alex"), { type: "startGame" }));
    expect(l.act(l.id("Blair"), { type: "beginRound" })).toMatchObject({
      code: "FORBIDDEN",
    });
    ok(l.act(l.id("Alex"), { type: "beginRound" }));
    expect(l.state.phase).toBe("turnReady");
  });
});

describe("rotation (D13)", () => {
  it("alternates teams A1, B1, A2, B2 and wraps", () => {
    const { l, gm } = startedGame();
    const [a, b] = l.state.teamOrder.map(
      (id) => l.state.teams[id]?.memberIds ?? [],
    );
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(turn(l.state).playerId);
      startTurn(l, gm);
      ok(l.act(gm, { type: "endTurn" }));
      ok(l.act(gm, { type: "proceed" }));
    }
    expect(order).toEqual([a?.[0], b?.[0], a?.[1], b?.[1], a?.[0]]);
    expectValid(l.state);
  });

  it("wraps a smaller team sooner", () => {
    const { l, gm } = startedGame({}, ["Alex", "Blair", "Casey"]);
    const [a, b] = l.state.teamOrder.map(
      (id) => l.state.teams[id]?.memberIds ?? [],
    );
    const big = (a?.length ?? 0) > (b?.length ?? 0) ? a : b;
    const small = big === a ? b : a;
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(turn(l.state).playerId);
      startTurn(l, gm);
      ok(l.act(gm, { type: "endTurn" }));
      ok(l.act(gm, { type: "proceed" }));
    }
    const firstTeamIsBig = big === a;
    expect(order).toEqual(
      firstTeamIsBig
        ? [big?.[0], small?.[0], big?.[1], small?.[0]]
        : [small?.[0], big?.[0], small?.[0], big?.[1]],
    );
  });

  it("skips an offline player for their next teammate, and a team with nobody connected", () => {
    const { l, gm } = startedGame();
    const upNext = untilNotGmUp(l, gm);
    const teamId = turn(l.state).teamId;
    const members = l.state.teams[teamId]?.memberIds ?? [];
    const teammate = members.find((id) => id !== upNext);
    ok(l.act(null, { type: "_presence", active: [], inactive: [upNext] }));
    expect(turn(l.state)).toMatchObject({ playerId: teammate, teamId });
    // Everyone on the other team goes offline (unless it's the GM): it's skipped.
    const otherTeam = l.state.teamOrder.find((id) => id !== teamId) ?? "";
    const others = (l.state.teams[otherTeam]?.memberIds ?? []).filter(
      (id) => id !== gm,
    );
    if (others.length === (l.state.teams[otherTeam]?.memberIds.length ?? 0)) {
      ok(l.act(null, { type: "_presence", active: [], inactive: others }));
      startTurn(l, gm);
      ok(l.act(gm, { type: "endTurn" }));
      ok(l.act(gm, { type: "proceed" }));
      expect(turn(l.state).teamId).toBe(teamId);
    }
    expectValid(l.state);
  });
});

describe("a turn", () => {
  it("counts down, then next/back move through phrases and the score", () => {
    const { l, gm } = startedGame();
    const player = turn(l.state).playerId;
    ok(l.act(gm, { type: "startTurn" }, () => 0));
    expect(l.state.phase).toBe("turnActive");
    const t = turn(l.state);
    // The clock starts after the countdown, with the full turn length.
    expect((t.endsAt ?? 0) - (t.countdownEndsAt ?? 0)).toBe(t.remainingMs);
    expect(l.act(player, { type: "next" })).toMatchObject({
      message: "Wait for the countdown.",
    });
    l.tick(TURN_COUNTDOWN_MS);
    const first = viewFor(l.state, player).game?.turn?.currentPhrase;
    expect(first).toBeTruthy();
    ok(l.act(player, { type: "next" }, () => 0));
    expect(turn(l.state).cursor).toBe(1);
    const second = viewFor(l.state, player).game?.turn?.currentPhrase;
    expect(second).not.toBe(first);
    ok(l.act(player, { type: "back" }));
    expect(viewFor(l.state, player).game?.turn).toMatchObject({
      points: 0,
      currentPhrase: first,
    });
    expect(l.act(player, { type: "back" })).toMatchObject({ ok: false });
    ok(l.act(player, { type: "next" }));
    expect(viewFor(l.state, player).game?.turn?.currentPhrase).toBe(second);
    const other =
      Object.keys(l.state.players).find((id) => id !== player && id !== gm) ??
      "";
    expect(l.act(other, { type: "next" })).toMatchObject({ code: "FORBIDDEN" });
    expectValid(l.state);
  });

  it("only shows the phrase to the active player (and the GM while revealing)", () => {
    const { l, gm } = startedGame();
    const player = untilNotGmUp(l, gm);
    startTurn(l, gm);
    const texts = Object.values(l.state.phrases).map((p) => p.text);
    const leaks = (viewer: string | null) => {
      const view = viewFor(l.state, viewer);
      const json = JSON.stringify({ ...view, ownPhrases: [] });
      return texts.filter((t) => json.includes(t));
    };
    expect(leaks(null)).toEqual([]);
    for (const id of Object.keys(l.state.players))
      if (id !== player) expect(leaks(id)).toEqual([]);
    expect(leaks(player)).toHaveLength(1);
    expect(gm).not.toBe(player);
    ok(l.act(gm, { type: "reveal" }));
    expect(leaks(gm)).toHaveLength(1);
    expect(leaks(null)).toEqual([]);
  });

  it("lists the guessed phrases to everyone when showGuessed is on (D47)", () => {
    const { l, gm } = startedGame({ showGuessed: true });
    const player = turn(l.state).playerId;
    startTurn(l, gm);
    ok(l.act(player, { type: "next" }));
    expect(viewFor(l.state, null).game?.turn?.guessed).toBeNull();
    ok(l.act(gm, { type: "endTurn" }));
    expect(l.state.phase).toBe("turnReview");
    const [first] = turn(l.state).seen;
    for (const viewer of [null, gm, player])
      expect(viewFor(l.state, viewer).game?.turn?.guessed).toEqual([
        l.state.phrases[first ?? ""]?.text,
      ]);
  });

  it("goes to review when time's up; back and forward settle the last guess", () => {
    const { l, gm } = startedGame({ roundLengthSec: 15 });
    const player = turn(l.state).playerId;
    startTurn(l, gm);
    ok(l.act(player, { type: "next" }));
    ok(l.act(player, { type: "next" }));
    l.tick(15_000);
    ok(l.act(null, { type: "_turnTick" }));
    expect(l.state.phase).toBe("turnReview");
    expect(turn(l.state)).toMatchObject({
      endedBy: "timer",
      cursor: 2,
      maxCursor: 2,
      remainingMs: 0,
    });
    // Off by default: only the describer gets the list back (D47).
    expect(viewFor(l.state, null).game?.turn?.guessed).toBeNull();
    const other = Object.keys(l.state.players).find((id) => id !== player);
    expect(viewFor(l.state, other ?? null).game?.turn?.guessed).toBeNull();
    expect(viewFor(l.state, player).game?.turn?.guessed).toHaveLength(2);
    expect(viewFor(l.state, null).game?.turn?.points).toBe(2);
    expect(l.act(player, { type: "next" })).toMatchObject({ ok: false });
    expect(l.act(player, { type: "forward" })).toMatchObject({ ok: false });
    ok(l.act(player, { type: "back" }));
    ok(l.act(player, { type: "back" }));
    expect(l.act(player, { type: "back" })).toMatchObject({ ok: false });
    ok(l.act(player, { type: "forward" }));
    const pileBefore = l.state.game?.pile.length ?? 0;
    const team = turn(l.state).teamId;
    ok(l.act(gm, { type: "proceed" }));
    expect(l.state.game?.scores[team]).toBe(1);
    expect(l.state.game?.pile).toHaveLength(pileBefore - 1);
    expect(l.state.phase).toBe("turnReady");
    expect(turn(l.state).teamId).not.toBe(team);
    expectValid(l.state);
  });

  it("treats a next that arrives after the deadline as time up", () => {
    const { l, gm } = startedGame({ roundLengthSec: 15 });
    const player = turn(l.state).playerId;
    startTurn(l, gm);
    l.tick(15_001);
    ok(l.act(player, { type: "next" }));
    expect(l.state.phase).toBe("turnReview");
    expect(turn(l.state).cursor).toBe(0);
  });

  it("pauses, adjusts time only while paused, and resumes", () => {
    const { l, gm } = startedGame({ roundLengthSec: 60 });
    startTurn(l, gm);
    l.tick(10_000);
    ok(l.act(gm, { type: "pauseTimer" }));
    expect(turn(l.state)).toMatchObject({
      paused: true,
      endsAt: null,
      remainingMs: 50_000,
    });
    l.tick(30_000); // paused time doesn't count
    ok(l.act(gm, { type: "addTime", ms: 15_000 }));
    expect(turn(l.state).remainingMs).toBe(65_000);
    ok(l.act(gm, { type: "addTime", ms: -60_000 }));
    expect(turn(l.state).remainingMs).toBe(5_000);
    ok(l.act(gm, { type: "resumeTimer" }));
    expect(l.act(gm, { type: "addTime", ms: 1_000 })).toMatchObject({
      code: "WRONG_PHASE",
    });
    expect(turn(l.state).endsAt).toBeGreaterThan(0);
    l.tick(5_000);
    ok(l.act(null, { type: "_turnTick" }));
    expect(l.state.phase).toBe("turnReview");
    expect(
      ClientMessage.safeParse({ type: "addTime", ms: 999_999 }).success,
    ).toBe(false);
  });

  it("restarts the previous turn with chosen time, undoing its score", () => {
    const { l, gm } = startedGame();
    const player = turn(l.state).playerId;
    const pile = l.state.game?.pile.length;
    startTurn(l, gm);
    ok(l.act(player, { type: "next" }));
    ok(l.act(gm, { type: "endTurn" }));
    ok(l.act(gm, { type: "proceed" }));
    expect(Object.values(l.state.game?.scores ?? {})).toContain(1);
    ok(l.act(gm, { type: "restartPrevTurn", ms: 30_000 }));
    expect(l.state.phase).toBe("turnReady");
    expect(turn(l.state)).toMatchObject({
      playerId: player,
      remainingMs: 30_000,
    });
    expect(Object.values(l.state.game?.scores ?? {})).toEqual([0, 0]);
    expect(l.state.game?.pile).toHaveLength(pile ?? 0);
    expect(l.act(gm, { type: "restartPrevTurn", ms: 30_000 })).toMatchObject({
      ok: false,
    });
    expectValid(l.state);
  });
});

describe("pile-outs and rounds (D17)", () => {
  /** Active player guesses everything left in the pile. */
  function guessAll(l: ReturnType<typeof lobbyWith>) {
    const player = turn(l.state).playerId;
    while (l.state.phase === "turnActive") ok(l.act(player, { type: "next" }));
  }

  it("stops the clock, then the same player carries the time left into the next round", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 1, roundLengthSec: 60 });
    const player = turn(l.state).playerId;
    const team = turn(l.state).teamId;
    startTurn(l, gm);
    l.tick(20_000);
    guessAll(l);
    expect(turn(l.state)).toMatchObject({
      endedBy: "pile",
      cursor: 4,
      remainingMs: 40_000,
    });
    ok(l.act(gm, { type: "proceed" }));
    expect(l.state.phase).toBe("roundIntro");
    expect(l.state.game).toMatchObject({ round: 2, pile: expect.any(Array) });
    expect(l.state.game?.pile).toHaveLength(4);
    expect(l.state.game?.scores[team]).toBe(4);
    expect(viewFor(l.state, null).game).toMatchObject({
      roundTitle: "Charades",
    });
    ok(l.act(gm, { type: "beginRound" }));
    expect(turn(l.state)).toMatchObject({
      playerId: player,
      carried: true,
      remainingMs: 40_000,
    });
    // After the carried turn, rotation continues with the other team.
    startTurn(l, gm);
    ok(l.act(gm, { type: "endTurn" }));
    ok(l.act(gm, { type: "proceed" }));
    expect(turn(l.state).teamId).not.toBe(team);
    expectValid(l.state);
  });

  it("keeps the same player in the same round if a disputed phrase goes back", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 1 });
    const player = turn(l.state).playerId;
    startTurn(l, gm);
    guessAll(l);
    ok(l.act(player, { type: "back" }));
    ok(l.act(gm, { type: "proceed" }));
    expect(l.state.phase).toBe("turnReady");
    expect(l.state.game?.round).toBe(1);
    expect(l.state.game?.pile).toHaveLength(1);
    expect(turn(l.state)).toMatchObject({ playerId: player, carried: true });
  });

  it("ends after round 3 with the top team(s) as winners, then plays again", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 1 });
    for (let round = 1; round <= 3; round++) {
      if (l.state.phase === "roundIntro") ok(l.act(gm, { type: "beginRound" }));
      startTurn(l, gm);
      guessAll(l);
      ok(l.act(gm, { type: "proceed" }));
    }
    expect(l.state.phase).toBe("results");
    const view = viewFor(l.state, null).game;
    expect(Object.values(view?.scores ?? {}).sort()).toEqual([0, 12]);
    expect(view?.winners).toHaveLength(1);
    expectValid(l.state);

    ok(
      l.act(null, { type: "_presence", active: [], inactive: [l.id("Drew")] }),
    );
    expect(
      l.act(l.id("Blair") === gm ? l.id("Casey") : l.id("Blair"), {
        type: "playAgain",
      }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    ok(l.act(l.state.roles.gamemasterId ?? "", { type: "playAgain" }));
    expect(l.state).toMatchObject({
      phase: "lobby",
      game: null,
      phrases: {},
      teamOrder: [],
    });
    expect(
      Object.values(l.state.players)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Alex", "Blair", "Casey"]);
    expect(Object.values(l.state.players).every((p) => p.teamId === null)).toBe(
      true,
    );
    expectValid(l.state);
  });

  it("reports a tie as more than one winner", () => {
    const { l, gm } = startedGame({ phrasesPerPlayer: 1 });
    const play = (n: number) => {
      if (l.state.phase === "roundIntro") ok(l.act(gm, { type: "beginRound" }));
      const player = turn(l.state).playerId;
      startTurn(l, gm);
      for (let i = 0; i < n; i++) ok(l.act(player, { type: "next" }));
      if (l.state.phase === "turnActive") ok(l.act(gm, { type: "endTurn" }));
      ok(l.act(gm, { type: "proceed" }));
    };
    // Round 1: A 2, B 2. Rounds 2–3: one team clears each, taking turns.
    play(2);
    play(2);
    play(4); // A clears round 2 → carried into round 3
    play(0); // A's carried turn, nothing
    play(4); // B clears round 3
    expect(l.state.phase).toBe("results");
    const view = viewFor(l.state, null).game;
    expect(view?.winners).toHaveLength(2);
  });
});

describe("people coming and going mid-game", () => {
  it("ends the turn when the active player drops", () => {
    const { l, gm } = startedGame();
    const player = untilNotGmUp(l, gm);
    startTurn(l, gm);
    ok(l.act(null, { type: "_presence", active: [], inactive: [player] }));
    expect(l.state.phase).toBe("turnReview");
    expect(turn(l.state).endedBy).toBe("left");
    ok(l.act(gm, { type: "proceed" }));
    expect(l.state.phase).toBe("turnReady");
    expect(turn(l.state).playerId).not.toBe(player);
    expectValid(l.state);
  });

  it("keeps a kicked player's phrases in the pile, and ends their turn", () => {
    const { l, gm } = startedGame();
    const pile = l.state.game?.pile.length;
    const victim = untilNotGmUp(l, gm);
    startTurn(l, gm);
    ok(l.act(gm, { type: "kick", playerId: victim }));
    expect(l.state.players[victim]).toBeUndefined();
    expect(l.state.game?.pile).toHaveLength(pile ?? 0);
    expect(turn(l.state).endedBy).toBe("left");
    expectValid(l.state);
  });

  it("lets the GM put a late joiner onto a team, and nobody else", () => {
    const { l, gm } = startedGame();
    ok(l.act(null, { type: "join", name: "Late" }));
    const late = Object.values(l.state.players).find((p) => p.name === "Late");
    expect(late?.waiting).toBe(true);
    const teamId = l.state.teamOrder[1] ?? "";
    const other =
      Object.keys(l.state.players).find((id) => id !== gm && id !== late?.id) ??
      "";
    expect(
      l.act(other, { type: "addToTeam", teamId, playerId: late?.id ?? "" }),
    ).toMatchObject({
      code: "FORBIDDEN",
    });
    ok(l.act(gm, { type: "addToTeam", teamId, playerId: late?.id ?? "" }));
    expect(l.state.players[late?.id ?? ""]).toMatchObject({
      teamId,
      waiting: false,
    });
    expect(l.state.teams[teamId]?.memberIds).toContain(late?.id);
    expect(
      l.act(gm, {
        type: "addToTeam",
        teamId: l.state.teamOrder[0] ?? "",
        playerId: other,
      }),
    ).toMatchObject({
      ok: false,
    });
    expectValid(l.state);
  });

  it("broadcasts emotes without changing state", () => {
    const { l } = startedGame();
    const before = l.state;
    const res = ok(l.act(l.id("Blair"), { type: "emote", kind: "tomato" }));
    expect(res.state).toBe(before);
    expect(res.effects).toEqual([
      { type: "emote", playerId: l.id("Blair"), kind: "tomato" },
    ]);
    expect(
      ClientMessage.safeParse({ type: "emote", kind: "poop" }).success,
    ).toBe(false);
  });
});

it("draft helper still works for three players", () => {
  const l = lobbyWith("Alex", "Blair", "Casey");
  ok(l.act(l.id("Alex"), { type: "startTeams" }));
  finishDraft(l);
  expect(l.state.draft?.stage).toBe("complete");
});
