"use client";

import {
  isValidCode,
  NAME_MAX_LEN,
  normalizeCode,
  validateName,
} from "@tmn/game";
import { useState } from "react";
import { Masthead, NunIllustration } from "@/app/brand";
import { LobbyConnection } from "@/app/lobby-connection";
import { Message } from "@/app/message";
import { loadSession } from "@/lib/session";
import { useLobby } from "@/lib/use-lobby";
import { LobbyScreen } from "./lobby-screen";

export function Game({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const lobby = useLobby(code, "player");

  if (!isValidCode(code)) return <Message title="That's not a lobby code." />;

  return (
    <>
      {lobby.status === "joined" && !lobby.connected && (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
          Reconnecting…
        </div>
      )}
      <Body code={code} lobby={lobby} />
      {lobby.notice && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-xl bg-foreground px-4 py-3 text-center text-background shadow-lg"
        >
          {lobby.notice}
        </div>
      )}
    </>
  );
}

function Body({
  code,
  lobby,
}: {
  code: string;
  lobby: ReturnType<typeof useLobby>;
}) {
  switch (lobby.status) {
    case "connecting":
    case "joining":
      return <LobbyConnection lobby={lobby} />;
    case "needName":
      return (
        <NameForm
          code={code}
          error={lobby.nameError}
          onSubmit={lobby.submitName}
        />
      );
    case "notHost": // screens only; can't happen for a player
    case "notFound":
      return (
        <Message
          title={`There's no lobby called ${code}.`}
          body="Check the code with your host."
        />
      );
    case "gone":
      return (
        <Message
          title={
            {
              kicked: "The game master removed you from the lobby.",
              expired: "This lobby has closed.",
              replaced: "This lobby is open in another tab.",
            }[lobby.goneReason ?? "expired"]
          }
          action={
            lobby.goneReason === "replaced" ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Use this tab instead
              </button>
            ) : undefined
          }
        />
      );
    case "joined":
      return lobby.view ? (
        <LobbyScreen
          view={lobby.view}
          send={lobby.send}
          clockOffset={lobby.clockOffset}
        />
      ) : (
        <LobbyConnection lobby={lobby} />
      );
  }
}

function NameForm({
  code,
  error,
  onSubmit,
}: {
  code: string;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(() => loadSession(code)?.name ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = localError ?? error;

  return (
    <div className="site-shell">
      <Masthead label="JOIN GAME" />
      <main className="name-main">
        <div className="name-room">
          <span className="eyebrow">ROOM</span>
          <strong>{code}</strong>
        </div>
        <h1>Join the game</h1>
        <p>Enter your name to join.</p>
        <form
          className="name-form"
          onSubmit={(e) => {
            e.preventDefault();
            const check = validateName(name);
            if (!check.ok) return setLocalError(check.message);
            onSubmit(check.name);
          }}
        >
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            aria-label="Your name"
            className="field"
            placeholder="Your name"
            maxLength={NAME_MAX_LEN * 2}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setLocalError(null);
            }}
          />
          {shown && (
            <p role="alert" className="form-error">
              {shown}
            </p>
          )}
          <button type="submit" className="btn-primary">
            Join game <span aria-hidden>→</span>
          </button>
          <p className="fine-print text-center">
            Rejoining? Use the same name as before.
          </p>
        </form>
        <div className="dither-box mt-9">
          <NunIllustration small />
        </div>
      </main>
    </div>
  );
}
