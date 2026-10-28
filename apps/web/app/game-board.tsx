"use client";

import type { LobbyView } from "@tmn/game";
import {
  clockText,
  endedText,
  playerName,
  RoundBanner,
  Scoreboard,
  teamName,
  useTurnClock,
  winnerText,
} from "./game-bits";

/** The shared screen during the game (D31). Never shows a phrase still in play. */
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

  return (
    <section className="tv-game">
      <RoundBanner view={view} />
      <div className="tv-stage paper-panel">
        {view.phase === "roundIntro" && (
          <>
            <p className="eyebrow">ROUND {game.round} OF 3</p>
            <h1 className="tv-title">{game.roundTitle}</h1>
            <p className="tv-rules">{game.roundRules}</p>
            <ul className="tv-ready" aria-label="Who's ready">
              {ready.map((p) => (
                <li
                  key={p.id}
                  className={game.acknowledged.includes(p.id) ? "done" : ""}
                >
                  {game.acknowledged.includes(p.id) ? "✓ " : ""}
                  {p.name}
                </li>
              ))}
            </ul>
          </>
        )}

        {view.phase === "turnReady" && (
          <>
            <p className="eyebrow">UP NEXT</p>
            <h1 className="tv-title">{turn ? up : "Waiting for players"}</h1>
            {turn && (
              <>
                <p className="tv-rules">for {upTeam}</p>
                <p className="tv-clock">{clockText(turn.remainingMs)}</p>
                {turn.carried && (
                  <p className="fine-print">
                    Time carried over from the last round
                  </p>
                )}
              </>
            )}
          </>
        )}

        {view.phase === "turnActive" && turn && (
          <>
            <p className="tv-clock" aria-live="off">
              {countdown > 0 ? Math.ceil(countdown / 1000) : clockText(left)}
            </p>
            <h1 className="tv-title">
              {countdown > 0 ? `${up}, get ready` : up}
            </h1>
            <p className="tv-rules">
              describing for <strong>{upTeam}</strong> · {turn.points} guessed
            </p>
            {turn.paused && <p className="waiting-note">Paused</p>}
          </>
        )}

        {view.phase === "turnReview" && turn && (
          <>
            <p className="eyebrow">{endedText(view).toUpperCase()}</p>
            <h1 className="tv-title">
              {turn.points} for {upTeam}
            </h1>
            {turn.guessed?.length ? (
              <ol className="guessed-list tv-guessed">
                {turn.guessed.map((p) => (
                  <li key={p}>
                    <span aria-hidden>✓</span> {p}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tv-rules">Nothing guessed</p>
            )}
            <p className="fine-print">
              {up} can still fix a disputed last guess.
            </p>
          </>
        )}

        {view.phase === "results" && (
          <>
            <p className="eyebrow">FINAL SCORES</p>
            <h1 className="tv-title">{winnerText(view)}</h1>
          </>
        )}
      </div>
      <Scoreboard view={view} big />
    </section>
  );
}
