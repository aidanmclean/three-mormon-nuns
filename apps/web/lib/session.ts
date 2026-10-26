// Per-lobby session kept in localStorage so a refresh or reconnect rejoins as
// the same player (D7). Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and failure just means "no session".

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
}

const key = (code: string) => `tmn:session:${code}`;

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

export function saveSession(code: string, session: Session) {
  try {
    localStorage.setItem(key(code), JSON.stringify(session));
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

const screenKey = (code: string) => `tmn:screen:${code}`;

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

export function saveScreen(code: string, session: ScreenSession) {
  try {
    localStorage.setItem(screenKey(code), JSON.stringify(session));
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
