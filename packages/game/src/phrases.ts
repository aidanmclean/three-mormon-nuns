import { PHRASE_MAX_LEN } from "./constants";
import { cleanName, nameKey } from "./names";
import type { Action, Ctx, Result } from "./reducer";
import type { LobbyState, Player } from "./types";

export function phraseAction(
  state: LobbyState,
  action: Action,
  actor: Player,
  ctx: Ctx,
): Result {
  const fail = (message: string): Result => ({
    ok: false,
    code: "INVALID",
    message,
  });
  if (state.phase !== "writing")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Phrases can only be edited during writing.",
    };
  if (actor.waiting || !actor.teamId)
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You need a team before writing phrases.",
    };
  if (action.type === "deletePhrase") {
    const phrase = state.phrases[action.phraseId];
    if (!phrase || phrase.authorId !== actor.id)
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "You can only remove your own phrases.",
      };
    const { [phrase.id]: removed, ...phrases } = state.phrases;
    void removed;
    return { ok: true, state: { ...state, phrases }, effects: [] };
  }
  if (action.type !== "submitPhrase") return fail("Choose a phrase action.");
  const text = cleanName(action.text);
  if (!text || [...text].length > PHRASE_MAX_LEN)
    return fail(`Use between 1 and ${PHRASE_MAX_LEN} characters.`);
  if (text.split(/\s+/u).length > state.config.maxWordsPerPhrase)
    return fail(`Use at most ${state.config.maxWordsPerPhrase} words.`);
  const existing = Object.values(state.phrases);
  // Rejected phrases don't count toward the quota; the author writes another (D30).
  if (
    existing.filter((p) => p.authorId === actor.id && p.status !== "rejected")
      .length >= state.config.phrasesPerPlayer
  )
    return fail("You have already written all your phrases.");
  if (existing.some((p) => nameKey(p.text) === nameKey(text)))
    return fail("That phrase is already in the pile.");
  const id = ctx.newId();
  return {
    ok: true,
    state: {
      ...state,
      phrases: {
        ...state.phrases,
        [id]: {
          id,
          authorId: actor.id,
          text,
          // Every phrase Cavan writes waits for the GM (D30).
          status: actor.id === state.roles.cavanId ? "pending" : "approved",
        },
      },
    },
    effects: [],
  };
}

/** Phases in which the GM may still choose who Cavan is (D30). */
const CAVAN_PHASES = ["lobby", "teams", "writing"];

/** GM-only Cavan controls (D30). The caller has already checked the actor is GM. */
export function moderationAction(state: LobbyState, action: Action): Result {
  if (action.type === "setCavan") {
    if (!CAVAN_PHASES.includes(state.phase))
      return {
        ok: false,
        code: "WRONG_PHASE",
        message: "Cavan can't change once the game starts.",
      };
    const target =
      action.playerId === null ? null : state.players[action.playerId];
    if (action.playerId !== null && !target)
      return {
        ok: false,
        code: "INVALID",
        message: "That player isn't in the lobby.",
      };
    if (target && target.id === state.roles.gamemasterId)
      return {
        ok: false,
        code: "INVALID",
        message: "The game master vets Cavan, so they can't be Cavan.",
      };
    const before = state.roles.cavanId;
    const after = target?.id ?? null;
    // The new Cavan's phrases go back for vetting; the old Cavan's pending ones are cleared.
    const phrases = Object.fromEntries(
      Object.entries(state.phrases).map(([id, p]) => [
        id,
        p.authorId === after && p.status === "approved"
          ? { ...p, status: "pending" as const }
          : p.authorId === before &&
              p.authorId !== after &&
              p.status === "pending"
            ? { ...p, status: "approved" as const }
            : p,
      ]),
    );
    return {
      ok: true,
      state: { ...state, phrases, roles: { ...state.roles, cavanId: after } },
      effects: [],
    };
  }
  if (action.type !== "approvePhrase" && action.type !== "rejectPhrase")
    return { ok: false, code: "INVALID", message: "Choose a phrase action." };
  if (state.phase !== "writing")
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Phrases can only be vetted during writing.",
    };
  const phrase = state.phrases[action.phraseId];
  if (phrase?.status !== "pending")
    return {
      ok: false,
      code: "INVALID",
      message: "That phrase isn't waiting for approval.",
    };
  return {
    ok: true,
    state: {
      ...state,
      phrases: {
        ...state.phrases,
        [phrase.id]: {
          ...phrase,
          status: action.type === "approvePhrase" ? "approved" : "rejected",
        },
      },
    },
    effects: [],
  };
}
