"use client";

import type { useLobby } from "@/lib/use-lobby";
import { Message } from "./message";

export function LobbyConnection({
  lobby,
  hosting = false,
}: {
  lobby: ReturnType<typeof useLobby>;
  hosting?: boolean;
}) {
  return (
    <Message
      title={
        lobby.connectionIssue
          ? "Can’t connect to the game"
          : hosting
            ? "Creating lobby…"
            : "Connecting…"
      }
      body={lobby.connectionIssue ?? undefined}
      action={
        lobby.connectionIssue ? (
          <button
            type="button"
            className="btn-primary"
            onClick={lobby.retryConnection}
          >
            Try again
          </button>
        ) : undefined
      }
    />
  );
}
