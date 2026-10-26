"use client";

import {
  isValidCode,
  NAME_MAX_LEN,
  normalizeCode,
  validateName,
} from "@tmn/game";
import { useState } from "react";
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
      return <Message title="Connecting…" />;
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
        <LobbyScreen view={lobby.view} send={lobby.send} />
      ) : (
        <Message title="Connecting…" />
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <p className="font-mono text-4xl font-black tracking-[0.3em]">{code}</p>
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const check = validateName(name);
          if (!check.ok) return setLocalError(check.message);
          onSubmit(check.name);
        }}
      >
        <input
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
        {shown && <p className="text-sm text-red-500">{shown}</p>}
        <button type="submit" className="btn-primary">
          Join
        </button>
        <p className="text-center text-xs text-foreground/40">
          Rejoining? Use the same name as before.
        </p>
      </form>
    </div>
  );
}
