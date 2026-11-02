import { SKILL_POINTS, WHEEL_REVEAL_MS, WHEEL_SPIN_MS } from "./constants";
import { nameKey, validateName } from "./names";
import { shuffled } from "./random";
import type { Action, Ctx, Result } from "./reducer";
import type {
  LobbyState,
  Player,
  PlayerId,
  Team,
  TeamId,
  TeamMode,
} from "./types";

const done = (state: LobbyState): Result => ({ ok: true, state, effects: [] });
const invalid = (message: string): Result => ({
  ok: false,
  code: "INVALID",
  message,
});

export function startDraft(
  state: LobbyState,
  ctx: Ctx,
  mode: TeamMode,
): Result {
  if (state.phase !== "lobby")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Team selection has already started.",
    };
  // A shuffled queue, so the wheel's names aren't in join order (D58).
  const remainingIds = shuffled(
    Object.values(state.players)
      .filter((p) => p.status === "active")
      .map((p) => p.id),
    ctx.rng,
  );
  if (remainingIds.length < state.config.teamCount)
    return invalid(
      `You need at least ${state.config.teamCount} connected players.`,
    );
  const teamOrder = Array.from(
    { length: state.config.teamCount },
    (_, i) => `team-${i + 1}`,
  );
  const teams: Record<string, Team> = Object.fromEntries(
    teamOrder.map((id, i) => [
      id,
      {
        id,
        name: `Team ${i + 1}`,
        nameConfirmed: false,
        captainId: null,
        memberIds: [],
      },
    ]),
  );
  // Nobody waits during team selection: anyone offline now joins the pool
  // when they're back (D34).
  const players = Object.fromEntries(
    Object.values(state.players).map((p) => [p.id, { ...p, waiting: false }]),
  );
  const base = { ...state, phase: "teams" as const, players, teams, teamOrder };
  // Manual: no wheel. The draft is complete at once, so the usual GM team
  // edits apply and the first player placed on a team is its captain (D32).
  if (mode === "manual")
    return done({
      ...base,
      lastDraw: null,
      draft: {
        mode,
        remainingIds: [],
        nextTeamIndex: 0,
        stage: "complete",
        nextAt: null,
      },
    });
  return done(
    nextSpin(
      {
        ...base,
        draft: {
          mode,
          remainingIds,
          nextTeamIndex: 0,
          stage: "revealing",
          nextAt: ctx.now,
        },
      },
      ctx,
    ),
  );
}

function nextSpin(state: LobbyState, ctx: Ctx): LobbyState {
  const draft = state.draft;
  if (!draft) return state;
  // Everyone connected and unplaced, including anyone who joined or came back
  // mid-wheel (D34); the existing queue order first.
  const unplaced = Object.values(state.players).filter(
    (p) => p.status === "active" && !p.waiting && !p.teamId,
  );
  const candidates = [
    ...draft.remainingIds.flatMap((id) => unplaced.filter((p) => p.id === id)),
    ...unplaced.filter((p) => !draft.remainingIds.includes(p.id)),
  ].map((p) => ({ id: p.id, name: p.name }));
  if (!candidates.length)
    return {
      ...state,
      draft: { ...draft, remainingIds: [], stage: "complete", nextAt: null },
    };
  // Fill the smallest team, rotating ties: normally A, B, A, B.
  const order = [
    ...state.teamOrder.slice(draft.nextTeamIndex),
    ...state.teamOrder.slice(0, draft.nextTeamIndex),
  ];
  const size = (id: TeamId) => state.teams[id]?.memberIds.length ?? 0;
  const smallest = Math.min(...order.map(size));
  // Balance by skill (D51): plan an even split of everyone still unplaced,
  // then draw at random from those planned for this team. With the house
  // rule off, anyone unplaced can be drawn (D58).
  const plan = state.config.balanceTeams
    ? balancedPlan(
        state,
        candidates.flatMap((c) => state.players[c.id] ?? []),
        order,
        ctx,
      )
    : null;
  const planned = new Set(plan?.values());
  const teamId =
    order.find((id) => size(id) === smallest && (!plan || planned.has(id))) ??
    order.find((id) => size(id) === smallest) ??
    "";
  const pool = plan
    ? candidates.filter((c) => plan.get(c.id) === teamId)
    : candidates;
  const from = pool.length ? pool : candidates;
  const pick = from[Math.floor((ctx.rng?.() ?? 0) * from.length)];
  if (!pick || !state.teams[teamId]) return state;
  const endsAt = ctx.now + WHEEL_SPIN_MS;
  return {
    ...state,
    draft: {
      ...draft,
      remainingIds: candidates.map((p) => p.id),
      nextTeamIndex:
        (state.teamOrder.indexOf(teamId) + 1) % state.teamOrder.length,
      stage: "spinning",
      nextAt: endsAt,
    },
    lastDraw: {
      sequence: (state.lastDraw?.sequence ?? 0) + 1,
      teamId,
      playerId: pick.id,
      candidates,
      startedAt: ctx.now,
      endsAt,
    },
  };
}

const points = (p: Player | undefined) =>
  SKILL_POINTS[p?.skill ?? "intermediate"];

/**
 * An even split of the unplaced players (D51). Team sizes come first: they
 * end up within one of each other. Then the strongest players go first, each
 * to the open team with the lowest skill total, and swapping pairs of
 * unplaced players between teams evens the totals out further. Equal players
 * are shuffled first, so the plan isn't decided by join order.
 */
function balancedPlan(
  state: LobbyState,
  unplaced: Player[],
  order: TeamId[],
  ctx: Ctx,
): Map<PlayerId, TeamId> {
  const teams = order.map((id) => {
    const members = state.teams[id]?.memberIds ?? [];
    return {
      id,
      size: members.length,
      sum: members.reduce((n, m) => n + points(state.players[m]), 0),
      slots: 0,
      picks: [] as Player[],
    };
  });
  // Hand out the open seats in the order the wheel will fill them: the
  // smallest team, ties rotating on from the team just filled.
  for (let i = 0, next = 0; i < unplaced.length; i++) {
    const rotation = [...teams.slice(next), ...teams.slice(0, next)];
    const smallest = rotation.reduce((best, t) =>
      t.size + t.slots < best.size + best.slots ? t : best,
    );
    smallest.slots += 1;
    next = (teams.indexOf(smallest) + 1) % teams.length;
  }
  // Equal players in a random order (none without a random source, in tests).
  const strongestFirst = shuffled(unplaced, ctx.rng).sort(
    (a, b) => points(b) - points(a),
  );
  for (const player of strongestFirst) {
    const target = teams
      .filter((t) => t.picks.length < t.slots)
      .reduce((best, t) => (t.sum < best.sum ? t : best));
    target.picks.push(player);
    target.sum += points(player);
  }
  // Swap pairs between teams while that brings the totals closer.
  for (let round = 0, improved = true; improved && round < 50; round++) {
    improved = false;
    for (const x of teams)
      for (const y of teams) {
        if (x === y) continue;
        for (let i = 0; i < x.picks.length; i++)
          for (let j = 0; j < y.picks.length; j++) {
            const d =
              points(x.picks[i] as Player) - points(y.picks[j] as Player);
            // Moving d points from x to y helps when x is ahead by more than d.
            if (d > 0 && x.sum - y.sum > d) {
              [x.picks[i], y.picks[j]] = [
                y.picks[j] as Player,
                x.picks[i] as Player,
              ];
              x.sum -= d;
              y.sum += d;
              improved = true;
            }
          }
      }
  }
  const plan = new Map<PlayerId, TeamId>();
  for (const t of teams) for (const p of t.picks) plan.set(p.id, t.id);
  return plan;
}

/**
 * GM: spin the wheel for everyone not on a team yet, e.g. after placing a few
 * people by hand (D34). Teams stay balanced: each spin fills the smallest team.
 */
export function spinRest(state: LobbyState, ctx: Ctx): Result {
  const draft = state.draft;
  if (state.phase !== "teams" || !draft)
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "The wheel only spins during team selection.",
    };
  if (draft.stage !== "complete")
    return invalid("The wheel is already spinning.");
  const unplaced = Object.values(state.players).some(
    (p) => p.status === "active" && !p.waiting && !p.teamId,
  );
  if (!unplaced) return invalid("Everyone connected is already on a team.");
  return done(
    nextSpin(
      {
        ...state,
        draft: {
          ...draft,
          remainingIds: [],
          stage: "revealing",
          nextAt: ctx.now,
        },
      },
      ctx,
    ),
  );
}

/** Alarm-only transition. Clients never submit winners or finish animations. */
export function advanceDraft(state: LobbyState, ctx: Ctx): Result {
  const { draft, lastDraw } = state;
  if (
    state.phase !== "teams" ||
    !draft ||
    draft.nextAt === null ||
    ctx.now < draft.nextAt
  )
    return done(state);
  if (draft.stage === "revealing") return done(nextSpin(state, ctx));
  if (draft.stage !== "spinning" || !lastDraw) return done(state);
  const player = state.players[lastDraw.playerId];
  const team = state.teams[lastDraw.teamId];
  let next = state;
  if (
    player?.status === "active" &&
    !player.waiting &&
    !player.teamId &&
    team
  ) {
    next = {
      ...state,
      players: {
        ...state.players,
        [player.id]: { ...player, teamId: team.id },
      },
      teams: {
        ...state.teams,
        [team.id]: {
          ...team,
          memberIds: [...team.memberIds, player.id],
          captainId: team.captainId ?? player.id,
        },
      },
    };
  }
  return done({
    ...next,
    draft: {
      ...draft,
      remainingIds: draft.remainingIds.filter((id) => id !== lastDraw.playerId),
      stage: "revealing",
      nextAt: ctx.now + WHEEL_REVEAL_MS,
    },
  });
}

export function changeTeam(
  state: LobbyState,
  action: Action,
  actor: Player,
): Result {
  if (state.phase !== "teams") return placeLateJoiner(state, action, actor);
  if (!("teamId" in action)) return invalid("Choose a team.");
  const team = state.teams[action.teamId];
  if (!team) return invalid("That team does not exist.");
  if (state.draft?.stage !== "complete")
    return invalid("Wait for the wheel to finish assigning everyone.");
  const gm = state.roles.gamemasterId === actor.id;
  if (action.type === "nameTeam") {
    if (!gm && team.captainId !== actor.id)
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Only this team's captain or the game master can name it.",
      };
    const check = validateName(action.name);
    if (!check.ok) return invalid(check.message);
    if (
      Object.values(state.teams).some(
        (t) => t.id !== team.id && nameKey(t.name) === nameKey(check.name),
      )
    )
      return invalid("Another team has that name.");
    return done({
      ...state,
      teams: {
        ...state.teams,
        [team.id]: { ...team, name: check.name, nameConfirmed: true },
      },
    });
  }
  if (!gm)
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only the game master can move players.",
    };
  if (action.type !== "addToTeam" && action.type !== "removeFromTeam")
    return invalid("Choose a team action.");
  const player = state.players[action.playerId];
  if (!player) return invalid("That player is not in this room.");
  if (action.type === "removeFromTeam") {
    if (player.teamId !== team.id)
      return invalid("That player is not on this team.");
    return done({
      ...state,
      players: { ...state.players, [player.id]: { ...player, teamId: null } },
    });
  }
  if (player.status !== "active") return invalid("Choose a connected player.");
  return done({
    ...state,
    players: {
      ...state.players,
      [player.id]: { ...player, teamId: team.id, waiting: false },
    },
  });
}

/**
 * After team selection, the GM can still put someone from the waiting room
 * onto a team, during writing or mid-game (D31). Nobody else can be moved.
 */
function placeLateJoiner(
  state: LobbyState,
  action: Action,
  actor: Player,
): Result {
  const open = [
    "writing",
    "roundIntro",
    "turnReady",
    "turnActive",
    "turnReview",
  ].includes(state.phase);
  if (!open || action.type !== "addToTeam")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Teams can only change during team selection.",
    };
  if (state.roles.gamemasterId !== actor.id)
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Only the game master can place players.",
    };
  const team = state.teams[action.teamId];
  const player = state.players[action.playerId];
  if (!team) return invalid("That team does not exist.");
  if (!player || !(player.waiting || !player.teamId))
    return invalid("Only players in the waiting room can be placed now.");
  if (player.status !== "active") return invalid("Choose a connected player.");
  return done({
    ...state,
    players: {
      ...state.players,
      [player.id]: { ...player, teamId: team.id, waiting: false },
    },
  });
}
