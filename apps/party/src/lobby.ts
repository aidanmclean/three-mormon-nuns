import {
  type Action,
  type ByeReason,
  ClientMessage,
  checkInvariants,
  createLobby,
  type ErrorCode,
  INACTIVE_AFTER_MS,
  type LobbyState,
  MAX_CONNECTIONS,
  MAX_MESSAGE_BYTES,
  type PlayerId,
  PRESENCE_SWEEP_MS,
  PROTOCOL_VERSION,
  RATE_LIMIT_BURST,
  RATE_LIMIT_PER_SEC,
  type Result,
  reduce,
  SCHEMA_VERSION,
  type ServerMessage,
  viewFor,
} from "@tmn/game";
import {
  type Connection,
  type ConnectionContext,
  Server,
  type WSMessage,
} from "partyserver";

/** Stored on each socket's attachment, so it survives hibernation. */
type SocketState = {
  playerId: PlayerId | null;
  /** The host screen: receives the public view, can't act (D18). */
  screen: boolean;
  connectedAt: number;
};

const utf8 = new TextEncoder();

/**
 * One instance per lobby code. A thin shell around the pure reducer in
 * @tmn/game: it owns sockets, storage, time and the alarm; the reducer owns
 * every game rule (docs/ARCHITECTURE.md §5.2).
 */
export class Lobby extends Server<Env> {
  static options = { hibernate: true };

  private lobby: LobbyState | null = null;
  /** In-memory only; resets on wake, which just means a fresh grace period. */
  private lastSeen = new Map<PlayerId, number>();
  private buckets = new Map<string, { tokens: number; at: number }>();
  private wokeAt = Date.now();

  async onStart() {
    // Heartbeats are answered by the runtime without waking us (D8).
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    this.wokeAt = Date.now();
    const stored = await this.ctx.storage.get<LobbyState>("state");
    if (stored?.schemaVersion === SCHEMA_VERSION) {
      this.lobby = stored;
    } else if (stored) {
      // Written by an older build. Lobbies are ephemeral, so start over (§6.5).
      await this.ctx.storage.deleteAll();
    }
  }

  onConnect(conn: Connection<SocketState>, { request }: ConnectionContext) {
    const version = new URL(request.url).searchParams.get("v");
    if (version !== String(PROTOCOL_VERSION)) {
      this.send(conn, { type: "reload" });
      conn.close(4000, "protocol version mismatch");
      return;
    }
    if ([...this.getConnections()].length > MAX_CONNECTIONS) {
      this.sendError(
        conn,
        "LOBBY_FULL",
        "This lobby has too many connections.",
      );
      conn.close(1013, "too many connections");
      return;
    }
    conn.setState({ playerId: null, screen: false, connectedAt: Date.now() });
  }

  async onMessage(conn: Connection<SocketState>, message: WSMessage) {
    // §6.2: size → rate limit → parse → schema, before any game logic runs.
    if (typeof message !== "string")
      return this.sendError(conn, "BAD_MESSAGE", "Expected text.");
    if (
      message.length > MAX_MESSAGE_BYTES ||
      utf8.encode(message).byteLength > MAX_MESSAGE_BYTES
    ) {
      return this.sendError(conn, "BAD_MESSAGE", "Message too large.");
    }
    if (!this.takeToken(conn)) return;

    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return this.sendError(conn, "BAD_MESSAGE", "Malformed JSON.");
    }
    const parsed = ClientMessage.safeParse(data);
    if (!parsed.success) {
      return this.sendError(
        conn,
        "BAD_MESSAGE",
        parsed.error.issues[0]?.message ?? "Invalid message.",
      );
    }
    const msg = parsed.data;
    const playerId = conn.state?.playerId ?? null;
    if (playerId) this.lastSeen.set(playerId, Date.now());

    // The host screen only displays the game; the game master controls it (D18).
    if (conn.state?.screen) {
      return this.sendError(
        conn,
        "FORBIDDEN",
        "The host screen can't do that.",
      );
    }
    if (playerId && (msg.type === "create" || msg.type === "screen")) {
      return this.sendError(
        conn,
        "INVALID",
        "You've already joined as a player.",
      );
    }

    if (msg.type === "create") {
      if (this.lobby)
        return this.sendError(
          conn,
          "CODE_TAKEN",
          "That lobby code is already in use.",
        );
      return this.commit(
        this.guard(() => createLobby(this.name, this.ctxFor(null), msg.config)),
        conn,
      );
    }
    if (!this.lobby) {
      return this.sendError(
        conn,
        "LOBBY_NOT_FOUND",
        `There's no lobby with code ${this.name}.`,
      );
    }
    return this.transition(msg, conn);
  }

  onClose(conn: Connection<SocketState>) {
    this.buckets.delete(conn.id);
    const playerId = conn.state?.playerId;
    if (playerId)
      this.lastSeen.set(
        playerId,
        Math.max(this.lastSeen.get(playerId) ?? 0, this.heartbeatAt(conn)),
      );
  }

  async onAlarm() {
    if (!this.lobby) return;
    const now = Date.now();
    if (now >= this.lobby.expiresAt) {
      const anyoneHere = Object.values(this.lobby.players).some(
        (p) => p.status === "active",
      );
      if (!anyoneHere) return this.expire();
      await this.transition({ type: "_touch" }, null);
    }
    await this.sweepPresence(now);
    await this.transition({ type: "_draftTick" }, null);
    await this.scheduleAlarm();
  }

  // ---------------------------------------------------------------------------

  private async transition(
    action: Action,
    from: Connection<SocketState> | null,
  ) {
    const lobby = this.lobby;
    if (!lobby) return;
    const actorId = from?.state?.playerId ?? null;
    await this.commit(
      this.guard(() => reduce(lobby, action, this.ctxFor(actorId))),
      from,
    );
  }

  /** Validates, persists, applies effects and broadcasts one reducer result (§6.5). */
  private async commit(result: Result, from: Connection<SocketState> | null) {
    if (!result.ok) {
      if (from) this.sendError(from, result.code, result.message);
      return;
    }
    const changed = result.state !== this.lobby;
    // An unchanged state can still carry effects (e.g. the screen reconnecting).
    if (!changed && result.effects.length === 0) return;

    if (changed) {
      const problems = checkInvariants(result.state);
      if (problems.length > 0) {
        console.error("invariant violation; transition rejected", problems);
        if (from)
          this.sendError(
            from,
            "INTERNAL",
            "Something went wrong. Please try again.",
          );
        return;
      }
      try {
        await this.ctx.storage.put("state", result.state);
      } catch (error) {
        console.error("storage write failed; transition rejected", error);
        if (from)
          this.sendError(
            from,
            "INTERNAL",
            "Something went wrong. Please try again.",
          );
        return;
      }
      this.lobby = result.state;
    }

    for (const effect of result.effects) {
      if (effect.type === "bound" && from) {
        from.setState({
          playerId: effect.playerId,
          screen: false,
          connectedAt: from.state?.connectedAt ?? Date.now(),
        });
        this.lastSeen.set(effect.playerId, Date.now());
        this.send(from, {
          type: "joined",
          as: "player",
          playerId: effect.playerId,
          token: effect.token,
        });
        // Newest socket wins: close any older ones for the same player.
        this.closePlayer(effect.playerId, "replaced", from.id);
      }
      if (effect.type === "screenBound" && from) {
        from.setState({
          playerId: null,
          screen: true,
          connectedAt: from.state?.connectedAt ?? Date.now(),
        });
        this.send(from, { type: "joined", as: "screen", token: effect.token });
        // Read-only host mirrors may coexist. Player sockets still use newest-wins.
      }
      if (effect.type === "kicked") this.closePlayer(effect.playerId, "kicked");
    }

    await this.scheduleAlarm();
    this.pushViews();
  }

  /** The reducer should never throw, but if it does the lobby must survive it. */
  private guard(run: () => Result): Result {
    try {
      return run();
    } catch (error) {
      console.error("reducer threw", error);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Something went wrong. Please try again.",
      };
    }
  }

  private ctxFor(actorId: PlayerId | null) {
    return {
      actorId,
      now: Date.now(),
      newId: () => crypto.randomUUID(),
      rng: Math.random,
    };
  }

  /** Marks players active or inactive from their sockets' heartbeats (D8, D15). */
  private async sweepPresence(now: number) {
    const lobby = this.lobby;
    if (!lobby) return;
    const freshest = new Map<PlayerId, number>();
    for (const conn of this.getConnections<SocketState>()) {
      const id = conn.state?.playerId;
      if (id)
        freshest.set(
          id,
          Math.max(freshest.get(id) ?? 0, this.heartbeatAt(conn)),
        );
    }

    const active: PlayerId[] = [];
    const inactive: PlayerId[] = [];
    for (const p of Object.values(lobby.players)) {
      const last = Math.max(
        freshest.get(p.id) ?? 0,
        this.lastSeen.get(p.id) ?? this.wokeAt,
      );
      const live = now - last <= INACTIVE_AFTER_MS;
      if (live && p.status === "inactive" && freshest.has(p.id))
        active.push(p.id);
      if (!live && p.status === "active") inactive.push(p.id);
    }
    // Sockets of players who went silent are dead or asleep; closing them
    // makes a waking phone reconnect (and rejoin by token) cleanly.
    for (const id of inactive) this.closePlayer(id, null);

    if (active.length > 0 || inactive.length > 0) {
      await this.transition({ type: "_presence", active, inactive }, null);
    }
  }

  /** Latest sign of life on a socket: auto-responded ping, or when it connected. */
  private heartbeatAt(conn: Connection<SocketState>): number {
    const pinged =
      this.ctx.getWebSocketAutoResponseTimestamp(conn)?.getTime() ?? 0;
    return Math.max(pinged, conn.state?.connectedAt ?? 0);
  }

  private async scheduleAlarm() {
    if (!this.lobby) return this.ctx.storage.deleteAlarm();
    const hasSockets = [...this.getConnections<SocketState>()].some(
      (c) => c.state?.playerId,
    );
    const anyActive = Object.values(this.lobby.players).some(
      (p) => p.status === "active",
    );
    const sweep =
      hasSockets || anyActive
        ? Date.now() + PRESENCE_SWEEP_MS
        : Number.POSITIVE_INFINITY;
    await this.ctx.storage.setAlarm(
      Math.min(
        this.lobby.expiresAt,
        sweep,
        this.lobby.draft?.nextAt ?? Number.POSITIVE_INFINITY,
      ),
    );
  }

  private async expire() {
    for (const conn of this.getConnections()) {
      this.send(conn, { type: "bye", reason: "expired" });
      conn.close(4002, "lobby expired");
    }
    this.lobby = null;
    this.lastSeen.clear();
    await this.ctx.storage.deleteAll();
  }

  private pushViews() {
    const lobby = this.lobby;
    if (!lobby) return;
    const now = Date.now();
    for (const conn of this.getConnections<SocketState>()) {
      const id = conn.state?.playerId;
      if (id) this.send(conn, { type: "state", view: viewFor(lobby, id), now });
      else if (conn.state?.screen) {
        this.send(conn, { type: "state", view: viewFor(lobby, null), now });
      }
    }
  }

  private closePlayer(
    playerId: PlayerId,
    reason: ByeReason | null,
    exceptId?: string,
  ) {
    for (const conn of this.getConnections<SocketState>()) {
      if (conn.id === exceptId || conn.state?.playerId !== playerId) continue;
      if (reason) this.send(conn, { type: "bye", reason });
      conn.close(reason === "kicked" ? 4001 : 4003, reason ?? "inactive");
    }
  }

  /** Token bucket per socket; sustained flooding closes it (§6.2). */
  private takeToken(conn: Connection): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(conn.id) ?? {
      tokens: RATE_LIMIT_BURST,
      at: now,
    };
    bucket.tokens = Math.min(
      RATE_LIMIT_BURST,
      bucket.tokens + ((now - bucket.at) / 1000) * RATE_LIMIT_PER_SEC,
    );
    bucket.at = now;
    bucket.tokens -= 1;
    this.buckets.set(conn.id, bucket);
    if (bucket.tokens >= 0) return true;
    if (bucket.tokens < -RATE_LIMIT_BURST) conn.close(1008, "rate limit");
    else this.sendError(conn, "RATE_LIMITED", "Slow down a little.");
    return false;
  }

  private send(conn: Connection, msg: ServerMessage) {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // Socket already closing; nothing to do.
    }
  }

  private sendError(conn: Connection, code: ErrorCode, message: string) {
    this.send(conn, { type: "error", code, message });
  }
}
