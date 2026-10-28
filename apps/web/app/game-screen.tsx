"use client";

import { EMOTES, type LobbyView } from "@tmn/game";
import { type CSSProperties, type ReactNode, useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import {
  clockText,
  EMOTE_LABELS,
  endedText,
  Podium,
  playerName,
  Scoreboard,
  TurnGuesses,
  teamName,
  useTurnClock,
  winnerText,
} from "./game-bits";
import { EmoteIcon, Icon } from "./icons";
import { BigButton, DockHint, Fold, PhoneShell } from "./phone";
import { ManagePlayers } from "./players";

type Send = (action: LobbyAction) => void;

/**
 * The phone during rounds, turns, review and results (D31, D39): one card
 * for what's happening, one big action in the dock, GM extras folded away.
 */
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
  const gm =
    view.players.find((p) => p.isGamemaster)?.name ?? "the game master";
  const playing = !!me?.teamId && !me.waiting;
  const describing = mine && view.phase === "turnActive";
  const phase =
    view.phase === "results"
      ? "Results"
      : `Round ${game.round} · ${game.roundTitle}`;
  const acked = game.acknowledged.includes(view.you ?? "");
  const readyCount = game.acknowledged.length;
  const readyTotal = view.players.filter(
    (p) => p.teamId && !p.waiting && p.status === "active",
  ).length;

  let dock: ReactNode = null;
  if (view.phase === "roundIntro") {
    dock = (
      <>
        {playing && !acked && (
          <BigButton icon="check" onClick={() => send({ type: "acknowledge" })}>
            Got it
          </BigButton>
        )}
        {playing && acked && (
          <DockHint>
            Ready! {readyCount} of {readyTotal} in.
          </DockHint>
        )}
        {amGm && (
          <button
            type="button"
            className="m-btn-small m-btn-wide"
            onClick={() => send({ type: "beginRound" })}
          >
            Don’t wait, start the round
          </button>
        )}
      </>
    );
  } else if (view.phase === "turnReady" && amGm) {
    dock = turn ? (
      <BigButton icon="play" onClick={() => send({ type: "startTurn" })}>
        Start {mine ? "my" : `${up}’s`} turn
      </BigButton>
    ) : (
      <DockHint>Waiting for someone on a team to connect.</DockHint>
    );
  } else if (describing && turn && countdown <= 0) {
    dock = (
      <>
        <BigButton
          icon="check"
          tone="go"
          disabled={turn.paused}
          onClick={() => send({ type: "next" })}
        >
          Got it
        </BigButton>
        <button
          type="button"
          className="m-btn-small m-btn-wide"
          disabled={turn.points === 0}
          onClick={() => send({ type: "back" })}
        >
          <Icon name="arrowLeft" /> Undo last
        </button>
      </>
    );
  } else if (view.phase === "turnActive" && amGm && turn) {
    dock = (
      <div className="m-btn-row">
        {turn.paused ? (
          <button
            type="button"
            className="m-btn-small m-btn-small-strong"
            onClick={() => send({ type: "resumeTimer" })}
          >
            <Icon name="play" /> Resume
          </button>
        ) : (
          <button
            type="button"
            className="m-btn-small"
            onClick={() => send({ type: "pauseTimer" })}
          >
            <Icon name="pause" /> Pause
          </button>
        )}
        <button
          type="button"
          className="m-btn-small"
          onClick={() => send({ type: "endTurn" })}
        >
          <Icon name="stop" /> End turn
        </button>
      </div>
    );
  } else if (view.phase === "turnReview" && amGm) {
    dock = (
      <BigButton onClick={() => send({ type: "proceed" })}>Next turn</BigButton>
    );
  } else if (view.phase === "results" && amGm) {
    dock = (
      <BigButton icon="undo" onClick={() => send({ type: "playAgain" })}>
        Play again
      </BigButton>
    );
  }
  const emotes = !describing && view.phase !== "results";

  return (
    <PhoneShell
      view={view}
      phase={phase}
      dock={
        dock || emotes ? (
          <>
            {dock}
            {emotes && <EmoteBar send={send} />}
          </>
        ) : undefined
      }
    >
      {!describing && <Scoreboard view={view} />}

      {me?.waiting && (
        <p className="m-note m-note-box">
          You joined mid-game. {gm} can put you on a team.
        </p>
      )}

      {view.phase === "roundIntro" && (
        <section className="m-card m-stage">
          <span className="m-eyebrow">Round {game.round} of 3</span>
          <h1 className="m-big">{game.roundTitle}</h1>
          <p className="m-rules">{game.roundRules}</p>
          {turn?.carried && (
            <p className="m-note">
              {up} keeps going with {clockText(turn.remainingMs)} left.
            </p>
          )}
        </section>
      )}

      {view.phase === "turnReady" && (
        <section className={`m-card m-stage ${mine ? "is-you" : ""}`}>
          {turn ? (
            <>
              <span className="m-eyebrow">Up next</span>
              <h1 className="m-big">{mine ? "You’re up!" : up}</h1>
              <p className="m-sub">
                {mine
                  ? `Describe for ${upTeam}. Keep your screen hidden.`
                  : `describing for ${upTeam}`}
              </p>
              <p className="m-clock">{clockText(turn.remainingMs)}</p>
              {turn.carried && <p className="m-note">Time carried over</p>}
              {mine && !amGm && (
                <p className="m-note">{gm} starts your turn.</p>
              )}
            </>
          ) : (
            <p className="m-sub">Waiting for someone on a team to connect.</p>
          )}
        </section>
      )}

      {view.phase === "turnActive" && turn && describing && (
        <section className="m-describe">
          {countdown > 0 ? (
            <div className="m-countdown" aria-live="assertive">
              <span>{Math.ceil(countdown / 1000)}</span>
              <p className="m-countdown-label">Get ready…</p>
            </div>
          ) : (
            <>
              <TimeBar left={left} total={turn.remainingMs} />
              <p className="m-phrase-card" aria-live="polite">
                {turn.currentPhrase}
              </p>
              <p className="m-sub">
                <strong>{turn.points}</strong> guessed this turn
              </p>
              {turn.paused && <p className="m-paused">Paused</p>}
            </>
          )}
        </section>
      )}

      {view.phase === "turnActive" && turn && !describing && (
        <section className="m-card m-stage">
          <p className="m-clock">
            {countdown > 0 ? Math.ceil(countdown / 1000) : clockText(left)}
          </p>
          <TimeBar
            left={countdown > 0 ? 1 : left}
            total={countdown > 0 ? 1 : turn.remainingMs}
          />
          <h1 className="m-big">{up}</h1>
          <p className="m-sub">
            {me?.teamId === turn.teamId
              ? "is describing for your team. Guess!"
              : `is describing for ${upTeam}. No hints!`}
          </p>
          <p className="m-sub">
            <strong>{turn.points}</strong> guessed so far
          </p>
          {turn.paused && <p className="m-paused">Paused</p>}
          {amGm && turn.revealed && turn.currentPhrase && (
            <p className="m-phrase-peek">{turn.currentPhrase}</p>
          )}
        </section>
      )}

      {view.phase === "turnReview" && turn && (
        <section className="m-card m-stage">
          <span className="m-eyebrow">{endedText(view)}</span>
          <h1 className="m-big">
            {turn.points} for {upTeam}
          </h1>
          <TurnGuesses turn={turn} />
          {mine && (
            <div className="m-dispute">
              <p className="m-note">
                Disputed last guess? Undo it, or count it again.
              </p>
              {turn.currentPhrase && (
                <p className="m-phrase-peek">
                  <span className="m-eyebrow">Not counted</span>
                  {turn.currentPhrase}
                </p>
              )}
              <div className="m-btn-row">
                <button
                  type="button"
                  className="m-btn-small"
                  disabled={turn.cursor === 0}
                  onClick={() => send({ type: "back" })}
                >
                  <Icon name="arrowLeft" /> Undo
                </button>
                <button
                  type="button"
                  className="m-btn-small"
                  disabled={turn.cursor >= turn.maxCursor}
                  onClick={() => send({ type: "forward" })}
                >
                  Count it <Icon name="arrowRight" />
                </button>
              </div>
            </div>
          )}
          {!amGm && <p className="m-note">Waiting for {gm} to continue.</p>}
        </section>
      )}

      {view.phase === "results" && (
        <section className="m-card m-stage">
          <span className="m-eyebrow">Final scores</span>
          <h1 className="m-big">{winnerText(view)}</h1>
          <Podium view={view} />
          {!amGm && <p className="m-note">{gm} can start another game.</p>}
        </section>
      )}

      {amGm && !describing && <GmTools view={view} send={send} />}
    </PhoneShell>
  );
}

/** A bar that drains as the turn runs down. */
function TimeBar({ left, total }: { left: number; total: number }) {
  const fraction = Math.max(0, Math.min(1, left / Math.max(total, left, 1)));
  return (
    <div
      className={`m-timebar ${left <= 10_000 && total > 1 ? "is-low" : ""}`}
      style={{ "--left": fraction } as CSSProperties}
      aria-hidden
    />
  );
}

/** Everything the GM rarely needs, in one fold (D35, D39). */
function GmTools({ view, send }: { view: LobbyView; send: Send }) {
  const game = view.game;
  if (!game) return null;
  const turn = game.turn;
  const up = playerName(view, turn?.playerId);
  const mine = turn?.playerId === view.you;
  const timeEditable =
    (view.phase === "turnReady" && turn) ||
    (view.phase === "turnActive" && turn?.paused);
  const owed = game.owed
    .map((id) => view.players.find((p) => p.id === id))
    .filter((p) => p !== undefined);
  // The server refuses a skip with nobody to swap in (D41); say so up front
  // instead of letting the tap fail.
  const canSwap =
    !!turn &&
    view.players.some(
      (p) =>
        p.teamId === turn.teamId &&
        p.id !== turn.playerId &&
        p.status === "active" &&
        !p.waiting,
    );
  return (
    <>
      <Fold
        title="Turn options"
        hint={owed.length ? `${owed.length} swapped` : undefined}
      >
        <div className="m-tools">
          {view.phase === "turnReady" && turn && (
            <div className="m-skip">
              <button
                type="button"
                className="m-btn-small m-btn-wide"
                disabled={!canSwap}
                onClick={() => send({ type: "skipTurn" })}
              >
                <Icon name="skip" /> Skip {mine ? "my" : `${up}’s`} turn
              </button>
              <p className="m-note">
                {canSwap
                  ? `The next player on ${teamName(view, turn.teamId)} goes now; ${mine ? "you go" : `${up} goes`} on the team’s next turn.`
                  : `Nobody else on ${teamName(view, turn.teamId)} is connected to swap in.`}
              </p>
            </div>
          )}
          {view.phase === "turnActive" && !mine && (
            <button
              type="button"
              className="m-btn-small m-btn-wide"
              onClick={() => send({ type: "reveal" })}
            >
              <Icon name="eye" />{" "}
              {turn?.revealed ? "Hide the phrase" : "Peek at the phrase"}
            </button>
          )}
          {timeEditable && (
            <div className="m-time-adjust">
              <span>Time</span>
              <button
                type="button"
                className="m-btn-small"
                onClick={() => send({ type: "addTime", ms: -10_000 })}
              >
                <Icon name="minus" /> 10s
              </button>
              <button
                type="button"
                className="m-btn-small"
                onClick={() => send({ type: "addTime", ms: 10_000 })}
              >
                <Icon name="plus" /> 10s
              </button>
            </div>
          )}
          {view.phase === "turnActive" && !turn?.paused && (
            <p className="m-note">Pause to change the time.</p>
          )}
          {owed.length > 0 && (
            <div className="m-skipped">
              <p className="m-label">Goes next for their team</p>
              {owed.map((p) => (
                <p key={p.id} className="m-note">
                  {p.name} ({teamName(view, p.teamId ?? undefined)})
                  {p.status !== "active" && " · offline, waits until back"}
                </p>
              ))}
            </div>
          )}
          {game.canRestartPrevious &&
            ["turnReady", "roundIntro", "results"].includes(view.phase) && (
              <RestartPrevious view={view} send={send} />
            )}
        </div>
      </Fold>
      <ManagePlayers view={view} send={send} />
    </>
  );
}

function RestartPrevious({ view, send }: { view: LobbyView; send: Send }) {
  const [seconds, setSeconds] = useState(view.config.roundLengthSec);
  return (
    <form
      className="m-restart"
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: "restartPrevTurn", ms: seconds * 1000 });
      }}
    >
      <p className="m-label">Restart the previous turn</p>
      <p className="m-note">Undoes its points and puts its phrases back.</p>
      <div className="m-inline-form">
        <input
          aria-label="Seconds for the restarted turn"
          className="m-field"
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          value={seconds}
          onChange={(e) =>
            setSeconds(Math.min(600, Math.max(1, Number(e.target.value) || 1)))
          }
        />
        <span className="m-unit">sec</span>
        <button type="submit" className="m-btn-small">
          <Icon name="undo" /> Restart
        </button>
      </div>
    </form>
  );
}

function EmoteBar({ send }: { send: Send }) {
  return (
    <fieldset className="m-emotes">
      <legend className="sr-only">Send a reaction to the big screen</legend>
      {EMOTES.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-label={EMOTE_LABELS[kind]}
          onClick={() => send({ type: "emote", kind })}
        >
          <EmoteIcon kind={kind} />
        </button>
      ))}
    </fieldset>
  );
}
