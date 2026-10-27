"use client";

import { type LobbyView, NAME_MAX_LEN, type Team } from "@tmn/game";
import { useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import { NameWheel } from "./name-wheel";

type Send = (action: LobbyAction) => void;

export function TeamBoard({
  view,
  send,
  clockOffset = 0,
}: {
  view: LobbyView;
  send?: Send;
  clockOffset?: number;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const gm = view.players.find((p) => p.isGamemaster);
  const complete = view.draft?.stage === "complete";
  const unassigned = view.players.filter(
    (p) => !p.teamId && !p.waiting && p.status === "active",
  );
  const waiting = view.players.filter((p) => p.waiting);
  const ready =
    complete &&
    !unassigned.length &&
    view.teams.every(
      (t) =>
        t.nameConfirmed &&
        t.memberIds.some((id) =>
          view.players.some((p) => p.id === id && p.status === "active"),
        ),
    );
  return (
    <section
      className={`team-selection ${complete ? "draft-complete" : "draft-running"}`}
    >
      <div className="page-heading">
        <h1>{complete ? "Name your teams" : "Wheel of names"}</h1>
        <p>
          {complete
            ? "Captains: save a name for your team."
            : "Players are assigned one at a time. The first on each team is captain."}
        </p>
      </div>
      {view.lastDraw && (
        <NameWheel
          key={view.lastDraw.sequence}
          view={view}
          clockOffset={clockOffset}
        />
      )}
      {complete && unassigned.length > 0 && (
        <p className="waiting-note mb-5">
          Unassigned: {unassigned.map((p) => p.name).join(", ")}. The game
          master can place them below.
        </p>
      )}
      {waiting.length > 0 && (
        <p className="waiting-note mb-5">
          Joined after “Everyone’s in”: {waiting.map((p) => p.name).join(", ")}.
          {complete && " The game master can add them to a team."}
        </p>
      )}
      <div className="team-grid">
        {view.teams.map((team, i) => (
          <TeamCard
            key={team.id}
            team={team}
            number={i + 1}
            view={view}
            send={complete ? send : undefined}
          />
        ))}
      </div>
      {complete && (
        <div className="lobby-action">
          {me?.isGamemaster && send ? (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={!ready}
                onClick={() => send({ type: "confirmTeams" })}
              >
                Start writing phrases <span aria-hidden>→</span>
              </button>
              <p className="fine-print">
                {ready
                  ? "Everyone is assigned and every team has a saved name."
                  : "Each team needs a saved name and a connected player. Assign everyone before continuing."}
              </p>
            </>
          ) : (
            <p className="waiting-note">
              {gm?.name ?? "The game master"} starts writing when the teams are
              ready.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TeamCard({
  team,
  number,
  view,
  send,
}: {
  team: Team;
  number: number;
  view: LobbyView;
  send?: Send;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const canName = !!send && !!(me?.isGamemaster || team.captainId === view.you);
  const [name, setName] = useState(team.nameConfirmed ? team.name : "");
  const [pick, setPick] = useState("");
  const candidates = view.players.filter(
    (p) => p.status === "active" && p.teamId !== team.id,
  );
  return (
    <article className="team-card">
      <header className="team-card-header">
        <p className="eyebrow">
          TEAM {number} / {team.memberIds.length} PLAYERS
        </p>
        <h2>{team.name}</h2>
        <p className="fine-print">
          {team.nameConfirmed ? "Name saved ✓" : "Waiting for a team name"}
        </p>
        {canName && (
          <form
            className="team-name-form"
            onSubmit={(e) => {
              e.preventDefault();
              send?.({ type: "nameTeam", teamId: team.id, name });
            }}
          >
            <input
              className="field"
              aria-label={`Name for ${team.name}`}
              placeholder="Team name"
              value={name}
              maxLength={NAME_MAX_LEN * 2}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={!name.trim()}
            >
              Save name
            </button>
          </form>
        )}
      </header>
      <ul className="team-members">
        {team.memberIds.map((id) => {
          const p = view.players.find((player) => player.id === id);
          return p ? (
            <li
              key={id}
              className={`team-member ${p.status === "inactive" ? "offline" : ""}`}
            >
              <span>
                {p.name}
                {p.id === view.you && " (you)"}
                {p.status === "inactive" && " · offline"}
              </span>
              {team.captainId === id && <span className="badge">CAPTAIN</span>}
              {send && me?.isGamemaster && (
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Remove ${p.name} from ${team.name}`}
                  onClick={() =>
                    send({
                      type: "removeFromTeam",
                      teamId: team.id,
                      playerId: id,
                    })
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ) : null;
        })}
        {!team.memberIds.length && (
          <li className="py-5 text-sm">No players assigned yet.</li>
        )}
      </ul>
      {send && me?.isGamemaster && (
        <div className="team-tools">
          <div className="pick-player">
            <select
              aria-label={`Move player to ${team.name}`}
              className="field"
              value={candidates.some((p) => p.id === pick) ? pick : ""}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Move a player here…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.waiting ? " (waiting)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!candidates.some((p) => p.id === pick)}
              onClick={() => {
                send({ type: "addToTeam", teamId: team.id, playerId: pick });
                setPick("");
              }}
            >
              Move
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
