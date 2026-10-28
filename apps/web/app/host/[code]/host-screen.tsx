"use client";

import {
  isValidCode,
  type LobbyView,
  normalizeCode,
  randomCode,
} from "@tmn/game";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LobbyConnection } from "@/app/lobby-connection";
import { Message } from "@/app/message";
import { clearScreen, devicePath, loadScreen, saveScreen } from "@/lib/session";
import { type EmoteBurst, useLobby } from "@/lib/use-lobby";
import { TvBoard } from "./tv";

export function HostScreen({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const router = useRouter();
  const lobby = useLobby(code, "screen", () => {
    // Our random code collided with a live lobby: move to a fresh one.
    const screen = loadScreen(code);
    const next = randomCode();
    if (screen) saveScreen(next, screen);
    clearScreen(code);
    router.replace(devicePath(`/host/${next}`));
  });

  if (!isValidCode(code)) return <Message title="That's not a lobby code." />;

  switch (lobby.status) {
    case "connecting":
    case "joining":
    case "needName": // players only
      return <LobbyConnection lobby={lobby} hosting />;
    case "notHost":
      return (
        <Message
          title="This browser does not have the host key."
          body="Want to play? Join from your phone."
          action={
            <Link href={`/play/${code}`} className="btn-primary">
              Join {code} as a player
            </Link>
          }
        />
      );
    case "notFound":
      return <Message title={`There's no lobby called ${code}.`} />;
    case "gone":
      return (
        <Message
          title={
            lobby.goneReason === "replaced"
              ? "This screen’s connection was replaced."
              : "This lobby has closed."
          }
        />
      );
    case "joined":
      return lobby.view ? (
        <LobbyBoard
          view={lobby.view}
          clockOffset={lobby.clockOffset}
          emotes={lobby.emotes}
          connected={lobby.connected}
        />
      ) : (
        <LobbyConnection lobby={lobby} hosting />
      );
  }
}

/** The TV view, with the join addresses players should type (D20, D38). */
function LobbyBoard({
  view,
  clockOffset,
  emotes,
  connected,
}: {
  view: LobbyView;
  clockOffset: number;
  emotes: EmoteBurst[];
  connected: boolean;
}) {
  const addresses = useJoinAddresses();
  return (
    <TvBoard
      view={view}
      clockOffset={clockOffset}
      emotes={emotes}
      addresses={addresses}
      connected={connected}
    />
  );
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Where phones should go. A deployed app (or a TV opened via its LAN IP)
 * already has the right address in the URL. If the TV opened `localhost`,
 * ask the dev server for this machine's LAN IPs instead (D20).
 */
function useJoinAddresses(): string[] {
  const [addresses, setAddresses] = useState<string[]>([]);
  useEffect(() => {
    const { hostname, host, port } = window.location;
    if (!LOOPBACK.includes(hostname)) {
      setAddresses([host]);
      return;
    }
    let cancelled = false;
    fetch("/api/lan-address")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { addresses?: string[] } | null) => {
        if (cancelled) return;
        const ips = data?.addresses ?? [];
        setAddresses(
          ips.length > 0
            ? ips.map((ip) => (port ? `${ip}:${port}` : ip))
            : [host],
        );
      })
      .catch(() => !cancelled && setAddresses([host]));
    return () => {
      cancelled = true;
    };
  }, []);
  return addresses;
}
