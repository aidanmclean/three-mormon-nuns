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
import { Message } from "@/app/message";
import { clearScreen, loadScreen, saveScreen } from "@/lib/session";
import { useLobby } from "@/lib/use-lobby";

export function HostScreen({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const router = useRouter();
  const lobby = useLobby(code, "screen", () => {
    // Our random code collided with a live lobby: move to a fresh one.
    const screen = loadScreen(code);
    const next = randomCode();
    if (screen) saveScreen(next, screen);
    clearScreen(code);
    router.replace(`/host/${next}`);
  });

  if (!isValidCode(code)) return <Message title="That's not a lobby code." />;

  switch (lobby.status) {
    case "connecting":
    case "joining":
    case "needName": // players only
      return <Message title="Setting up…" />;
    case "notHost":
      return (
        <Message
          title="This lobby is hosted on another screen."
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
              ? "This lobby is now hosted on another screen."
              : "This lobby has closed."
          }
        />
      );
    case "joined":
      return lobby.view ? (
        <>
          {!lobby.connected && (
            <div className="bg-amber-500 px-4 py-2 text-center font-semibold text-black">
              Reconnecting…
            </div>
          )}
          <LobbyBoard view={lobby.view} />
        </>
      ) : (
        <Message title="Setting up…" />
      );
  }
}

function LobbyBoard({ view }: { view: LobbyView }) {
  // The addresses players should type on their phones, best first (D20).
  const addresses = useJoinAddresses();
  const gm = view.players.find((p) => p.isGamemaster);
  const cavan = view.players.find((p) => p.isCavan);
  const { config } = view;
  const minutes = `${Math.floor(config.roundLengthSec / 60)}:${String(config.roundLengthSec % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 flex-col gap-10 p-8 md:p-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xl text-foreground/60 md:text-2xl">
          Join on your phone at{" "}
          <span className="font-semibold text-foreground">
            {addresses[0] ?? "…"}
          </span>{" "}
          with code
        </p>
        <p className="font-mono text-8xl font-black tracking-[0.3em] md:text-9xl">
          {view.code}
        </p>
        {addresses.length > 1 && (
          <p className="text-sm text-foreground/40">
            Not working? Try {addresses.slice(1).join(" or ")}
          </p>
        )}
      </header>

      <section className="flex flex-1 flex-col items-center gap-6">
        {view.players.length === 0 ? (
          <p className="text-2xl text-foreground/50">
            Waiting for players… the first to join becomes the game master.
          </p>
        ) : (
          <ul className="flex max-w-5xl flex-wrap justify-center gap-4">
            {view.players.map((p) => (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl border-2 px-6 py-4 text-2xl font-bold md:text-3xl ${
                  p.status === "inactive"
                    ? "border-foreground/10 text-foreground/35"
                    : "border-violet-600/40 bg-violet-600/10"
                }`}
              >
                {p.name}
                {p.isGamemaster && (
                  <span className="rounded-full bg-violet-600 px-3 py-1 text-sm font-semibold text-white">
                    GM
                  </span>
                )}
                {p.isCavan && (
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-black">
                    Cavan
                  </span>
                )}
                {p.status === "inactive" && (
                  <span className="text-base font-normal">offline</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-col items-center gap-2 text-center text-lg text-foreground/60">
        <p>
          {minutes} turns · {config.teamCount} teams · {config.phrasesPerPlayer}{" "}
          phrases each · up to {config.maxWordsPerPhrase} words
        </p>
        {gm && (
          <p>
            <span className="font-semibold text-foreground">{gm.name}</span> is
            the game master and starts the game from their phone.
          </p>
        )}
        {cavan && <p>The game master vets every phrase {cavan.name} writes.</p>}
      </footer>
    </div>
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
