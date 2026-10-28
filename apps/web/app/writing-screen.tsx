"use client";

import { cleanName, type LobbyView, PHRASE_MAX_LEN } from "@tmn/game";
import { useEffect, useState } from "react";
import type { LobbyAction } from "@/lib/use-lobby";

export function WritingScreen({
  view,
  send,
}: {
  view: LobbyView;
  send?: (action: LobbyAction) => void;
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
  const team = view.teams.find((t) => t.id === me?.teamId);
  const writers = view.players.filter((p) => !p.waiting && p.teamId);
  const active = writers.filter((p) => p.status === "active");
  const quota = view.config.phrasesPerPlayer;
  // Ready means approved: Cavan's pending phrases don't count yet (D30).
  const complete =
    active.length > 0 && active.every((p) => p.approvedCount === quota);
  const amGm = me?.isGamemaster ?? false;
  const gm = view.players.find((p) => p.isGamemaster);
  const cavan = view.players.find((p) => p.isCavan);
  const nameOf = (id: string) =>
    view.players.find((p) => p.id === id)?.name ?? "";
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const remaining = view.config.phrasesPerPlayer - (me?.phraseCount ?? 0);
  return (
    <section className="writing-screen">
      <div className="page-heading">
        <h1>Write your phrases</h1>
        <p>
          {view.config.phrasesPerPlayer} per person. Up to{" "}
          {view.config.maxWordsPerPhrase} words each. Keep them secret.
        </p>
      </div>
      {me?.isCavan && send && (
        <p className="waiting-note">
          You're Cavan: {gm?.name ?? "the game master"} approves or rejects
          every phrase you write. Rejected ones don't count, so write another.
        </p>
      )}
      {amGm && send && view.moderation.length > 0 && (
        <section className="paper-panel moderation-queue">
          <div className="panel-heading">
            <h2>Vet Cavan's phrases</h2>
            <span className="badge">{view.moderation.length} WAITING</span>
          </div>
          <ul>
            {view.moderation.map((phrase) => (
              <li key={phrase.id} className="team-member">
                <span>
                  <strong>{phrase.text}</strong>
                  <span className="fine-print">
                    {" "}
                    by {nameOf(phrase.authorId)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() =>
                    send({ type: "approvePhrase", phraseId: phrase.id })
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs text-red-700"
                  onClick={() =>
                    send({ type: "rejectPhrase", phraseId: phrase.id })
                  }
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {me && team && !me.waiting && send && (
        <section className="paper-panel">
          <div className="panel-heading">
            <h2>{team.name}</h2>
            <span className="badge">
              {me.phraseCount} / {view.config.phrasesPerPlayer} WRITTEN
            </span>
          </div>
          <div className="writing-inputs">
            {remaining > 0 ? (
              <form
                className="name-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  send({ type: "submitPhrase", text });
                  setPendingText(text);
                }}
              >
                <label htmlFor="phrase-text">Your next phrase</label>
                <input
                  id="phrase-text"
                  className="field"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={PHRASE_MAX_LEN * 2}
                  autoComplete="off"
                />
                <p className="fine-print">
                  {words} / {view.config.maxWordsPerPhrase} words · {remaining}{" "}
                  remaining
                </p>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    !words ||
                    words > view.config.maxWordsPerPhrase ||
                    [...text.trim()].length > PHRASE_MAX_LEN
                  }
                >
                  Add phrase <span aria-hidden>+</span>
                </button>
              </form>
            ) : (
              <p className="waiting-note">Your phrases are in.</p>
            )}
            <ul className="own-phrases">
              {view.ownPhrases.map((phrase) => (
                <li
                  key={phrase.id}
                  className={phrase.status === "rejected" ? "rejected" : ""}
                >
                  <span>
                    {phrase.text}
                    {phrase.status === "pending" && (
                      <span className="badge ml-2">WAITING FOR GM</span>
                    )}
                    {phrase.status === "rejected" && (
                      <span className="badge badge-cavan ml-2">REJECTED</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Delete ${phrase.text}`}
                    onClick={() =>
                      send({ type: "deletePhrase", phraseId: phrase.id })
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {me?.waiting && (
        <p className="waiting-note">
          You joined after team selection. {gm?.name ?? "The game master"} can
          put you on a team.
        </p>
      )}
      <section className="paper-panel writing-progress">
        <div className="panel-heading">
          <h2>Writing progress</h2>
          <span className="badge">
            {active.filter((p) => p.approvedCount === quota).length} /{" "}
            {active.length} READY
          </span>
        </div>
        <ul>
          {writers.map((p) => (
            <li
              className={`team-member ${p.status === "inactive" ? "offline" : ""}`}
              key={p.id}
            >
              <span>
                {p.name}
                {p.id === view.you && " (you)"}
                {p.status === "inactive" && " · offline"}
              </span>
              {p.isCavan && <span className="badge badge-cavan">CAVAN</span>}
              <span className="badge">
                {p.approvedCount} / {quota}
                {p.phraseCount > p.approvedCount &&
                  ` · ${p.phraseCount - p.approvedCount} PENDING`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {cavan && !send && (
        <p className="fine-print mt-4">
          The game master vets every phrase {cavan.name} writes.
        </p>
      )}
      <div className="lobby-action">
        {amGm && send ? (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={!complete || view.moderation.length > 0}
              onClick={() => send({ type: "startGame" })}
            >
              Start the game <span aria-hidden>→</span>
            </button>
            <p className="fine-print">
              {view.moderation.length > 0
                ? "Approve or reject Cavan's phrases first."
                : complete
                  ? "Everyone's phrases are in. Round 1 is Describe it."
                  : "Waiting for everyone connected to finish writing."}
            </p>
          </>
        ) : (
          complete && (
            <p className="waiting-note">
              All phrases are in. Waiting for {gm?.name ?? "the game master"} to
              start the game.
            </p>
          )
        )}
      </div>
    </section>
  );
}
