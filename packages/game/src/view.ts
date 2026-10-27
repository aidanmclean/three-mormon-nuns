import type { Config } from "./config";
import type {
  LobbyState,
  Phase,
  Phrase,
  PlayerId,
  Team,
  TeamId,
} from "./types";

export interface PlayerView {
  id: PlayerId;
  name: string;
  status: "active" | "inactive";
  waiting: boolean;
  teamId: TeamId | null;
  isGamemaster: boolean;
  phraseCount: number;
}

export interface LobbyView {
  code: string;
  phase: Phase;
  config: Config;
  /** In join order. */
  players: PlayerView[];
  teams: Team[];
  lastDraw: LobbyState["lastDraw"];
  draft: LobbyState["draft"];
  ownPhrases: Phrase[];
  /** The viewer's own player id, or null for the host screen and unjoined sockets. */
  you: PlayerId | null;
}

/**
 * The only thing ever sent to clients (§5.3). Copies fields explicitly so a
 * new secret on Player (like `token`) can't leak by accident.
 */
export function viewFor(state: LobbyState, viewer: PlayerId | null): LobbyView {
  const { roles } = state;
  const players = Object.values(state.players)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
    .map(
      (p): PlayerView => ({
        id: p.id,
        name: p.name,
        status: p.status,
        waiting: p.waiting,
        teamId: p.teamId,
        isGamemaster: p.id === roles.gamemasterId,
        phraseCount: Object.values(state.phrases).filter(
          (phrase) => phrase.authorId === p.id,
        ).length,
      }),
    );
  return {
    code: state.code,
    phase: state.phase,
    config: { ...state.config },
    players,
    teams: state.teamOrder.flatMap((id) => {
      const team = state.teams[id];
      return team
        ? [
            {
              id: team.id,
              name: team.name,
              nameConfirmed: team.nameConfirmed,
              captainId: team.captainId,
              memberIds: [...team.memberIds],
            },
          ]
        : [];
    }),
    lastDraw: state.lastDraw
      ? {
          ...state.lastDraw,
          candidates: state.lastDraw.candidates.map((p) => ({
            id: p.id,
            name: p.name,
          })),
        }
      : null,
    draft: state.draft
      ? { ...state.draft, remainingIds: [...state.draft.remainingIds] }
      : null,
    ownPhrases: Object.values(state.phrases)
      .filter((p) => p.authorId === viewer)
      .map((p) => ({ id: p.id, authorId: p.authorId, text: p.text })),
    you: viewer !== null && viewer in state.players ? viewer : null,
  };
}
