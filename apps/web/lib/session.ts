// Per-lobby session kept in localStorage so a refresh or reconnect rejoins as
// the same player (D7). Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and failure just means "no session".

import type { Config } from "@tmn/game";

/** A player's session on their phone. */
export interface Session {
  name: string;
  token?: string;
}

/** The host screen's session (D18). */
export interface ScreenSession {
  token?: string;
  /** Set when "Host a new game" picks a code, until the lobby exists. */
  creating?: boolean;
  config?: Config;
}

/** Local testing only: independent browser devices inside one same-origin test desk. */
export function testDevice(): string | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined")
    return null;
  const device = new URLSearchParams(window.location.search).get("device");
  return device && /^[a-zA-Z0-9-]{1,40}$/.test(device) ? device : null;
}

export function devicePath(path: string): string {
  const device = testDevice();
  return device
    ? `${path}${path.includes("?") ? "&" : "?"}device=${encodeURIComponent(device)}`
    : path;
}

const prefix = (device?: string) => {
  const selected =
    process.env.NODE_ENV === "development" ? (device ?? testDevice()) : null;
  return selected && /^[a-zA-Z0-9-]{1,40}$/.test(selected)
    ? `tmn:device:${selected}`
    : "tmn";
};
const key = (code: string, device?: string) =>
  `${prefix(device)}:session:${code}`;

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Session).name === "string"
    ) {
      return parsed as Session;
    }
  } catch {
    // fall through
  }
  return null;
}

export function saveSession(code: string, session: Session, device?: string) {
  try {
    localStorage.setItem(key(code, device), JSON.stringify(session));
  } catch {
    // Without storage, reconnects fall back to rejoining by name.
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    // ignore
  }
}

const screenKey = (code: string, device?: string) =>
  `${prefix(device)}:screen:${code}`;

export function loadScreen(code: string): ScreenSession | null {
  try {
    const raw = localStorage.getItem(screenKey(code));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as ScreenSession)
      : null;
  } catch {
    return null;
  }
}

export function saveScreen(
  code: string,
  session: ScreenSession,
  device?: string,
) {
  try {
    localStorage.setItem(screenKey(code, device), JSON.stringify(session));
  } catch {
    // Without storage, a refreshed host screen can't reclaim its lobby.
  }
}

export function clearScreen(code: string) {
  try {
    localStorage.removeItem(screenKey(code));
  } catch {
    // ignore
  }
}
