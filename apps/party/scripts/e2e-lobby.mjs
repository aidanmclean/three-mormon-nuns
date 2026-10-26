// End-to-end check of the Lobby worker over real WebSockets.
// Run against a dev worker:  pnpm dev   (then, in another terminal)
//                            pnpm --filter @tmn/party e2e
// Takes ~30 s because it waits for a silent client to be marked inactive.

const HOST = process.env.PARTY_HOST ?? "localhost:8787";
const V = 3; // keep in sync with PROTOCOL_VERSION in packages/game
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const code = Array.from(
  { length: 4 },
  () => LETTERS[Math.floor(Math.random() * 26)],
).join("");

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

class Client {
  constructor(name, { room = code, v = V, heartbeat = true } = {}) {
    this.name = name;
    this.messages = [];
    this.waiters = [];
    this.closed = null;
    this.ws = new WebSocket(`ws://${HOST}/parties/lobby/${room}?v=${v}`);
    this.ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const msg = JSON.parse(e.data);
      this.messages.push(msg);
      this.flush();
    };
    this.ws.onclose = (e) => {
      this.closed = e.code;
      this.flush();
    };
    if (heartbeat) {
      this.timer = setInterval(
        () => this.ws.readyState === 1 && this.ws.send("ping"),
        5000,
      );
    }
  }
  open() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === 1) return resolve(this);
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = reject;
    });
  }
  send(msg) {
    this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  flush() {
    this.waiters = this.waiters.filter((w) => !w());
  }
  /** Resolves with the first message (seen so far or later) matching `pred`. */
  waitFor(pred, ms = 5000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), ms);
      const attempt = () => {
        const found = this.messages.find(pred);
        if (!found) return false;
        this.messages = this.messages.filter((m) => m !== found);
        clearTimeout(timeout);
        resolve(found);
        return true;
      };
      if (!attempt()) this.waiters.push(attempt);
    });
  }
  waitClosed(ms = 5000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(this.closed), ms);
      const attempt = () => {
        if (this.closed === null) return false;
        clearTimeout(timeout);
        resolve(this.closed);
        return true;
      };
      if (!attempt()) this.waiters.push(attempt);
    });
  }
  close() {
    clearInterval(this.timer);
    this.ws.close();
  }
}

const isError = (code) => (m) => m.type === "error" && m.code === code;
const stateWhere = (pred) => (m) => m.type === "state" && pred(m.view);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`lobby ${code} on ${HOST}`);
const statusOf = (v, id) => v.players.find((p) => p.id === id)?.status;
const gmOf = (v) => v.players.find((p) => p.isGamemaster)?.id;

// Protocol version gate
const stale = await new Client("stale", { v: 0 }).open();
check(
  await stale.waitFor((m) => m.type === "reload"),
  "old protocol version is told to reload",
);

// Joining a lobby that doesn't exist
const early = await new Client("early").open();
early.send({ type: "join", name: "Early" });
check(
  await early.waitFor(isError("LOBBY_NOT_FOUND")),
  "join before create → LOBBY_NOT_FOUND",
);
early.close();

// The host screen creates the lobby; it is not a player (D18)
const screen = await new Client("screen").open();
screen.send({ type: "create" });
const screenJoined = await screen.waitFor(
  (m) => m.type === "joined" && m.as === "screen",
);
check(screenJoined, "screen create → joined as screen");
check(
  await screen.waitFor(
    stateWhere((v) => v.players.length === 0 && v.you === null),
  ),
  "screen sees an empty lobby",
);

const again = await new Client("again").open();
again.send({ type: "create" });
check(await again.waitFor(isError("CODE_TAKEN")), "second create → CODE_TAKEN");
again.send({ type: "screen", token: "guess" });
check(
  await again.waitFor(isError("FORBIDDEN")),
  "screen reconnect with a wrong token → FORBIDDEN",
);
again.close();

// First player becomes game master
const hazel = await new Client("hazel").open();
hazel.send({ type: "join", name: "Hazel" });
const hazelJoined = await hazel.waitFor(
  (m) => m.type === "joined" && m.as === "player",
);
check(hazelJoined, "Hazel joins");
check(
  await screen.waitFor(
    stateWhere(
      (v) => v.players.length === 1 && gmOf(v) === hazelJoined?.playerId,
    ),
  ),
  "first player is the game master (seen on the screen)",
);

const alex = await new Client("alex").open();
alex.send({ type: "join", name: "Alex" });
const alexJoined = await alex.waitFor((m) => m.type === "joined");
check(alexJoined, "Alex joins");
check(
  await hazel.waitFor(stateWhere((v) => v.players.length === 2)),
  "GM sees 2 players",
);

const dupe = await new Client("dupe").open();
dupe.send({ type: "join", name: "  ALEX " });
check(await dupe.waitFor(isError("NAME_TAKEN")), "active name → NAME_TAKEN");

// Boundary validation (§6.2) and authorization (§6.3)
dupe.send("{not json");
check(
  await dupe.waitFor(isError("BAD_MESSAGE")),
  "malformed JSON → BAD_MESSAGE",
);
dupe.send({ type: "teleport" });
check(await dupe.waitFor(isError("BAD_MESSAGE")), "unknown type → BAD_MESSAGE");
dupe.send({ type: "join", name: "x", sneaky: true });
check(await dupe.waitFor(isError("BAD_MESSAGE")), "unknown key → BAD_MESSAGE");
dupe.send(JSON.stringify({ type: "join", name: "x".repeat(5000) }));
check(
  await dupe.waitFor(isError("BAD_MESSAGE")),
  "oversized message → BAD_MESSAGE",
);
dupe.send({ type: "kick", playerId: hazelJoined.playerId });
check(await dupe.waitFor(isError("NOT_JOINED")), "unjoined socket can't act");
dupe.close();
screen.send({ type: "updateConfig", config: { teamCount: 3 } });
check(await screen.waitFor(isError("FORBIDDEN")), "host screen can't act");
screen.send({ type: "join", name: "Sneaky" });
check(
  await screen.waitFor(isError("FORBIDDEN")),
  "host screen can't join as a player",
);
alex.send({ type: "updateConfig", config: { teamCount: 3 } });
check(
  await alex.waitFor(isError("FORBIDDEN")),
  "non-GM config change → FORBIDDEN",
);
hazel.send({ type: "updateConfig", config: { roundLengthSec: 999 } });
check(
  await hazel.waitFor(isError("BAD_MESSAGE")),
  "out-of-range config → rejected",
);
hazel.send({ type: "updateConfig", config: { moderation: "all" } });
check(
  await hazel.waitFor(isError("BAD_MESSAGE")),
  "removed moderation setting → rejected",
);
hazel.send({
  type: "updateConfig",
  config: { roundLengthSec: 90, maxWordsPerPhrase: 4 },
});
check(
  await screen.waitFor(
    stateWhere(
      (v) => v.config.roundLengthSec === 90 && v.config.maxWordsPerPhrase === 4,
    ),
  ),
  "GM config change reaches the screen",
);

// Rate limiting
const spam = await new Client("spam").open();
for (let i = 0; i < 40; i++) spam.send("{}");
check(await spam.waitFor(isError("RATE_LIMITED")), "flooding → RATE_LIMITED");
spam.close();

// Screen reconnect: newest screen wins
const screen2 = await new Client("screen2").open();
screen2.send({ type: "screen", token: screenJoined.token });
check(
  await screen2.waitFor((m) => m.type === "joined" && m.as === "screen"),
  "screen reconnects with its token",
);
check(
  await screen2.waitFor(stateWhere((v) => v.players.length === 2)),
  "reconnected screen gets the current state",
);
check(
  await screen.waitFor((m) => m.type === "bye" && m.reason === "replaced"),
  "old screen told it was replaced",
);
screen.close();

// Token reconnect: newest socket wins
const alex2 = await new Client("alex2").open();
alex2.send({ type: "join", name: "whatever", token: alexJoined.token });
const rebound = await alex2.waitFor((m) => m.type === "joined");
check(
  rebound?.playerId === alexJoined.playerId,
  "token reconnect → same player",
);
check(
  await alex.waitFor((m) => m.type === "bye" && m.reason === "replaced"),
  "old socket told it was replaced",
);
alex.close();

// The GM's phone dies: they go inactive, GM passes to Alex, and Hazel rejoins by name.
hazel.close();
const handoff = await screen2.waitFor(
  stateWhere(
    (v) =>
      statusOf(v, hazelJoined.playerId) === "inactive" &&
      gmOf(v) === alexJoined.playerId,
  ),
  40000,
);
check(
  handoff,
  "silent GM marked inactive (~20 s) and GM passes to the next player",
);

const hazelPhone2 = await new Client("hazel-new-phone").open();
hazelPhone2.send({ type: "join", name: "hazel" });
const back = await hazelPhone2.waitFor((m) => m.type === "joined");
check(back?.playerId === hazelJoined.playerId, "rejoin by name → same player");
check(
  await screen2.waitFor(
    stateWhere(
      (v) =>
        statusOf(v, hazelJoined.playerId) === "active" &&
        gmOf(v) === alexJoined.playerId,
    ),
  ),
  "rejoined player active again; GM stays with Alex",
);

// Kick (by the new GM)
alex2.send({ type: "kick", playerId: hazelJoined.playerId });
check(
  await hazelPhone2.waitFor((m) => m.type === "bye" && m.reason === "kicked"),
  "kicked player told why",
);
check((await hazelPhone2.waitClosed()) === 4001, "kicked socket closed");
check(
  await screen2.waitFor(stateWhere((v) => v.players.length === 1)),
  "screen sees player removed",
);

alex2.close();
screen2.close();
stale.close();
await sleep(100);
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
