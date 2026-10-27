"use client";

import {
  type ByeReason,
  type ClientMessage,
  HEARTBEAT_INTERVAL_MS,
  LOBBY_RESPONSE_TIMEOUT_MS,
  type LobbyView,
  PARTY,
  PROTOCOL_VERSION,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_MIN_DELAY_MS,
  type ServerMessage,
} from "@tmn/game";
import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { partyHost } from "./party-host";
import {
  clearScreen,
  clearSession,
  loadScreen,
  loadSession,
  saveScreen,
  saveSession,
  testDevice,
} from "./session";

export type LobbyStatus =
  | "connecting"
  | "needName"
  | "joining"
  | "joined"
  | "notFound"
  /** A host screen without this lobby's screen token (D18). */
  | "notHost"
  | "gone";

/** Actions joined players send; create/join/screen are sent by the hook itself. */
export type LobbyAction = Exclude<
  ClientMessage,
  { type: "create" } | { type: "join" } | { type: "screen" }
>;

/** A phone joins as a player; the shared screen hosts (D18). */
export type LobbyRole = "player" | "screen";

/** Missed pongs before we assume the socket is dead and reconnect. */
const PONG_GRACE_MS = HEARTBEAT_INTERVAL_MS * 2.5;

export function useLobby(
  code: string,
  role: LobbyRole,
  onCodeTaken: () => void = () => {},
) {
  const [status, setStatus] = useState<LobbyStatus>("connecting");
  const [view, setView] = useState<LobbyView | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [goneReason, setGoneReason] = useState<ByeReason | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const lastPong = useRef(0);
  // Read inside socket handlers, so a ref rather than state avoids stale closures.
  const joined = useRef(false);

  const socket = usePartySocket({
    host: partyHost(),
    party: PARTY,
    room: code,
    query: { v: String(PROTOCOL_VERSION) },
    // partysocket's default backoff starts at 3 s, which made even the first
    // connect after a page load wait seconds. On a party LAN, retry fast (D19).
    minReconnectionDelay: RECONNECT_MIN_DELAY_MS,
    maxReconnectionDelay: RECONNECT_MAX_DELAY_MS,
    reconnectionDelayGrowFactor: 1.5,
    onOpen() {
      setConnected(true);
      lastPong.current = Date.now();
      sendHello();
    },
    onClose() {
      setConnected(false);
    },
    onMessage(event: MessageEvent) {
      if (event.data === "pong") {
        lastPong.current = Date.now();
        return;
      }
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      handle(msg);
    },
  });

  /** On every (re)connect: create/reclaim the lobby (screen), or rejoin / ask for a name (player). */
  function sendHello() {
    if (role === "screen") {
      const screen = loadScreen(code);
      const msg: ClientMessage | null = screen?.creating
        ? {
            type: "create",
            ...(screen.config ? { config: screen.config } : {}),
          }
        : screen?.token
          ? { type: "screen", token: screen.token }
          : null;
      if (!msg) {
        setStatus("notHost");
        return;
      }
      if (!joined.current) setStatus("joining");
      socket.send(JSON.stringify(msg));
      return;
    }
    const session = loadSession(code);
    if (!session) {
      setStatus("needName");
      return;
    }
    if (!joined.current) setStatus("joining");
    const msg: ClientMessage = {
      type: "join",
      name: session.name,
      ...(session.token ? { token: session.token } : {}),
    };
    socket.send(JSON.stringify(msg));
  }

  function handle(msg: ServerMessage) {
    switch (msg.type) {
      case "joined": {
        if (msg.as === "screen") saveScreen(code, { token: msg.token });
        else
          saveSession(code, {
            name: loadSession(code)?.name ?? "",
            token: msg.token,
          });
        setNameError(null);
        setStartupError(null);
        joined.current = true;
        setStatus("joined");
        return;
      }
      case "state":
        setView(msg.view);
        setClockOffset(msg.now - Date.now());
        return;
      case "bye":
        setGoneReason(msg.reason);
        joined.current = false;
        setStatus("gone");
        if (msg.reason !== "replaced") {
          if (role === "screen") clearScreen(code);
          else clearSession(code);
        }
        socket.close(); // stops partysocket from reconnecting
        return;
      case "reload":
        window.location.reload();
        return;
      case "error":
        if (msg.code === "CODE_TAKEN") return onCodeTaken();
        if (msg.code === "LOBBY_NOT_FOUND") {
          if (role === "screen") clearScreen(code);
          else clearSession(code);
          setStatus("notFound");
          socket.close();
          return;
        }
        if (role === "screen" && msg.code === "FORBIDDEN" && !joined.current) {
          setStatus("notHost");
          socket.close();
          return;
        }
        // Screens have no name form: creation/storage/validation errors must
        // be visible on the connection screen instead of leaving it spinning.
        if (role === "screen" && !joined.current) {
          setStartupError(msg.message);
          return;
        }
        // Player errors while joining are about the name; show them on the form.
        if (
          !joined.current &&
          ["NAME_TAKEN", "INVALID", "LOBBY_FULL"].includes(msg.code)
        ) {
          setNameError(msg.message);
          setStatus("needName");
          return;
        }
        setNotice(msg.message);
        return;
    }
  }

  const awaitingLobby =
    status === "connecting" ||
    status === "joining" ||
    (status === "joined" && !view);
  useEffect(() => {
    // An explicit retry starts a new grace period. Reconnect attempts do not:
    // repeated socket opens without a lobby reply must still time out.
    setTimedOutAttempt(null);
    if (!awaitingLobby) return;
    const timeout = setTimeout(
      () => setTimedOutAttempt(connectionAttempt),
      LOBBY_RESPONSE_TIMEOUT_MS,
    );
    return () => clearTimeout(timeout);
  }, [awaitingLobby, connectionAttempt]);

  const retryConnection = () => {
    setStartupError(null);
    setTimedOutAttempt(null);
    setConnectionAttempt((attempt) => attempt + 1);
    socket.reconnect();
  };

  useEffect(() => {
    const device = testDevice();
    if (!device || window.parent === window) return;
    const me = view?.players.find((p) => p.id === view.you);
    window.parent.postMessage(
      {
        type: "tmn:test-device",
        device,
        status,
        connected,
        phase: view?.phase ?? null,
        name: me?.name ?? null,
        isGamemaster: me?.isGamemaster ?? false,
      },
      window.location.origin,
    );
  }, [view, status, connected]);

  // Heartbeat (D8): ping every few seconds; if pongs stop, force a reconnect.
  useEffect(() => {
    const timer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPong.current > PONG_GRACE_MS) {
        lastPong.current = Date.now();
        socket.reconnect();
        return;
      }
      socket.send("ping");
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [socket]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const submitName = (name: string) => {
    saveSession(code, { name });
    sendHello();
  };

  const send = useCallback(
    (action: LobbyAction) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(action));
      else setNotice("Not connected. Trying to reconnect…");
    },
    [socket],
  );

  return {
    status,
    view,
    clockOffset,
    connected,
    nameError,
    notice,
    goneReason,
    connectionIssue:
      startupError ??
      (timedOutAttempt === connectionAttempt
        ? "The game server isn’t responding. We’ll keep trying to connect."
        : null),
    retryConnection,
    submitName,
    send,
  };
}
