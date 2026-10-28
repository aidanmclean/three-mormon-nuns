"use client";

import type { LobbyView, PlayerView, Team } from "@tmn/game";
import type { CSSProperties, ReactNode } from "react";
import { Logo } from "@/app/brand";
import { Fit } from "@/app/fit";
import { EmoteLayer } from "@/app/game-bits";
import { GameBoard } from "@/app/game-board";
import { Icon } from "@/app/icons";
import { NameWheel } from "@/app/name-wheel";
import { playerColor } from "@/app/palette";
import type { EmoteBurst } from "@/lib/use-lobby";

// The shared screen, laid out for a TV across the room (D38). Everything is
// sized in `--u` (1% of a 16:9 screen's width), so it scales with the screen
// and never scrolls. Phones keep their own components; nothing here sends.

export function TvBoard({
  view,
  clockOffset,
  emotes,
  addresses,
  connected,
}: {
  view: LobbyView;
  clockOffset: number;
  emotes: EmoteBurst[];
  addresses: string[];
  connected: boolean;
}) {
  const inGame = view.game !== null;
  return (
    <div className="tv">
      <EmoteLayer emotes={emotes} />
      {!connected && <p className="tv-reconnecting">Reconnecting…</p>}
      <TvHeader view={view} addresses={addresses} />
      <main className="tv-main">
        {view.phase === "lobby" ? (
          <TvLobby view={view} addresses={addresses} />
        ) : view.phase === "teams" ? (
          <TvTeams view={view} clockOffset={clockOffset} />
        ) : view.phase === "writing" ? (
          <TvWriting view={view} />
        ) : (
          <GameBoard view={view} clockOffset={clockOffset} />
        )}
      </main>
      {!inGame && <TvFooter view={view} />}
    </div>
  );
}

function phaseLabel(view: LobbyView) {
  const game = view.game;
  if (view.phase === "lobby") return "Lobby";
  if (view.phase === "teams") return "Picking teams";
  if (view.phase === "writing") return "Writing phrases";
  if (view.phase === "results" || !game) return "Game over";
  return `Round ${game.round} of 3 · ${game.roundTitle}`;
}

function TvHeader({
  view,
  addresses,
}: {
  view: LobbyView;
  addresses: string[];
}) {
  return (
    <header className="tv-header">
      <div className="tv-brand">
        <Logo />
      </div>
      <p className="tv-phase">{phaseLabel(view)}</p>
      {view.phase !== "lobby" && (
        <p className="tv-join-chip">
          <span>Join at</span>
          <strong>{addresses[0] ?? "…"}</strong>
          <span>code</span>
          <strong className="tv-join-code">{view.code}</strong>
        </p>
      )}
    </header>
  );
}

function TvFooter({ view }: { view: LobbyView }) {
  const { config } = view;
  const gm = view.players.find((p) => p.isGamemaster);
  const turn = `${Math.floor(config.roundLengthSec / 60)}:${String(config.roundLengthSec % 60).padStart(2, "0")}`;
  return (
    <footer className="tv-footer">
      <ul className="tv-rules-list" aria-label="House rules">
        <li>
          <strong>{turn}</strong> per turn
        </li>
        <li>
          <strong>{config.teamCount}</strong> teams
        </li>
        <li>
          <strong>{config.phrasesPerPlayer}</strong>{" "}
          {config.phrasesPerPlayer === 1 ? "phrase" : "phrases"} each
        </li>
        <li>
          up to <strong>{config.maxWordsPerPhrase}</strong> words
        </li>
        <li>
          <strong>3</strong> rounds
        </li>
        {config.showGuessed && (
          <li>
            guessed phrases <strong>shown</strong>
          </li>
        )}
      </ul>
      <p className="tv-gm">
        {gm ? (
          <>
            <Icon name="crown" className="tv-gm-crown" />{" "}
            <strong>{gm.name}</strong> is the game master
          </>
        ) : (
          "The first to join is the game master"
        )}
      </p>
    </footer>
  );
}

/** A comic, slanted fraction: a big numerator up top, the total below (D38). */
function TvCount({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  return (
    <div
      className="tv-count"
      role="img"
      aria-label={`${value} of ${total} ${label}`}
    >
      <span className="tv-count-num">{value}</span>
      <span className="tv-count-bar" aria-hidden />
      <span className="tv-count-den">{total}</span>
    </div>
  );
}

function TvLobby({
  view,
  addresses,
}: {
  view: LobbyView;
  addresses: string[];
}) {
  const players = view.players;
  // Tiles shrink as the room fills so every full name fits (D39).
  const density =
    players.length > 15
      ? "s"
      : players.length > 10
        ? "m"
        : players.length > 6
          ? "l"
          : "xl";
  return (
    <div className="tv-lobby">
      <section className="tv-join" aria-label="How to join">
        <h1>Join on your phone</h1>
        <ol className="tv-join-steps">
          <li>
            <span className="tv-step-no">1</span>
            <div>
              <p className="tv-step-label">Go to</p>
              <p className="tv-address">{addresses[0] ?? "…"}</p>
            </div>
          </li>
          <li>
            <span className="tv-step-no">2</span>
            <div>
              <p className="tv-step-label">Enter the code</p>
              <p className="tv-code">{view.code}</p>
            </div>
          </li>
          <li>
            <span className="tv-step-no">3</span>
            <div>
              <p className="tv-step-label">Type your name</p>
            </div>
          </li>
        </ol>
        {addresses.length > 1 && (
          <p className="tv-small">
            Not working? Try {addresses.slice(1).join(" or ")}
          </p>
        )}
      </section>
      <section className="tv-players" aria-label="Players">
        <div className="tv-players-heading">
          <h2>Players</h2>
          <TvCount
            value={players.length}
            total={view.config.maxPlayers}
            label="players here"
          />
        </div>
        {players.length === 0 ? (
          <div className="tv-empty">
            <p className="tv-empty-title">Waiting for players…</p>
            <p>Grab your phone and follow the steps on the left.</p>
          </div>
        ) : (
          <ul className="tv-player-grid" data-density={density}>
            {players.map((p) => (
              <PlayerTile key={p.id} player={p} />
            ))}
          </ul>
        )}
        {players.length > 0 && (
          <p className="tv-legend">
            <span>
              <Icon name="crown" /> game master
            </span>
          </p>
        )}
      </section>
    </div>
  );
}

function PlayerTile({ player }: { player: PlayerView }) {
  const offline = player.status === "inactive";
  return (
    <li
      className={`tv-player ${offline ? "is-offline" : ""}`}
      style={{ background: playerColor(player.id) }}
    >
      <span className="tv-player-name">{player.name}</span>
      {player.isGamemaster && <Icon name="crown" label="Game master" />}
      {offline && <Icon name="wifiOff" label="Offline" className="tv-off" />}
    </li>
  );
}

function TvTeams({
  view,
  clockOffset,
}: {
  view: LobbyView;
  clockOffset: number;
}) {
  const gm =
    view.players.find((p) => p.isGamemaster)?.name ?? "The game master";
  const complete = view.draft?.stage === "complete";
  const manual = view.draft?.mode === "manual";
  const spinning = !complete && !!view.lastDraw;
  const unplaced = view.players.filter(
    (p) => !p.teamId && !p.waiting && p.status === "active",
  );
  const title = spinning
    ? "Wheel of names"
    : manual && unplaced.length > 0
      ? "Picking teams"
      : "Name your teams";
  const subtitle = spinning
    ? "One name at a time. The first on each team is captain."
    : manual && unplaced.length > 0
      ? `${gm} is putting everyone on a team.`
      : "Captains: name your team on your phone.";
  return (
    <div className={`tv-teams ${spinning ? "is-spinning" : ""}`}>
      <div className="tv-heading">
        <h1>{title}</h1>
        <p className="tv-subtitle">{subtitle}</p>
      </div>
      <div className="tv-teams-body">
        {spinning && (
          <div className="tv-wheel">
            <NameWheel
              key={view.lastDraw?.sequence}
              view={view}
              clockOffset={clockOffset}
              fit
            />
          </div>
        )}
        <div className="tv-team-area">
          {unplaced.length > 0 && !spinning && (
            <p className="tv-pool">
              <span>Not on a team yet:</span>
              {unplaced.map((p) => (
                <strong key={p.id} className="tv-pool-name">
                  {p.name}
                </strong>
              ))}
            </p>
          )}
          <TeamColumns view={view} />
        </div>
      </div>
    </div>
  );
}

function TeamColumns({
  view,
  detail,
}: {
  view: LobbyView;
  detail?: (player: PlayerView) => ReactNode;
}) {
  // Every team uses the same row count, so names line up across columns.
  const biggest = Math.max(0, ...view.teams.map((t) => t.memberIds.length));
  const cols = biggest > 16 ? 3 : biggest > 7 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(biggest / cols));
  return (
    <ul
      className="tv-team-grid"
      data-teams={Math.min(view.teams.length, 4)}
      data-density={rows > 6 ? "dense" : rows > 4 ? "medium" : "roomy"}
      style={{ "--rows": rows } as CSSProperties}
    >
      {view.teams.map((team, i) => (
        <TeamColumn
          key={team.id}
          team={team}
          index={i}
          view={view}
          detail={detail}
        />
      ))}
    </ul>
  );
}

function TeamColumn({
  team,
  index,
  view,
  detail,
}: {
  team: Team;
  index: number;
  view: LobbyView;
  detail?: (player: PlayerView) => ReactNode;
}) {
  return (
    <li className={`tv-team tv-team-${index % 4}`}>
      <div className="tv-team-head">
        <h2>{team.name}</h2>
        <span className="tv-small">
          {team.nameConfirmed ? (
            <>
              <Icon name="check" /> named
            </>
          ) : (
            "needs a name"
          )}
        </span>
      </div>
      {/* Names never get cut off: long teams wrap into more columns, and the
          list shrinks if it still doesn't fit (D42). */}
      <Fit className="tv-members-fit">
        <ul className="tv-members">
          {team.memberIds.map((id) => {
            const p = view.players.find((player) => player.id === id);
            if (!p) return null;
            return (
              <li
                key={id}
                className={p.status === "inactive" ? "is-offline" : undefined}
              >
                <span className="tv-member-name">{p.name}</span>
                {p.isGamemaster && <Icon name="crown" label="Game master" />}
                {team.captainId === id && (
                  <span className="tv-tag">CAPTAIN</span>
                )}
                {detail?.(p)}
              </li>
            );
          })}
          {team.memberIds.length === 0 && (
            <li className="tv-members-empty">No one yet</li>
          )}
        </ul>
      </Fit>
    </li>
  );
}

function TvWriting({ view }: { view: LobbyView }) {
  const quota = view.config.phrasesPerPlayer;
  const gm =
    view.players.find((p) => p.isGamemaster)?.name ?? "the game master";
  const writers = view.players.filter(
    (p) => p.teamId && !p.waiting && p.status === "active",
  );
  const ready = writers.filter((p) => p.approvedCount >= quota).length;
  const pending = view.players.reduce(
    (n, p) => n + Math.max(0, p.phraseCount - p.approvedCount),
    0,
  );
  const done = writers.length > 0 && ready === writers.length && pending === 0;
  return (
    <div className="tv-writing">
      <div className="tv-heading tv-heading-row">
        <div>
          <h1>Write your phrases</h1>
          <p className="tv-subtitle">
            {quota} each · up to {view.config.maxWordsPerPhrase} words · keep
            them secret
          </p>
        </div>
        <TvCount value={ready} total={writers.length} label="players ready" />
      </div>
      <TeamColumns
        view={view}
        detail={(p) => (
          <Pips
            done={Math.min(p.approvedCount, quota)}
            pending={Math.max(
              0,
              Math.min(p.phraseCount, quota) - p.approvedCount,
            )}
            quota={quota}
          />
        )}
      />
      <p className="tv-banner">
        {done
          ? `All phrases are in! Waiting for ${gm} to start the game.`
          : "Write on your phone. Nobody else can see your phrases."}
      </p>
    </div>
  );
}

/** Writing progress as dots: approved, waiting for the GM, still to write. */
function Pips({
  done,
  pending,
  quota,
}: {
  done: number;
  pending: number;
  quota: number;
}) {
  return (
    <span
      className="tv-pips"
      role="img"
      aria-label={`${done} of ${quota} written${pending ? `, ${pending} waiting for approval` : ""}`}
    >
      <span
        className="pips pip-done"
        style={{ "--n": done } as CSSProperties}
      />
      <span
        className="pips pip-pending"
        style={{ "--n": pending } as CSSProperties}
      />
      <span
        className="pips pip-todo"
        style={{ "--n": Math.max(0, quota - done - pending) } as CSSProperties}
      />
    </span>
  );
}
