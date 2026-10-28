"use client";

import { type LobbyView, NAME_MAX_LEN, type Team } from "@tmn/game";
import { type CSSProperties, useRef, useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import { Icon } from "./icons";
import { NameWheel } from "./name-wheel";
import { teamColor } from "./palette";
import { Avatar, BigButton, DockHint, PhoneShell, PlayerName } from "./phone";
import { ManagePlayers } from "./players";

type Send = (action: LobbyAction) => void;

/**
 * Team selection on a phone (D28, D32, D34, D39, D42): your own team comes
 * first, and a captain gets a big "name your team" card at the top.
 */
export function TeamBoard({
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
  const gm =
    view.players.find((p) => p.isGamemaster)?.name ?? "The game master";
  const complete = view.draft?.stage === "complete";
  const manual = view.draft?.mode === "manual";
  const spinning = !complete && !!view.lastDraw;
  const unplaced = view.players.filter(
    (p) => !p.teamId && !p.waiting && p.status === "active",
  );
  const unnamed = view.teams.filter((t) => !t.nameConfirmed).length;
  const emptyTeam = view.teams.some(
    (t) =>
      !t.memberIds.some(
        (id) => view.players.find((p) => p.id === id)?.status === "active",
      ),
  );
  const ready = complete && !unplaced.length && !unnamed && !emptyTeam;
  const myTeam = view.teams.find((t) => t.id === me?.teamId);
  const captain = !!myTeam && myTeam.captainId === me?.id;
  // Your own team matters most, so it goes first; colours keep the team's
  // real position so they match the TV.
  const teams = view.teams
    .map((team, index) => ({ team, index }))
    .sort((a, b) => Number(b.team === myTeam) - Number(a.team === myTeam));
  const title = spinning
    ? "Wheel of names"
    : !complete
      ? "Picking teams"
      : manual && unplaced.length
        ? "Pick the teams"
        : "Name your teams";
  const sub = spinning
    ? captain
      ? "You’re a captain! You’ll name your team when the wheel stops."
      : "Names are drawn one at a time. The first on each team is captain."
    : !complete
      ? `${gm} is setting up the teams.`
      : amGm
        ? manual && unplaced.length
          ? "Tap a team next to each name, or spin for the rest."
          : "Captains name their teams. Tap a player to move them."
        : !myTeam
          ? `${gm} will put you on a team.`
          : !myTeam.nameConfirmed
            ? `${captainName(view, myTeam)} is naming your team.`
            : unnamed
              ? "Waiting for the other teams to pick names."
              : `All set! ${gm} starts the phrase writing next.`;

  return (
    <PhoneShell
      view={view}
      phase="Teams"
      dock={
        amGm && complete ? (
          <>
            <BigButton
              disabled={!ready}
              onClick={() => send({ type: "confirmTeams" })}
            >
              Start writing
            </BigButton>
            <DockHint>
              {ready
                ? "Everyone has a team and every team has a name."
                : unplaced.length
                  ? `Put ${unplaced.length === 1 ? (unplaced[0]?.name ?? "1 player") : `${unplaced.length} players`} on a team first.`
                  : emptyTeam
                    ? "Every team needs someone connected."
                    : `Waiting for ${unnamed} team name${unnamed === 1 ? "" : "s"}.`}
            </DockHint>
          </>
        ) : undefined
      }
    >
      {/* A captain's naming card is the hero; nobody needs both. */}
      {complete && captain && myTeam && !myTeam.nameConfirmed ? (
        <NameYourTeam
          key={myTeam.id}
          team={myTeam}
          index={view.teams.indexOf(myTeam)}
          send={send}
        />
      ) : (
        <section className="m-hero">
          <h1>{title}</h1>
          <p className="m-sub">{sub}</p>
        </section>
      )}

      {spinning && (
        <div className="m-wheel">
          <NameWheel
            key={view.lastDraw?.sequence}
            view={view}
            clockOffset={clockOffset}
          />
        </div>
      )}

      {amGm && complete && unplaced.length > 0 && (
        <section className="m-card m-card-flush">
          <div className="m-card-head">
            <h2>Not on a team yet</h2>
            <span className="m-count">
              <strong>{unplaced.length}</strong>
            </span>
          </div>
          <ul className="m-list">
            {unplaced.map((p) => (
              <li key={p.id}>
                <div className="m-row">
                  <Avatar player={p} />
                  <PlayerName
                    player={p}
                    you={p.id === view.you}
                    showCavan={amGm}
                  />
                </div>
                <div className="m-menu m-menu-teams">
                  {view.teams.map((team, i) => (
                    <button
                      key={team.id}
                      type="button"
                      className="m-btn-small m-btn-small-strong"
                      style={{ background: teamColor(i) }}
                      aria-label={`Put ${p.name} on ${team.name}`}
                      onClick={() =>
                        send({
                          type: "addToTeam",
                          teamId: team.id,
                          playerId: p.id,
                        })
                      }
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="m-card-foot">
            <button
              type="button"
              className="m-btn-small m-btn-wide"
              onClick={() => send({ type: "spinRest" })}
            >
              <Icon name="spin" /> Spin the wheel for{" "}
              {unplaced.length === 1 ? unplaced[0]?.name : "the rest"}
            </button>
          </div>
        </section>
      )}

      {teams.map(({ team, index }) => (
        <TeamCard
          key={team.id}
          team={team}
          index={index}
          view={view}
          compact={spinning}
          send={complete ? send : undefined}
        />
      ))}

      {amGm && <ManagePlayers view={view} send={send} />}
    </PhoneShell>
  );
}

function captainName(view: LobbyView, team: Team) {
  return (
    view.players.find((p) => p.id === team.captainId)?.name ?? "Your captain"
  );
}

/** The captain's job, front and centre: one big field and one big button. */
function NameYourTeam({
  team,
  index,
  send,
}: {
  team: Team;
  index: number;
  send: Send;
}) {
  const [name, setName] = useState("");
  const field = useRef<HTMLInputElement>(null);
  return (
    <section
      className="m-card m-callout"
      style={{ "--team": teamColor(index) } as CSSProperties}
    >
      <p className="m-callout-eyebrow">You’re the captain</p>
      <h2>Name your team</h2>
      <form
        className="m-callout-form"
        onSubmit={(e) => {
          e.preventDefault();
          // The button stays tappable; an empty name just puts you back in
          // the field.
          if (name.trim()) send({ type: "nameTeam", teamId: team.id, name });
          else field.current?.focus();
        }}
      >
        <input
          ref={field}
          className="m-field m-field-big"
          aria-label={`Name for ${team.name}`}
          placeholder={`e.g. The ${["Holy Rollers", "Nunchucks", "Choir", "Sisters"][index % 4]}`}
          value={name}
          maxLength={NAME_MAX_LEN}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
        <BigButton type="submit" tone="go" icon="check">
          Save team name
        </BigButton>
      </form>
      <p className="m-callout-note">
        It shows on the TV. You can rename it until writing starts.
      </p>
    </section>
  );
}

function TeamCard({
  team,
  index,
  view,
  compact,
  send,
}: {
  team: Team;
  index: number;
  view: LobbyView;
  compact: boolean;
  send?: Send;
}) {
  const me = view.players.find((p) => p.id === view.you);
  const amGm = !!me?.isGamemaster;
  const mine = !!view.you && team.memberIds.includes(view.you);
  const captain = team.captainId === view.you;
  const canName = !!send && (amGm || captain);
  const [name, setName] = useState(team.nameConfirmed ? team.name : "");
  const [editing, setEditing] = useState(false);
  // A captain's first name goes in the big card above, not here.
  const showForm =
    canName && (editing || (!team.nameConfirmed && !(mine && captain)));
  const others = view.teams.filter((t) => t.id !== team.id);
  const members = team.memberIds.flatMap((id) => {
    const p = view.players.find((player) => player.id === id);
    return p ? [p] : [];
  });
  return (
    <section
      className={`m-card m-card-flush m-team ${mine ? "is-mine" : ""}`}
      style={{ "--team": teamColor(index) } as CSSProperties}
    >
      <div className="m-team-head">
        <div className="m-team-title">
          {mine && <span className="m-team-eyebrow">Your team</span>}
          <h2>{team.name}</h2>
        </div>
        {team.nameConfirmed && canName && !editing ? (
          <button
            type="button"
            className="m-link"
            onClick={() => {
              setName(team.name);
              setEditing(true);
            }}
          >
            Rename
          </button>
        ) : (
          <span className="m-team-state">
            {team.nameConfirmed ? (
              <>
                <Icon name="check" /> named
              </>
            ) : (
              "needs a name"
            )}
          </span>
        )}
      </div>
      {send && !team.nameConfirmed && !showForm && !(mine && captain) && (
        <p className="m-team-naming">
          {team.captainId
            ? `${captainName(view, team)} (captain) picks the name`
            : "The first player on the team picks the name"}
        </p>
      )}
      {showForm && (
        <form
          className="m-inline-form m-team-form"
          onSubmit={(e) => {
            e.preventDefault();
            send?.({ type: "nameTeam", teamId: team.id, name });
            setEditing(false);
          }}
        >
          <input
            className="m-field"
            aria-label={`Name for ${team.name}`}
            placeholder="Team name"
            value={name}
            maxLength={NAME_MAX_LEN}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="m-btn-small m-btn-small-strong"
            disabled={!name.trim()}
          >
            Save
          </button>
        </form>
      )}
      {compact ? (
        <ul className="m-team-chips">
          {members.map((p) => (
            <li key={p.id} className={p.id === view.you ? "is-you" : undefined}>
              {p.name}
              {team.captainId === p.id && (
                <span className="m-team-chip-tag">captain</span>
              )}
            </li>
          ))}
          {!members.length && (
            <li className="m-team-chips-empty">No one yet</li>
          )}
        </ul>
      ) : (
        <ul className="m-list">
          {members.map((p) => {
            const row = (
              <div className="m-row">
                <Avatar player={p} />
                <PlayerName
                  player={p}
                  you={p.id === view.you}
                  showCavan={amGm}
                />
                {team.captainId === p.id && (
                  <span className="m-chip">captain</span>
                )}
                {amGm && send && (
                  <Icon name="chevronDown" className="m-member-chevron" />
                )}
              </div>
            );
            return (
              <li key={p.id}>
                {amGm && send ? (
                  <details className="m-member">
                    <summary aria-label={`Move ${p.name}`}>{row}</summary>
                    <div className="m-menu">
                      {others.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="m-btn-small"
                          onClick={() =>
                            send({
                              type: "addToTeam",
                              teamId: t.id,
                              playerId: p.id,
                            })
                          }
                        >
                          Move to {t.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="m-btn-small m-btn-danger"
                        onClick={() =>
                          send({
                            type: "removeFromTeam",
                            teamId: team.id,
                            playerId: p.id,
                          })
                        }
                      >
                        Take off team
                      </button>
                    </div>
                  </details>
                ) : (
                  row
                )}
              </li>
            );
          })}
          {!members.length && <li className="m-empty-row">No one yet</li>}
        </ul>
      )}
    </section>
  );
}
