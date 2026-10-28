"use client";

import type { LobbyView, TeamMode } from "@tmn/game";
import { useState } from "react";
import { GameScreen } from "@/app/game-screen";
import { BigButton, DockHint, Fold, PhoneShell } from "@/app/phone";
import { PlayerList } from "@/app/players";
import { Settings } from "@/app/settings";
import { TeamBoard } from "@/app/team-board";
import { WritingScreen } from "@/app/writing-screen";
import type { LobbyAction } from "@/lib/use-lobby";

type Send = (action: LobbyAction) => void;

/** A player's phone: one screen per phase (D39). */
export function LobbyScreen({
  view,
  send,
  clockOffset = 0,
}: {
  view: LobbyView;
  send: Send;
  clockOffset?: number;
}) {
  if (view.phase === "teams")
    return <TeamBoard view={view} send={send} clockOffset={clockOffset} />;
  if (view.phase === "writing")
    return <WritingScreen view={view} send={send} />;
  if (view.phase !== "lobby")
    return <GameScreen view={view} send={send} clockOffset={clockOffset} />;
  return <Lobby view={view} send={send} />;
}

function ruleSummary(view: LobbyView) {
  const { config } = view;
  const turn = `${Math.floor(config.roundLengthSec / 60)}:${String(config.roundLengthSec % 60).padStart(2, "0")}`;
  return `${turn} turns · ${config.teamCount} teams · ${config.phrasesPerPlayer} phrases`;
}

function Lobby({ view, send }: { view: LobbyView; send: Send }) {
  const me = view.players.find((p) => p.id === view.you);
  const amGm = me?.isGamemaster ?? false;
  const gm = view.players.find((p) => p.isGamemaster);
  const active = view.players.filter((p) => p.status === "active").length;
  const short = view.config.teamCount - active;
  const [teamMode, setTeamMode] = useState<TeamMode>("wheel");

  return (
    <PhoneShell
      view={view}
      phase="Lobby"
      dock={
        amGm ? (
          <>
            <BigButton
              disabled={short > 0}
              onClick={() => send({ type: "startTeams", mode: teamMode })}
            >
              Everyone’s in
            </BigButton>
            <DockHint>
              {short > 0
                ? `Waiting for ${short} more player${short === 1 ? "" : "s"}, so every team has someone.`
                : teamMode === "wheel"
                  ? "Closes the room and spins the wheel."
                  : "Closes the room for team creation."}
            </DockHint>
          </>
        ) : undefined
      }
    >
      <section className="m-hero">
        <h1>{amGm ? "You’re the game master" : "You’re in!"}</h1>
        <p className="m-sub">
          {amGm
            ? "Wait for everyone to join, then start below."
            : `Watch the TV. ${gm?.name ?? "The game master"} starts when everyone’s here.`}
        </p>
      </section>

      <section className="m-card m-card-flush">
        <div className="m-card-head">
          <h2>Players</h2>
          <span className="m-count">
            <strong>{view.players.length}</strong> / {view.config.maxPlayers}
          </span>
        </div>
        <PlayerList view={view} send={send} cavanEditable />
      </section>

      {amGm && (
        <fieldset className="m-seg">
          <legend>How should teams be made?</legend>
          {(
            [
              ["wheel", "Spin the wheel", "Random and even"],
              ["manual", "Pick them myself", "You choose"],
            ] as const
          ).map(([mode, title, detail]) => (
            <label
              key={mode}
              className={teamMode === mode ? "is-selected" : undefined}
            >
              <input
                type="radio"
                name="team-mode"
                value={mode}
                checked={teamMode === mode}
                onChange={() => setTeamMode(mode)}
              />
              <strong>{title}</strong>
              <span>{detail}</span>
            </label>
          ))}
        </fieldset>
      )}

      <Fold
        title="House rules"
        hint={amGm ? "Edit" : ruleSummary(view)}
        className="m-rules"
      >
        <Settings
          compact
          config={view.config}
          onChange={
            amGm
              ? (config) => send({ type: "updateConfig", config })
              : undefined
          }
        />
      </Fold>
    </PhoneShell>
  );
}
