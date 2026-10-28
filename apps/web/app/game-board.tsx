"use client";

import type { LobbyView } from "@tmn/game";
import type { CSSProperties } from "react";
import { Fit } from "./fit";
import {
  clockText,
  endedText,
  Podium,
  playerName,
  Scoreboard,
  teamName,
  useTurnClock,
  winnerText,
} from "./game-bits";
import { Icon } from "./icons";

/**
 * The shared screen during the game (D31), sized for a TV (D38); the round
 * name is in the TV header. Never shows a phrase still in play.
 */
export function GameBoard({
  view,
  clockOffset,
}: {
  view: LobbyView;
  clockOffset: number;
}) {
  const game = view.game;
  const { left, countdown } = useTurnClock(game?.turn ?? null, clockOffset);
  if (!game) return null;
  const turn = game.turn;
  const up = playerName(view, turn?.playerId);
  const upTeam = teamName(view, turn?.teamId);
  const ready = view.players.filter(
    (p) => p.teamId && !p.waiting && p.status === "active",
  );
  const pile = (
    <p className="tv-note">
      {game.pileCount} of {game.totalPhrases} phrases left this round
    </p>
  );

  return (
    <section className="tv-game">
      <div className="tv-stage paper-panel">
        {/* Long names or a short window shrink the stage instead of
            clipping it (D42). */}
        <Fit className="tv-stage-fit" innerClassName="tv-stage-inner">
          {view.phase === "roundIntro" && (
            <>
              <p className="tv-eyebrow">Round {game.round} of 3</p>
              <h1 className="tv-title">{game.roundTitle}</h1>
              <p className="tv-rules">{game.roundRules}</p>
              <ul className="tv-ready" aria-label="Who's ready">
                {ready.map((p) => (
                  <li
                    key={p.id}
                    className={`tv-ready-item ${game.acknowledged.includes(p.id) ? "done" : ""}`}
                  >
                    {game.acknowledged.includes(p.id) && <Icon name="check" />}
                    {p.name}
                  </li>
                ))}
              </ul>
              <p className="tv-note">
                Tap “Got it” on your phone when you’re ready.
              </p>
            </>
          )}

          {view.phase === "turnReady" && (
            <>
              <p className="tv-eyebrow">Up next</p>
              <h1 className="tv-title">{turn ? up : "Waiting for players"}</h1>
              {turn && (
                <>
                  <p className="tv-rules">describing for {upTeam}</p>
                  <p className="tv-clock">{clockText(turn.remainingMs)}</p>
                  {turn.carried && (
                    <p className="tv-note">
                      Time carried over from the last round
                    </p>
                  )}
                </>
              )}
              {pile}
            </>
          )}

          {view.phase === "turnActive" && turn && (
            <>
              <p className="tv-clock tv-clock-live" aria-live="off">
                {countdown > 0 ? Math.ceil(countdown / 1000) : clockText(left)}
              </p>
              <div
                className={`tv-timebar ${left <= 10_000 && countdown <= 0 ? "is-low" : ""}`}
                style={
                  {
                    "--left":
                      countdown > 0
                        ? 1
                        : left / Math.max(left, turn.remainingMs, 1),
                  } as CSSProperties
                }
                aria-hidden
              />
              <h1 className="tv-title">
                {countdown > 0 ? `${up}, get ready` : up}
              </h1>
              <p className="tv-rules">
                describing for <strong>{upTeam}</strong>
              </p>
              <p className="tv-points">
                <strong className="tv-points-n">{turn.points}</strong> guessed
              </p>
              {turn.paused && <p className="tv-paused">Paused</p>}
            </>
          )}

          {view.phase === "turnReview" && turn && (
            <>
              <p className="tv-eyebrow">{endedText(view)}</p>
              <h1 className="tv-title">
                {turn.points} for {upTeam}
              </h1>
              {turn.guessed?.length ? (
                <ol className="guessed-list tv-guessed">
                  {turn.guessed.map((p) => (
                    <li key={p}>
                      <Icon name="check" /> {p}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="tv-rules">Nothing guessed</p>
              )}
              <p className="tv-note">
                {up} can still fix a disputed last guess.
              </p>
            </>
          )}

          {view.phase === "results" && (
            <>
              <p className="tv-eyebrow">Final scores</p>
              <h1 className="tv-title tv-title-results">{winnerText(view)}</h1>
              <Podium view={view} big />
            </>
          )}
        </Fit>
      </div>
      <Scoreboard view={view} big />
    </section>
  );
}
