// End-to-end check of a whole game over real WebSockets (D30, D31).
// Run against a dev worker:  pnpm dev   (then, in another terminal)
//                            pnpm --filter @tmn/party e2e:game
// Takes about a minute: the wheel spins and one turn runs out on the server clock.

const HOST = process.env.PARTY_HOST ?? "localhost:8787";
const V = 6; // keep in sync with PROTOCOL_VERSION in packages/game
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const code = Array.from(
  { length: 4 },
  () => LETTERS[Math.floor(Math.random() * 26)],
).join("");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
  return cond;
};

/** A socket that remembers its latest view, errors and emotes. */
class Client {
  constructor(label) {
    this.label = label;
    this.view = null;
    this.errors = [];
    this.emotes = [];
    this.joined = null;
    this.ws = new WebSocket(`ws://${HOST}/parties/lobby/${code}?v=${V}`);
    this.ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const msg = JSON.parse(e.data);
      if (msg.type === "state") this.view = msg.view;
      if (msg.type === "error") this.errors.push(msg);
      if (msg.type === "emote") this.emotes.push(msg);
      if (msg.type === "joined") this.joined = msg;
    };
    this.timer = setInterval(
      () => this.ws.readyState === 1 && this.ws.send("ping"),
      5000,
    );
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = reject;
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  /** Waits until `pred(view)` holds on the latest view. */
  async until(pred, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.view && pred(this.view)) return this.view;
      await sleep(50);
    }
    return null;
  }
  async error(code, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.errors.findIndex((e) => e.code === code);
      if (i >= 0) return this.errors.splice(i, 1)[0];
      await sleep(50);
    }
    return null;
  }
  close() {
    clearInterval(this.timer);
    this.ws.close();
  }
}

const CONFIG = {
  roundLengthSec: 15,
  teamCount: 2,
  maxPlayers: 20,
  phrasesPerPlayer: 1,
  maxWordsPerPhrase: 3,
  profanityFilter: "off",
};

console.log(`game ${code} on ${HOST}`);
const screen = await new Client("screen").open();
screen.send({ type: "create", config: CONFIG });
check(
  await screen.until((v) => v.phase === "lobby"),
  "host screen creates the lobby",
);

const names = ["Alex", "Blair", "Casey", "Drew"];
const phones = {};
for (const name of names) {
  const c = await new Client(name).open();
  c.send({ type: "join", name });
  await c.until((v) => v.you);
  phones[name] = c;
}
const id = (name) => phones[name].view.you;
const gm = phones.Alex;
check(
  await screen.until((v) => v.players.length === 4),
  "four players joined; Alex is GM",
);

// Cavan (D30)
gm.send({ type: "setCavan", playerId: id("Drew") });
check(
  await screen.until((v) => v.players.find((p) => p.name === "Drew")?.isCavan),
  "GM makes Drew Cavan (visible on the TV)",
);

// Wheel → captains name teams → writing
gm.send({ type: "startTeams" });
check(
  await screen.until((v) => v.draft?.stage === "complete", 30000),
  "the server wheel assigns everyone",
);
for (const team of screen.view.teams) {
  const captain = Object.values(phones).find(
    (c) => c.view.you === team.captainId,
  );
  captain?.send({
    type: "nameTeam",
    teamId: team.id,
    name: `${captain.label}s`,
  });
}
check(
  await screen.until((v) => v.teams.every((t) => t.nameConfirmed)),
  "captains name their teams",
);
gm.send({ type: "confirmTeams" });
check(await screen.until((v) => v.phase === "writing"), "GM starts writing");

for (const name of names)
  phones[name].send({ type: "submitPhrase", text: `${name} secret` });
check(
  await gm.until((v) => v.moderation.some((p) => p.text === "Drew secret")),
  "Cavan's phrase waits in the GM's queue",
);
check(
  !JSON.stringify(phones.Blair.view).includes("Drew secret") &&
    !JSON.stringify(screen.view).includes("Drew secret"),
  "nobody else sees Cavan's pending phrase",
);
gm.send({ type: "startGame" });
check(
  await gm.error("INVALID"),
  "the game can't start with Cavan's phrase pending",
);
gm.send({ type: "rejectPhrase", phraseId: gm.view.moderation[0].id });
await phones.Drew.until((v) =>
  v.ownPhrases.some((p) => p.status === "rejected"),
);
phones.Drew.send({ type: "submitPhrase", text: "Drew redo" });
const queued = await gm.until((v) =>
  v.moderation.some((p) => p.text === "Drew redo"),
);
check(queued, "Drew writes a replacement after a rejection");
gm.send({ type: "approvePhrase", phraseId: queued.moderation[0].id });
await gm.until((v) => v.moderation.length === 0);

// Round 1
gm.send({ type: "startGame" });
check(
  await screen.until(
    (v) => v.phase === "roundIntro" && v.game.roundTitle === "Describe it",
  ),
  "round 1 intro",
);
for (const name of names) phones[name].send({ type: "acknowledge" });
const ready = await screen.until((v) => v.phase === "turnReady" && v.game.turn);
check(ready, "everyone acknowledges; someone is up");

const activeClient = (view) =>
  Object.values(phones).find((c) => c.view.you === view.game.turn.playerId);
let up = activeClient(ready);
gm.send({ type: "startTurn" });
await up.until((v) => v.phase === "turnActive");
const phrase = up.view.game.turn.currentPhrase;
check(!!phrase, `only ${up.label} gets the phrase`);
check(
  ![screen, ...Object.values(phones).filter((c) => c !== up && c !== gm)].some(
    (c) => JSON.stringify({ ...c.view, ownPhrases: [] }).includes(phrase),
  ),
  "the TV and other phones don't see it",
);
up.send({ type: "next" });
check(
  await up.error("INVALID"),
  "Got it is refused during the 3-2-1 countdown",
);
await sleep(3200);
for (let i = 0; i < 4; i++) {
  up.send({ type: "next" });
  await sleep(150);
}
const pileOut = await screen.until((v) => v.phase === "turnReview");
check(
  pileOut?.game.turn.endedBy === "pile",
  "guessing the whole pile stops the clock",
);
check(
  pileOut?.game.turn.guessed.length === 4,
  "the TV lists the 4 guessed phrases in review",
);
up.send({ type: "back" });
await up.until((v) => v.game.turn.cursor === 3);
up.send({ type: "forward" });
await up.until((v) => v.game.turn.cursor === 4);
const scorer = pileOut.game.turn.teamId;
gm.send({ type: "proceed" });
const round2 = await screen.until(
  (v) => v.phase === "roundIntro" && v.game.round === 2,
);
check(round2?.game.scores[scorer] === 4, "proceed banks 4 points");
check(
  round2?.game.turn?.carried &&
    round2.game.turn.playerId === pileOut.game.turn.playerId,
  "the same player carries the leftover time into round 2 (Charades)",
);

// Emotes
phones.Blair.send({ type: "emote", kind: "tomato" });
const start = Date.now();
while (!screen.emotes.length && Date.now() - start < 3000) await sleep(50);
check(
  screen.emotes[0]?.kind === "tomato" && screen.emotes[0]?.name === "Blair",
  "emotes reach the TV",
);

// Round 2: the carried turn runs out on the server's clock (alarm → _turnTick).
gm.send({ type: "beginRound" });
await screen.until((v) => v.phase === "turnReady");
gm.send({ type: "startTurn" });
const timedOut = await screen.until(
  (v) => v.phase === "turnReview" && v.game.turn.endedBy === "timer",
  25000,
);
check(timedOut, "the server ends the turn when the time runs out");
gm.send({ type: "proceed" });
const next = await screen.until(
  (v) => v.phase === "turnReady" && v.game.turn.teamId !== scorer,
);
check(next, "rotation moves on to the other team");

// Skip and go next (D35): the turn passes to a teammate, then comes back.
const skippedId = next.game.turn.playerId;
gm.send({ type: "skipTurn" });
const passed = await screen.until(
  (v) =>
    v.phase === "turnReady" &&
    v.game.turn.playerId !== skippedId &&
    v.game.skipped.includes(skippedId),
);
check(
  passed?.game.turn.teamId === next.game.turn.teamId,
  "GM skips a turn: a teammate takes it, and the skip is remembered",
);
gm.send({ type: "upNext", playerId: skippedId });
check(
  await screen.until(
    (v) =>
      v.game.turn?.playerId === skippedId &&
      v.game.skipped.length === 0 &&
      v.game.upNext === skippedId,
  ),
  "GM sends the skipped player up: they take the turn after all",
);

// GM controls: pause, add time, resume, end turn
gm.send({ type: "startTurn" });
await screen.until((v) => v.phase === "turnActive");
await sleep(3500);
gm.send({ type: "pauseTimer" });
const paused = await screen.until((v) => v.game.turn?.paused);
check(paused, "GM pauses the clock");
const before = paused?.game.turn.remainingMs ?? 0;
gm.send({ type: "addTime", ms: 10000 });
check(
  await screen.until(
    (v) => v.game.turn.remainingMs === Math.min(before + 10000, 600000),
  ),
  "GM adds 10 seconds while paused",
);
gm.send({ type: "resumeTimer" });
await screen.until((v) => !v.game.turn.paused);
gm.send({ type: "endTurn" });
check(
  await screen.until(
    (v) => v.phase === "turnReview" && v.game.turn.endedBy === "gm",
  ),
  "GM ends the turn",
);
gm.send({ type: "proceed" });

// Play out the rest: whoever is up guesses everything.
for (let guard = 0; guard < 30 && screen.view.phase !== "results"; guard++) {
  const v = screen.view;
  if (v.phase === "roundIntro") gm.send({ type: "beginRound" });
  else if (v.phase === "turnReady") {
    gm.send({ type: "startTurn" });
    await screen.until((s) => s.phase === "turnActive");
    await sleep(3200);
    up = activeClient(screen.view);
    while (screen.view.phase === "turnActive") {
      up.send({ type: "next" });
      await sleep(120);
    }
  } else if (v.phase === "turnReview") gm.send({ type: "proceed" });
  await sleep(300);
}
const results = await screen.until((v) => v.phase === "results", 10000);
check(
  results?.game.winners.length >= 1,
  "after round 3 the TV shows the winner(s)",
);
const podium = results?.game.leaders ?? [];
check(
  podium.length >= 1 &&
    podium[0].place === 1 &&
    podium.every((l, i) => i === 0 || l.points <= podium[i - 1].points),
  "the results podium ranks the top describers",
);

gm.send({ type: "playAgain" });
check(
  await screen.until(
    (v) =>
      v.phase === "lobby" && v.players.length === 4 && v.teams.length === 0,
  ),
  "Play again returns everyone to the lobby",
);

for (const c of [screen, ...Object.values(phones)]) c.close();
await sleep(100);
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
