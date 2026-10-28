"use client";

import { cleanName, type LobbyView, PHRASE_MAX_LEN } from "@tmn/game";
import { type CSSProperties, useEffect, useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";
import { Icon } from "./icons";
import {
  Avatar,
  BigButton,
  DockHint,
  Fold,
  PhoneShell,
  PlayerName,
} from "./phone";
import { ManagePlayers } from "./players";

/** Writing phrases on a phone (D30, D39). */
export function WritingScreen({
  view,
  send,
}: {
  view: LobbyView;
  send: (action: LobbyAction) => void;
}) {
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  useEffect(() => {
    if (
      pendingText &&
      view.ownPhrases.some((p) => p.text === cleanName(pendingText))
    ) {
      setText((current) => (current === pendingText ? "" : current));
      setPendingText(null);
    }
  }, [view.ownPhrases, pendingText]);
  const me = view.players.find((p) => p.id === view.you);
  const writers = view.players.filter((p) => !p.waiting && p.teamId);
  const active = writers.filter((p) => p.status === "active");
  const quota = view.config.phrasesPerPlayer;
  const maxWords = view.config.maxWordsPerPhrase;
  // Ready means approved: Cavan's pending phrases don't count yet (D30).
  const ready = active.filter((p) => p.approvedCount >= quota).length;
  const complete = active.length > 0 && ready === active.length;
  const amGm = me?.isGamemaster ?? false;
  const gm = view.players.find((p) => p.isGamemaster);
  const nameOf = (id: string) =>
    view.players.find((p) => p.id === id)?.name ?? "";
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const tooLong = words > maxWords || [...text.trim()].length > PHRASE_MAX_LEN;
  const remaining = quota - (me?.phraseCount ?? 0);
  const writing = !!me?.teamId && !me.waiting;
  const pending = view.moderation.length;

  return (
    <PhoneShell
      view={view}
      phase="Writing"
      dock={
        amGm ? (
          <>
            <BigButton
              disabled={!complete || pending > 0}
              onClick={() => send({ type: "startGame" })}
            >
              Start the game
            </BigButton>
            <DockHint>
              {pending > 0
                ? `Check Cavan's ${pending === 1 ? "phrase" : `${pending} phrases`} first.`
                : complete
                  ? "Everyone's phrases are in."
                  : `${ready} of ${active.length} players ready.`}
            </DockHint>
          </>
        ) : undefined
      }
    >
      {amGm && pending > 0 && (
        <section className="m-card m-card-flush m-queue">
          <div className="m-card-head">
            <h2>Check Cavan’s phrases</h2>
            <span className="m-count">
              <strong>{pending}</strong>
            </span>
          </div>
          <ul className="m-list">
            {view.moderation.map((phrase) => (
              <li key={phrase.id} className="m-queue-item">
                <p className="m-phrase">{phrase.text}</p>
                <p className="m-note">by {nameOf(phrase.authorId)}</p>
                <div className="m-btn-row">
                  <button
                    type="button"
                    className="m-btn-small m-btn-small-strong"
                    onClick={() =>
                      send({ type: "approvePhrase", phraseId: phrase.id })
                    }
                  >
                    <Icon name="check" /> Approve
                  </button>
                  <button
                    type="button"
                    className="m-btn-small m-btn-danger"
                    onClick={() =>
                      send({ type: "rejectPhrase", phraseId: phrase.id })
                    }
                  >
                    <Icon name="close" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me && writing ? (
        <section className="m-card">
          <div className="m-write-head">
            <h1 className="m-title">
              {remaining > 0 ? "Write a phrase" : "You’re done!"}
            </h1>
            <Pips
              done={me.approvedCount}
              pending={me.phraseCount - me.approvedCount}
              quota={quota}
            />
          </div>
          <p className="m-sub">
            {remaining > 0
              ? `${remaining} to go · up to ${maxWords} words · keep it secret`
              : complete
                ? `Waiting for ${gm?.name ?? "the game master"} to start.`
                : "Waiting for everyone else to finish."}
          </p>
          {me.isCavan && (
            <p className="m-note m-note-box">
              {gm?.name ?? "The game master"} checks every phrase you write
            </p>
          )}
          {remaining > 0 && (
            <form
              className="m-write-form"
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "submitPhrase", text });
                setPendingText(text);
              }}
            >
              <input
                id="phrase-text"
                aria-label="Your next phrase"
                className="m-field m-field-big"
                placeholder="e.g. Rubber duck"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={PHRASE_MAX_LEN * 2}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="done"
              />
              <p className={`m-count-line ${tooLong ? "is-over" : ""}`}>
                {words} / {maxWords} words
              </p>
              <BigButton
                type="submit"
                icon="plus"
                tone="go"
                disabled={!words || tooLong}
              >
                Add phrase
              </BigButton>
            </form>
          )}
          {view.ownPhrases.length > 0 && (
            <ul className="m-own">
              {view.ownPhrases.map((phrase) => (
                <li key={phrase.id} className={`is-${phrase.status}`}>
                  <span className="m-own-text">{phrase.text}</span>
                  {phrase.status === "pending" && (
                    <span className="m-chip">checking</span>
                  )}
                  {phrase.status === "rejected" && (
                    <span className="m-chip m-chip-bad">rejected</span>
                  )}
                  <button
                    type="button"
                    className="m-icon-btn"
                    aria-label={`Delete ${phrase.text}`}
                    onClick={() =>
                      send({ type: "deletePhrase", phraseId: phrase.id })
                    }
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="m-hero">
          <h1>Hang tight</h1>
          <p className="m-sub">
            You joined after teams were picked. {gm?.name ?? "The game master"}{" "}
            can put you on a team.
          </p>
        </section>
      )}

      <Fold title="Everyone" hint={`${ready} / ${active.length} ready`}>
        <ul className="m-list">
          {writers.map((p) => (
            <li key={p.id}>
              <div className="m-row">
                <Avatar player={p} />
                <PlayerName
                  player={p}
                  you={p.id === view.you}
                  showCavan={amGm}
                />
                <Pips
                  done={p.approvedCount}
                  pending={p.phraseCount - p.approvedCount}
                  quota={quota}
                />
              </div>
            </li>
          ))}
        </ul>
      </Fold>

      {amGm && <ManagePlayers view={view} send={send} />}
    </PhoneShell>
  );
}

/** Progress as dots: approved, waiting for the GM, still to write. */
export function Pips({
  done,
  pending,
  quota,
}: {
  done: number;
  pending: number;
  quota: number;
}) {
  const d = Math.min(done, quota);
  const p = Math.max(0, Math.min(pending, quota - d));
  return (
    <span
      className="tv-pips m-pips"
      role="img"
      aria-label={`${d} of ${quota} written${p ? `, ${p} being checked` : ""}`}
    >
      <span className="pips pip-done" style={{ "--n": d } as CSSProperties} />
      <span
        className="pips pip-pending"
        style={{ "--n": p } as CSSProperties}
      />
      <span
        className="pips pip-todo"
        style={{ "--n": quota - d - p } as CSSProperties}
      />
    </span>
  );
}
