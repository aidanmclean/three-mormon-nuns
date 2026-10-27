import { WHEEL_REVEAL_MS, WHEEL_SPIN_MS } from "./constants";
import { nameKey, validateName } from "./names";
import type { Action, Ctx, Result } from "./reducer";
import type { LobbyState, Player, Team } from "./types";

const done = (state: LobbyState): Result => ({ ok: true, state, effects: [] });
const invalid = (message: string): Result => ({
  ok: false,
  code: "INVALID",
  message,
});

export function startDraft(state: LobbyState, ctx: Ctx): Result {
  if (state.phase !== "lobby")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Team selection has already started.",
    };
  const remainingIds = Object.values(state.players)
    .filter((p) => p.status === "active")
    .map((p) => p.id);
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
  const players = Object.fromEntries(
    Object.values(state.players).map((p) => [
      p.id,
      { ...p, waiting: p.status !== "active" },
    ]),
  );
  return done(
    nextSpin(
      {
        ...state,
        phase: "teams",
        players,
        teams,
        teamOrder,
        draft: {
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
  const candidates = draft.remainingIds.flatMap((id) => {
    const p = state.players[id];
    return p && p.status === "active" && !p.waiting && !p.teamId
      ? [{ id, name: p.name }]
      : [];
  });
  if (!candidates.length)
    return {
      ...state,
      draft: { ...draft, remainingIds: [], stage: "complete", nextAt: null },
    };
  // Choose the smallest team, rotating ties. Normally this is A, B, A, B.
  const order = [
    ...state.teamOrder.slice(draft.nextTeamIndex),
    ...state.teamOrder.slice(0, draft.nextTeamIndex),
  ];
  const teamId = order.reduce(
    (best, id) =>
      (state.teams[id]?.memberIds.length ?? 0) <
      (state.teams[best]?.memberIds.length ?? 0)
        ? id
        : best,
    order[0] ?? "",
  );
  const pick = candidates[Math.floor((ctx.rng?.() ?? 0) * candidates.length)];
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
  if (state.phase !== "teams")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Teams can only change during team selection.",
    };
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
