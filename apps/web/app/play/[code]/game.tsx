"use client";

import {
  isValidCode,
  NAME_MAX_LEN,
  normalizeCode,
  validateName,
} from "@tmn/game";
import { useState } from "react";
import { Icon } from "@/app/icons";
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
        <div className="m-reconnecting" role="status">
          Reconnecting…
        </div>
      )}
      <Body code={code} lobby={lobby} />
      {/* Server refusals and connection hiccups: one at a time, gone after
          a few seconds or a tap (D43). */}
      {lobby.notice && (
        <div role="alert">
          <button
            type="button"
            className="m-toast"
            onClick={lobby.dismissNotice}
          >
            <Icon name="alert" className="m-toast-icon" />
            <span className="m-toast-text">{lobby.notice}</span>
            <Icon name="close" className="m-toast-close" />
            <span className="sr-only">Dismiss</span>
          </button>
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
    <div className="m-app m-join">
      <header className="m-bar">
        <span className="m-logo" role="img" aria-label="3 Mormon Nuns">
          3<Icon name="spark" className="m-logo-spark" />
        </span>
        <span className="m-phase">Join</span>
        <span className="m-code">
          <span className="sr-only">Room </span>
          {code}
        </span>
      </header>
      <form
        className="m-body m-join-form"
        onSubmit={(e) => {
          e.preventDefault();
          const check = validateName(name);
          if (!check.ok) return setLocalError(check.message);
          onSubmit(check.name);
        }}
      >
        <h1 className="m-title">What’s your name?</h1>
        <p className="m-sub">It shows on the TV. Keep it short.</p>
        <input
          id="player-name"
          aria-label="Your name"
          className="m-field m-field-big"
          placeholder="Your name"
          maxLength={NAME_MAX_LEN}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setLocalError(null);
          }}
        />
        <p className="m-count-line">
          {[...name.trim()].length} / {NAME_MAX_LEN}
        </p>
        {shown && (
          <p role="alert" className="m-error">
            {shown}
          </p>
        )}
        <div className="m-dock m-dock-inline">
          <button type="submit" className="m-btn m-btn-primary">
            <span>Join game</span>
            <Icon name="arrowRight" />
          </button>
          <p className="m-hint">Rejoining? Use the same name as before.</p>
        </div>
      </form>
    </div>
  );
}
