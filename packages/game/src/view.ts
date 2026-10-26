import type { Config } from "./config";
import type { LobbyState, Phase, PlayerId, TeamId } from "./types";

export interface PlayerView {
  id: PlayerId;
  name: string;
  status: "active" | "inactive";
  waiting: boolean;
  teamId: TeamId | null;
  isGamemaster: boolean;
  isCavan: boolean;
}

export interface LobbyView {
  code: string;
  phase: Phase;
  config: Config;
  /** In join order. */
  players: PlayerView[];
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
        isCavan: p.id === roles.cavanId,
      }),
    );
  return {
    code: state.code,
    phase: state.phase,
    config: { ...state.config },
    players,
    you: viewer !== null && viewer in state.players ? viewer : null,
  };
}
