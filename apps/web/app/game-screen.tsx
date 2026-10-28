"use client";

import { EMOTES, type LobbyView } from "@tmn/game";
import { useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import {
  clockText,
  EMOTE_ICONS,
  EMOTE_LABELS,
  endedText,
  playerName,
  RoundBanner,
  Scoreboard,
  teamName,
  useTurnClock,
  winnerText,
} from "./game-bits";

type Send = (action: LobbyAction) => void;

/** The phone during rounds, turns, review and results (D31). */
export function GameScreen({
  view,
  send,
  clockOffset,
}: {
  view: LobbyView;
  send: Send;
  clockOffset: number;
}) {
  const game = view.game;
  const { left, countdown } = useTurnClock(game?.turn ?? null, clockOffset);
  if (!game) return null;
  const me = view.players.find((p) => p.id === view.you);
  const amGm = me?.isGamemaster ?? false;
  const turn = game.turn;
  const mine = !!turn && turn.playerId === view.you;
  const up = playerName(view, turn?.playerId);
  const upTeam = teamName(view, turn?.teamId);
  const gm = view.players.find((p) => p.isGamemaster);
  const playing = !!me?.teamId && !me.waiting;

  return (
    <section className="game-screen">
      <RoundBanner view={view} />
      <Scoreboard view={view} />

      {me?.waiting && (
        <p className="waiting-note">
          You joined mid-game. {gm?.name ?? "The game master"} can put you on a
          team.
        </p>
      )}

      {view.phase === "roundIntro" && (
        <div className="paper-panel game-card">
          <p className="eyebrow">ROUND {game.round}</p>
          <h2 className="game-title">{game.roundTitle}</h2>
          <p className="round-rules">{game.roundRules}</p>
          {turn?.carried && (
            <p className="fine-print">
              {up} keeps going with {clockText(turn.remainingMs)} left from the
              last round.
            </p>
          )}
          {playing &&
            (game.acknowledged.includes(view.you ?? "") ? (
              <p className="waiting-note">Ready. Waiting for everyone else…</p>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => send({ type: "acknowledge" })}
              >
                Got it <span aria-hidden>✓</span>
              </button>
            ))}
          <p className="fine-print">
            {game.acknowledged.length} /{" "}
            {
              view.players.filter(
                (p) => p.teamId && !p.waiting && p.status === "active",
              ).length
            }{" "}
            ready
          </p>
          {amGm && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => send({ type: "beginRound" })}
            >
              Start the round now
            </button>
          )}
        </div>
      )}

      {view.phase === "turnReady" && (
        <div className="paper-panel game-card">
          {turn ? (
            <>
              <p className="eyebrow">UP NEXT</p>
              <h2 className="game-title">{mine ? "You're up!" : up}</h2>
              <p>
                {mine
                  ? `Describe phrases for ${upTeam}. ${gm?.name ?? "The game master"} starts your turn.`
                  : `for ${upTeam}`}
              </p>
              <p className="turn-clock">{clockText(turn.remainingMs)}</p>
              {turn.carried && <p className="fine-print">Time carried over</p>}
            </>
          ) : (
            <p className="waiting-note">
              Waiting for someone on a team to connect.
            </p>
          )}
          {amGm && (
            <div className="game-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => send({ type: "startTurn" })}
              >
                Start {mine ? "my" : up ? `${up}'s` : "the"} turn{" "}
                <span aria-hidden>→</span>
              </button>
              {turn && <TimeAdjust send={send} />}
              {game.canRestartPrevious && (
                <RestartPrevious view={view} send={send} />
              )}
            </div>
          )}
        </div>
      )}

      {view.phase === "turnActive" && turn && (
        <>
          {mine ? (
            <div className="paper-panel game-card active-turn">
              {countdown > 0 ? (
                <div className="countdown" aria-live="assertive">
                  <span>{Math.ceil(countdown / 1000)}</span>
                  <p>Get ready…</p>
                </div>
              ) : (
                <>
                  <p className="turn-clock" aria-live="off">
                    {clockText(left)}
                  </p>
                  <p className="phrase-card" aria-live="polite">
                    {turn.currentPhrase}
                  </p>
                  {turn.paused && <p className="waiting-note">Paused</p>}
                  <button
                    type="button"
                    className="btn-primary big-next"
                    disabled={turn.paused}
                    onClick={() => send({ type: "next" })}
                  >
                    Got it <span aria-hidden>✓</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={turn.points === 0}
                    onClick={() => send({ type: "back" })}
                  >
                    <span aria-hidden>←</span> Back (undo)
                  </button>
                  <p className="fine-print">{turn.points} this turn</p>
                </>
              )}
            </div>
          ) : (
            <div className="paper-panel game-card">
              <p className="turn-clock">
                {countdown > 0 ? "Get ready" : clockText(left)}
              </p>
              <h2 className="game-title">{up}</h2>
              <p>
                {me?.teamId === turn.teamId
                  ? "is describing for your team. Guess!"
                  : `is describing for ${upTeam}. No hints!`}
              </p>
              <p className="fine-print">{turn.points} guessed so far</p>
              {turn.paused && <p className="waiting-note">Paused</p>}
              {amGm && turn.revealed && turn.currentPhrase && (
                <p className="phrase-card phrase-peek">{turn.currentPhrase}</p>
              )}
            </div>
          )}
          {amGm && (
            <div className="paper-panel game-card gm-controls">
              <p className="eyebrow">GAME MASTER</p>
              <div className="game-actions">
                {turn.paused ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => send({ type: "resumeTimer" })}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => send({ type: "pauseTimer" })}
                  >
                    Pause
                  </button>
                )}
                {turn.paused && <TimeAdjust send={send} />}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => send({ type: "endTurn" })}
                >
                  End turn
                </button>
                {!mine && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => send({ type: "reveal" })}
                  >
                    {turn.revealed ? "Hide phrase" : "Reveal phrase"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {view.phase === "turnReview" && turn && (
        <div className="paper-panel game-card">
          <p className="eyebrow">{endedText(view).toUpperCase()}</p>
          <h2 className="game-title">
            {turn.points} for {upTeam}
          </h2>
          <GuessedList phrases={turn.guessed} />
          {mine && (
            <div className="review-fix">
              <p className="fine-print">
                Disputed last guess? Back un-counts it; Forward counts it again.
              </p>
              {turn.currentPhrase && (
                <p className="phrase-card phrase-small">
                  <span className="eyebrow">NOT COUNTED</span>
                  {turn.currentPhrase}
                </p>
              )}
              <div className="game-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={turn.cursor === 0}
                  onClick={() => send({ type: "back" })}
                >
                  <span aria-hidden>←</span> Back
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={turn.cursor >= turn.maxCursor}
                  onClick={() => send({ type: "forward" })}
                >
                  Forward <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          )}
          {amGm ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => send({ type: "proceed" })}
            >
              Proceed <span aria-hidden>→</span>
            </button>
          ) : (
            <p className="fine-print">
              Waiting for {gm?.name ?? "the game master"} to continue.
            </p>
          )}
        </div>
      )}

      {view.phase === "results" && (
        <div className="paper-panel game-card">
          <p className="eyebrow">FINAL SCORES</p>
          <h2 className="game-title">{winnerText(view)}</h2>
          {amGm ? (
            <div className="game-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => send({ type: "playAgain" })}
              >
                Play again <span aria-hidden>↺</span>
              </button>
              {game.canRestartPrevious && (
                <RestartPrevious view={view} send={send} />
              )}
            </div>
          ) : (
            <p className="fine-print">
              {gm?.name ?? "The game master"} can start another game.
            </p>
          )}
        </div>
      )}

      {!mine && view.phase !== "results" && <EmoteBar send={send} />}
    </section>
  );
}

function GuessedList({ phrases }: { phrases: string[] | null }) {
  if (!phrases?.length)
    return <p className="fine-print">Nothing guessed this turn.</p>;
  return (
    <ol className="guessed-list">
      {phrases.map((p) => (
        // Phrases are unique within a lobby, so the text is a stable key.
        <li key={p}>
          <span aria-hidden>✓</span> {p}
        </li>
      ))}
    </ol>
  );
}

function TimeAdjust({ send }: { send: Send }) {
  return (
    <fieldset className="time-adjust">
      <legend className="sr-only">Adjust time</legend>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => send({ type: "addTime", ms: -10_000 })}
      >
        −10s
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => send({ type: "addTime", ms: 10_000 })}
      >
        +10s
      </button>
    </fieldset>
  );
}

function RestartPrevious({ view, send }: { view: LobbyView; send: Send }) {
  const [seconds, setSeconds] = useState(view.config.roundLengthSec);
  return (
    <details className="restart-previous">
      <summary>Restart the previous turn</summary>
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "restartPrevTurn", ms: seconds * 1000 });
        }}
      >
        <label htmlFor="restart-seconds">
          Time for the restarted turn (seconds)
        </label>
        <input
          id="restart-seconds"
          className="field"
          type="number"
          min={1}
          max={600}
          value={seconds}
          onChange={(e) =>
            setSeconds(Math.min(600, Math.max(1, Number(e.target.value) || 1)))
          }
        />
        <p className="fine-print">
          Undoes that turn's points and puts its phrases back.
        </p>
        <button type="submit" className="btn-secondary">
          Restart turn
        </button>
      </form>
    </details>
  );
}

function EmoteBar({ send }: { send: Send }) {
  return (
    <fieldset className="emote-bar">
      <legend className="sr-only">Send a reaction to the big screen</legend>
      {EMOTES.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-label={EMOTE_LABELS[kind]}
          onClick={() => send({ type: "emote", kind })}
        >
          <span aria-hidden>{EMOTE_ICONS[kind]}</span>
        </button>
      ))}
    </fieldset>
  );
}
