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
  const complete =
    active.length > 0 &&
    active.every((p) => p.phraseCount === view.config.phrasesPerPlayer);
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
                <li key={phrase.id}>
                  <span>{phrase.text}</span>
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
          You joined after team selection. Wait for the next game.
        </p>
      )}
      <section className="paper-panel writing-progress">
        <div className="panel-heading">
          <h2>Writing progress</h2>
          <span className="badge">
            {
              active.filter(
                (p) => p.phraseCount === view.config.phrasesPerPlayer,
              ).length
            }{" "}
            / {active.length} READY
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
              <span className="badge">
                {p.phraseCount} / {view.config.phrasesPerPlayer}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {complete && (
        <p className="waiting-note mt-5">
          All phrases are in. The turn-based rounds are the next development
          stage.
        </p>
      )}
    </section>
  );
}
