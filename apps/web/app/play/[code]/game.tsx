"use client";

import {
  isValidCode,
  NAME_MAX_LEN,
  normalizeCode,
  type Skill,
  validateName,
} from "@tmn/game";
import { useState } from "react";
import { Logo } from "@/app/brand";
import { Icon } from "@/app/icons";
import { LobbyConnection } from "@/app/lobby-connection";
import { Message } from "@/app/message";
import { SkillPicker } from "@/app/phone";
import { loadSession } from "@/lib/session";
import { useLobby } from "@/lib/use-lobby";
import { useWakeLock } from "@/lib/use-wake-lock";
import { LobbyScreen } from "./lobby-screen";

export function Game({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const lobby = useLobby(code, "player");
  // A locked phone drops out of the game; keep it awake while joined (D55).
  useWakeLock(lobby.status === "joined");

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
            className={`m-toast ${lobby.notice.tone === "good" ? "m-toast-good" : ""}`}
            onClick={lobby.dismissNotice}
          >
            <Icon
              name={lobby.notice.tone === "good" ? "spark" : "alert"}
              className="m-toast-icon"
            />
            <span className="m-toast-text">{lobby.notice.text}</span>
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
          askSkill={lobby.askSkill}
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
  askSkill,
  onSubmit,
}: {
  code: string;
  error: string | null;
  /** Hidden when the lobby doesn't balance teams by skill (D62). */
  askSkill: boolean;
  onSubmit: (name: string, skill: Skill) => void;
}) {
  const [name, setName] = useState(() => loadSession(code)?.name ?? "");
  const [skill, setSkill] = useState<Skill>(
    () => loadSession(code)?.skill ?? "intermediate",
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = localError ?? error;

  return (
    <div className="m-app m-join">
      <header className="m-bar">
        <span className="m-logo">
          <Logo compact />
        </span>
        <span className="m-bar-me" />
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
          onSubmit(check.name, skill);
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
        {askSkill && <SkillPicker value={skill} onChange={setSkill} />}
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
