"use client";

import type { EmoteKind, LobbyView, TurnView } from "@tmn/game";
import { type CSSProperties, useEffect, useState } from "react";
import { EmoteIcon, Icon, Medal } from "./icons";
import { teamColor } from "./palette";

// Pieces shared by the phone game screen and the TV game board (D31).

export const EMOTE_LABELS: Record<EmoteKind, string> = {
  laugh: "Laugh",
  clap: "Clap",
  fire: "Fire",
  thumbsUp: "Thumbs up",
  thumbsDown: "Thumbs down",
  tomato: "Throw a tomato",
};

/** m:ss, rounding up so the clock never shows 0:00 with time left. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The turn clock in server time (the server owns time, §5.5). Re-renders a
 * few times a second while the clock or the 3-2-1 countdown is running.
 */
export function useTurnClock(turn: TurnView | null, clockOffset: number) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  const running =
    !!turn && (turn.endsAt !== null || turn.countdownEndsAt !== null);
  useEffect(() => {
    setNow(Date.now() + clockOffset);
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now() + clockOffset), 200);
    return () => clearInterval(timer);
  }, [running, clockOffset]);
  if (!turn) return { left: 0, countdown: 0 };
  const countdown =
    turn.countdownEndsAt === null ? 0 : Math.max(0, turn.countdownEndsAt - now);
  const left =
    turn.endsAt === null
      ? turn.remainingMs
      : Math.max(0, turn.endsAt - Math.max(now, turn.countdownEndsAt ?? now));
  return { left, countdown };
}

export function teamName(view: LobbyView, teamId: string | undefined) {
  return view.teams.find((t) => t.id === teamId)?.name ?? "";
}

export function playerName(view: LobbyView, playerId: string | undefined) {
  return view.players.find((p) => p.id === playerId)?.name ?? "";
}

export function Scoreboard({
  view,
  big = false,
}: {
  view: LobbyView;
  big?: boolean;
}) {
  const game = view.game;
  if (!game) return null;
  const playing = game.turn?.teamId;
  return (
    <ol
      className={`scoreboard ${big ? "scoreboard-big" : ""}`}
      aria-label="Scores"
    >
      {view.teams.map((team, i) => (
        <li
          key={team.id}
          className={`score-team ${team.id === playing && view.phase !== "results" ? "playing" : ""} ${game.winners.includes(team.id) ? "winner" : ""}`}
          style={{ "--team": teamColor(i) } as CSSProperties}
        >
          <span>{team.name}</span>
          <strong>{game.scores[team.id] ?? 0}</strong>
        </li>
      ))}
    </ol>
  );
}

export function endedText(view: LobbyView): string {
  const turn = view.game?.turn;
  const who = playerName(view, turn?.playerId);
  switch (turn?.endedBy) {
    case "timer":
      return "Time's up!";
    case "pile":
      return "Every phrase guessed!";
    case "gm":
      return "Turn ended";
    case "left":
      return `${who} dropped out`;
    default:
      return "";
  }
}

export function winnerText(view: LobbyView): string {
  const winners = view.game?.winners ?? [];
  if (winners.length === 0) return "";
  if (winners.length === 1) return `Winner: ${teamName(view, winners[0])}`;
  return `It's a tie: ${winners.map((id) => teamName(view, id)).join(" and ")}`;
}

/** Most stamps the tally draws before it sums up the rest as "+N". */
const TALLY_MAX = 12;

/**
 * What a turn's review shows (D47): the guessed phrases when this viewer may
 * see them, otherwise one stamp per point so the screen still celebrates.
 */
export function TurnGuesses({
  turn,
  big = false,
}: {
  turn: TurnView;
  big?: boolean;
}) {
  if (turn.points === 0)
    return <p className={big ? "tv-rules" : "m-sub"}>Nothing guessed</p>;
  if (turn.guessed)
    return (
      <ol className={big ? "guessed-list tv-guessed" : "m-guessed"}>
        {turn.guessed.map((p) => (
          // Phrases are unique within a lobby, so the text is a stable key.
          <li key={p}>
            <Icon name="check" /> {p}
          </li>
        ))}
      </ol>
    );
  const over = turn.points > TALLY_MAX;
  const stamps = over ? TALLY_MAX - 1 : turn.points;
  return (
    <div className={`tally ${big ? "tally-big" : ""}`}>
      <ol
        className="tally-marks"
        aria-label={`${turn.points} phrase${turn.points === 1 ? "" : "s"} guessed`}
      >
        {Array.from({ length: stamps }, (_, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: stamps are identical
            key={i}
            className="tally-mark"
            style={{ "--i": i } as CSSProperties}
            aria-hidden
          >
            <Icon name="check" />
          </li>
        ))}
        {over && (
          <li
            className="tally-mark tally-more"
            style={{ "--i": stamps } as CSSProperties}
            aria-hidden
          >
            +{turn.points - stamps}
          </li>
        )}
      </ol>
      <p className="tally-note">The phrases stay secret</p>
    </div>
  );
}

/** Floating reactions over the whole TV screen, in every phase (D31). */
const PLACES = { 1: "First", 2: "Second", 3: "Third" } as const;

/**
 * The top three describers on pedestals (D36): 2nd, 1st, 3rd from left to
 * right. Ties share a pedestal, so a place can hold several names or none.
 */
export function Podium({
  view,
  big = false,
}: {
  view: LobbyView;
  big?: boolean;
}) {
  const leaders = view.game?.leaders ?? [];
  if (!leaders.length) return null;
  return (
    <figure className={`podium ${big ? "podium-big" : ""}`}>
      <figcaption className="eyebrow">TOP DESCRIBERS</figcaption>
      <ol className="podium-steps">
        {([1, 2, 3] as const).map((place) => {
          const here = leaders.filter((l) => l.place === place);
          return (
            <li key={place} className={`podium-step place-${place}`}>
              {/* A tie shares one points line, so a crowded step stays short. */}
              <div className="podium-names">
                {here.map((l) => (
                  <span
                    key={l.playerId}
                    className={`podium-name ${here.length > 2 ? "podium-name-small" : ""}`}
                  >
                    {playerName(view, l.playerId)}
                  </span>
                ))}
                {here[0] && (
                  <small className="podium-points">
                    {here[0].points}{" "}
                    {here[0].points === 1 ? "phrase" : "phrases"}
                    {here.length > 1 ? " each" : ""}
                  </small>
                )}
              </div>
              <div className="podium-block">
                <Medal place={place} />
                <span className="sr-only">{PLACES[place]} place</span>
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/** A repeatable 0–1 value for one emote's seed and one property. */
function noise(seed: number, salt: number) {
  let t = (seed + Math.imul(salt, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 2 ** 32;
}
const between = (seed: number, salt: number, min: number, max: number) =>
  min + noise(seed, salt) * (max - min);

/** Scatters each emote: its own spot, drift, spin, size and speed. */
function emoteStyle(seed: number) {
  return {
    "--x": `${between(seed, 1, 6, 94)}%`,
    "--y": `${between(seed, 2, 22, 86)}%`,
    "--dx": `${between(seed, 3, -5, 5)}vw`,
    "--rise": `${between(seed, 4, 8, 24)}vh`,
    "--rot": `${between(seed, 5, -28, 28)}deg`,
    // A multiple of the TV unit, so emotes scale with the screen (D38).
    "--size": between(seed, 6, 2.6, 5).toFixed(2),
    "--dur": `${between(seed, 7, 2.4, 3.3)}s`,
  } as CSSProperties;
}

export function EmoteLayer({
  emotes,
}: {
  emotes: { id: number; seed: number; name: string; kind: EmoteKind }[];
}) {
  return (
    <div className="emote-layer" aria-hidden>
      {emotes.map((e) => (
        <span key={e.id} className="emote-float" style={emoteStyle(e.seed)}>
          <EmoteIcon kind={e.kind} />
          <small>{e.name}</small>
        </span>
      ))}
    </div>
  );
}
