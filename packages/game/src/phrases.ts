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
  if (
    existing.filter((p) => p.authorId === actor.id).length >=
    state.config.phrasesPerPlayer
  )
    return fail("You have already written all your phrases.");
  if (existing.some((p) => nameKey(p.text) === nameKey(text)))
    return fail("That phrase is already in the pile.");
  const id = ctx.newId();
  return {
    ok: true,
    state: {
      ...state,
      phrases: { ...state.phrases, [id]: { id, authorId: actor.id, text } },
    },
    effects: [],
  };
}
