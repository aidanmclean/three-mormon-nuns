"use client";

import { normalizeCode, PARTY, type ServerMessage } from "@tmn/game";
import usePartySocket from "partysocket/react";
import { useState } from "react";

// An explicit host wins (production). Otherwise assume the worker runs on the
// machine that served this page, so phones on the LAN connect with no config.
function partyHost() {
  if (process.env.NEXT_PUBLIC_PARTY_HOST) {
    return process.env.NEXT_PUBLIC_PARTY_HOST;
  }
  if (typeof window === "undefined") return "localhost:8787"; // SSR; never connects
  return `${window.location.hostname}:8787`;
}

export function LobbyStatus({ code }: { code: string }) {
  const room = normalizeCode(code);
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);

  usePartySocket({
    host: partyHost(),
    party: PARTY,
    room,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onMessage(event) {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === "count") setCount(msg.n);
    },
  });

  return (
    <>
      <h1 className="font-mono text-5xl font-black tracking-[0.3em]">{room}</h1>
      <p className="text-lg text-foreground/70">
        {connected
          ? `connected · ${count} ${count === 1 ? "player" : "players"}`
          : "connecting…"}
      </p>
    </>
  );
}
