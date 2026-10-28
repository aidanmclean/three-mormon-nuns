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
import { Masthead, NunIllustration, Steps } from "@/app/brand";
import { EmoteLayer } from "@/app/game-bits";
import { GameBoard } from "@/app/game-board";
import { LobbyConnection } from "@/app/lobby-connection";
import { Message } from "@/app/message";
import { TeamBoard } from "@/app/team-board";
import { WritingScreen } from "@/app/writing-screen";
import { clearScreen, devicePath, loadScreen, saveScreen } from "@/lib/session";
import { type EmoteBurst, useLobby } from "@/lib/use-lobby";

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
        <>
          {!lobby.connected && (
            <div className="bg-amber-500 px-4 py-2 text-center font-semibold text-black">
              Reconnecting…
            </div>
          )}
          <LobbyBoard
            view={lobby.view}
            clockOffset={lobby.clockOffset}
            emotes={lobby.emotes}
          />
        </>
      ) : (
        <LobbyConnection lobby={lobby} hosting />
      );
  }
}

function LobbyBoard({
  view,
  clockOffset,
  emotes,
}: {
  view: LobbyView;
  clockOffset: number;
  emotes: EmoteBurst[];
}) {
  // The addresses players should type on their phones, best first (D20).
  const addresses = useJoinAddresses();
  const gm = view.players.find((p) => p.isGamemaster);
  const { config } = view;
  const minutes = `${Math.floor(config.roundLengthSec / 60)}:${String(config.roundLengthSec % 60).padStart(2, "0")}`;

  const invite = (
    <aside className="host-invite">
      <h1>Join the game</h1>
      <p className="text-sm mt-5">Join on your phone at</p>
      <p className="join-address">{addresses[0] ?? "…"}</p>
      <p className="eyebrow mt-4">ENTER THE ROOM CODE</p>
      <div className="host-code">{view.code}</div>
      {addresses.length > 1 && (
        <p className="fine-print">
          Not working? Try {addresses.slice(1).join(" or ")}
        </p>
      )}
      <NunIllustration small />
    </aside>
  );
  return (
    <div className="site-shell host-shell">
      <EmoteLayer emotes={emotes} />
      <Masthead label="SHARED SCREEN" />
      <Steps
        current={
          view.phase === "teams"
            ? "teams"
            : view.phase === "writing"
              ? "writing"
              : view.phase === "lobby"
                ? "lobby"
                : "play"
        }
      />
      <main className="host-main">
        {view.phase === "lobby" ? (
          <div className="host-board">
            {invite}
            <section className="host-players">
              <div className="host-players-heading">
                <h2>Players</h2>
                <span className="badge">
                  {view.players.length} / {config.maxPlayers} HERE
                </span>
              </div>
              {!view.players.length ? (
                <div className="empty-room">
                  <span aria-hidden>[ . . . ]</span>
                  <h3>Waiting for players</h3>
                  <p>The first player to join becomes the game master.</p>
                </div>
              ) : (
                <ul className="player-tickets">
                  {view.players.map((p) => (
                    <li
                      key={p.id}
                      className={`player-ticket ${p.status === "inactive" ? "offline" : ""}`}
                    >
                      <span className="player-avatar" aria-hidden>
                        {p.status === "inactive" ? "[--]" : "[:)]"}
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        {p.isGamemaster && (
                          <span className="badge mt-1">GAME MASTER</span>
                        )}
                        {p.isCavan && (
                          <span className="badge badge-cavan mt-1">CAVAN</span>
                        )}
                        {p.status === "inactive" && (
                          <span className="fine-print">offline</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : view.game ? (
          <div className="host-game-layout">
            <GameBoard view={view} clockOffset={clockOffset} />
            <p className="fine-print host-late-join">
              Late? Join at {addresses[0] ?? "…"} with code{" "}
              <strong>{view.code}</strong>
            </p>
          </div>
        ) : (
          <div className="host-team-layout">
            {invite}
            {view.phase === "writing" ? (
              <WritingScreen view={view} />
            ) : (
              <TeamBoard view={view} clockOffset={clockOffset} />
            )}
          </div>
        )}
        <div className="host-rule-strip">
          <span>{minutes} TURNS</span>
          <span>{config.teamCount} TEAMS</span>
          <span>{config.phrasesPerPlayer} PHRASES EACH</span>
          <span>{config.maxWordsPerPhrase} WORDS MAX</span>
          <span>3 ROUNDS</span>
        </div>
        <p className="host-gm-note">
          {gm ? (
            <>
              <strong>{gm.name}</strong> is the game master.
            </>
          ) : (
            "Join on your phone. Keep this screen visible."
          )}
        </p>
      </main>
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
