"use client";

import { type LobbyView, NAME_MAX_LEN, type PlayerView } from "@tmn/game";
import { useState } from "react";
import { Masthead, Steps } from "@/app/brand";
import { Settings } from "@/app/settings";
import { TeamBoard } from "@/app/team-board";
import { WritingScreen } from "@/app/writing-screen";
import type { LobbyAction } from "@/lib/use-lobby";

type Send = (action: LobbyAction) => void;

export function LobbyScreen({
  view,
  send,
  clockOffset = 0,
}: {
  view: LobbyView;
  send: Send;
  clockOffset?: number;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const amGm = me?.isGamemaster ?? false;
  const gm = view.players.find((p) => p.isGamemaster);
  const active = view.players.filter((p) => p.status === "active").length;
  const phase =
    view.phase === "teams"
      ? "teams"
      : view.phase === "writing"
        ? "writing"
        : "lobby";

  return (
    <div className="site-shell">
      <Masthead label="LOBBY" />
      <main className="player-shell">
        <Steps current={phase} />
        <div className="room-ticket">
          <div>
            <span className="eyebrow">
              YOUR ROOM / {view.players.length} OF {view.config.maxPlayers} HERE
            </span>
            <p>
              {me?.name}
              {amGm ? " · Game master" : ""}
            </p>
          </div>
          <strong>{view.code}</strong>
        </div>
        {view.phase !== "lobby" ? (
          <>
            {view.phase === "writing" ? (
              <WritingScreen view={view} send={send} />
            ) : (
              <TeamBoard view={view} send={send} clockOffset={clockOffset} />
            )}
            {amGm && (
              <details className="paper-panel mt-6">
                <summary className="cursor-pointer p-4 font-semibold">
                  Manage players
                </summary>
                <ul>
                  {view.players.map((player) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isYou={player.id === view.you}
                      canManage={amGm}
                      send={send}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <>
            <div className="page-heading">
              <h1>Lobby</h1>
              <p>{active} players connected</p>
            </div>
            <div className="lobby-layout">
              <section className="paper-panel">
                <div className="panel-heading">
                  <h2>Players</h2>
                  <span className="badge">{active} ONLINE</span>
                </div>
                <ul>
                  {view.players.map((player) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      isYou={player.id === view.you}
                      canManage={amGm}
                      send={send}
                    />
                  ))}
                </ul>
              </section>
              <section className="paper-panel">
                <div className="panel-heading">
                  <h2>House rules</h2>
                  {amGm && <span className="badge">EDITABLE</span>}
                </div>
                <Settings
                  compact
                  config={view.config}
                  onChange={
                    amGm
                      ? (config) => send({ type: "updateConfig", config })
                      : undefined
                  }
                />
              </section>
            </div>
            <div className="lobby-action">
              {amGm ? (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={active < view.config.teamCount}
                    onClick={() => send({ type: "startTeams" })}
                  >
                    Everyone’s in <span aria-hidden>→</span>
                  </button>
                  <p className="fine-print">
                    {active < view.config.teamCount
                      ? `Waiting for ${view.config.teamCount - active} more connected player(s), so every team has someone.`
                      : "This closes the roster and starts the wheel."}
                  </p>
                </>
              ) : (
                <p className="waiting-note">
                  {gm?.name ?? "Your game master"} will start team selection.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function PlayerRow({
  player,
  isYou,
  canManage,
  send,
}: {
  player: PlayerView;
  isYou: boolean;
  canManage: boolean;
  send: Send;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(player.name);
  const inactive = player.status === "inactive";
  return (
    <li className="border-b border-foreground/15 p-4 last:border-0">
      <div className="flex items-center gap-2">
        <span className="player-avatar" aria-hidden>
          {inactive ? "[--]" : "[:)]"}
        </span>
        <span
          className={`min-w-0 flex-1 break-words font-semibold ${inactive ? "offline" : ""}`}
        >
          {player.name}
          {isYou && <span className="text-xs font-normal"> (you)</span>}
          {inactive && <span className="text-xs font-normal"> · offline</span>}
        </span>
        {player.isGamemaster && <span className="badge">GM</span>}
        {canManage && (
          <button
            type="button"
            aria-label={`Manage ${player.name}`}
            aria-expanded={open}
            className="px-2 py-1 text-xl"
            onClick={() => setOpen(!open)}
          >
            ⋯
          </button>
        )}
      </div>
      {canManage && open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!player.isGamemaster && !inactive && (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() =>
                send({ type: "setGamemaster", playerId: player.id })
              }
            >
              Make game master
            </button>
          )}

          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setRenaming(!renaming)}
          >
            Rename
          </button>
          {!isYou && (
            <button
              type="button"
              className="btn-secondary text-xs text-red-700"
              onClick={() => send({ type: "kick", playerId: player.id })}
            >
              Kick
            </button>
          )}
        </div>
      )}
      {canManage && open && renaming && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "rename", playerId: player.id, name: newName });
            setRenaming(false);
          }}
        >
          <input
            aria-label="New name"
            className="field flex-1"
            value={newName}
            maxLength={NAME_MAX_LEN * 2}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Save
          </button>
        </form>
      )}
    </li>
  );
}
