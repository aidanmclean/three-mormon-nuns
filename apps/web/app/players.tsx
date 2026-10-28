"use client";

import { type LobbyView, NAME_MAX_LEN, type PlayerView } from "@tmn/game";
import { useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import { Icon } from "./icons";
import { Avatar, Fold, PlayerName } from "./phone";

type Send = (action: LobbyAction) => void;

/**
 * Everyone in the room. For the GM each row opens a small menu of big
 * buttons, one player at a time, instead of controls on every row (D39).
 */
export function PlayerList({
  view,
  send,
  cavanEditable = false,
  placeable = false,
}: {
  view: LobbyView;
  send: Send;
  /** Cavan can be chosen until the game starts (D30). */
  cavanEditable?: boolean;
  /** Waiting players can be put on a team after team selection (D31). */
  placeable?: boolean;
}) {
  const amGm = view.players.find((p) => p.id === view.you)?.isGamemaster;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="m-list">
      {view.players.map((player) => (
        <li key={player.id}>
          <div className="m-row">
            <Avatar player={player} />
            <PlayerName
              player={player}
              you={player.id === view.you}
              showCavan={amGm}
            />
            {player.waiting && <span className="m-chip">waiting</span>}
            {amGm && (
              <button
                type="button"
                className="m-icon-btn"
                aria-label={`Manage ${player.name}`}
                aria-expanded={open === player.id}
                onClick={() => setOpen(open === player.id ? null : player.id)}
              >
                <Icon name={open === player.id ? "close" : "more"} />
              </button>
            )}
          </div>
          {amGm && open === player.id && (
            <PlayerMenu
              view={view}
              player={player}
              send={send}
              cavanEditable={cavanEditable}
              placeable={placeable}
              onDone={() => setOpen(null)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function PlayerMenu({
  view,
  player,
  send,
  cavanEditable,
  placeable,
  onDone,
}: {
  view: LobbyView;
  player: PlayerView;
  send: Send;
  cavanEditable: boolean;
  placeable: boolean;
  onDone: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(player.name);
  const isYou = player.id === view.you;
  const online = player.status === "active";
  const act = (action: LobbyAction) => {
    send(action);
    onDone();
  };
  if (renaming)
    return (
      <form
        className="m-menu m-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          act({ type: "rename", playerId: player.id, name });
        }}
      >
        <input
          aria-label={`New name for ${player.name}`}
          className="m-field"
          value={name}
          maxLength={NAME_MAX_LEN}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="m-btn-small">
          Save
        </button>
      </form>
    );
  return (
    <div className="m-menu">
      {placeable &&
        player.waiting &&
        online &&
        view.teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className="m-btn-small m-btn-small-strong"
            onClick={() =>
              act({ type: "addToTeam", teamId: team.id, playerId: player.id })
            }
          >
            Put on {team.name}
          </button>
        ))}
      {!player.isGamemaster && online && (
        <button
          type="button"
          className="m-btn-small"
          onClick={() => act({ type: "setGamemaster", playerId: player.id })}
        >
          <Icon name="crown" /> Make game master
        </button>
      )}
      {cavanEditable && !player.isGamemaster && (
        <button
          type="button"
          className="m-btn-small"
          onClick={() =>
            act({
              type: "setCavan",
              playerId: player.isCavan ? null : player.id,
            })
          }
        >
          <Icon name="magnifier" />{" "}
          {player.isCavan ? "Not Cavan" : "Make Cavan"}
        </button>
      )}
      <button
        type="button"
        className="m-btn-small"
        onClick={() => setRenaming(true)}
      >
        Rename
      </button>
      {!isYou && (
        <button
          type="button"
          className="m-btn-small m-btn-danger"
          onClick={() => act({ type: "kick", playerId: player.id })}
        >
          Kick
        </button>
      )}
    </div>
  );
}

/** The GM's player tools after the lobby, folded away. */
export function ManagePlayers({ view, send }: { view: LobbyView; send: Send }) {
  const waiting = view.players.filter(
    (p) => p.waiting && p.status === "active",
  ).length;
  return (
    <Fold
      title="Players"
      hint={waiting ? `${waiting} waiting` : `${view.players.length} here`}
      open={waiting > 0}
    >
      <PlayerList
        view={view}
        send={send}
        cavanEditable={view.phase === "teams" || view.phase === "writing"}
        placeable={view.phase !== "teams"}
      />
    </Fold>
  );
}
