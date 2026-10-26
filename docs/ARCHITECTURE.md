# Architecture & design decisions

This is the single source of truth for **what** 3 Mormon Nuns does, **how** it is built, and **why**. Anyone, human or AI agent, should be able to pick it up, understand the current state, and extend it. The original game design board is [`3mormons.excalidraw`](./3mormons.excalidraw); where this document and the board disagree, this document wins, because it records later clarifications.

**Status markers** used throughout:

| Marker | Meaning                                                   |
| ------ | --------------------------------------------------------- |
| ✅     | Implemented and verified                                  |
| 🚧     | Designed and agreed, not built yet                        |
| ❓     | Open question or assumption that needs a product decision |

## Contents

- [0. Working on this project](#0-working-on-this-project)
- [1. Game spec](#1-game-spec)
- [2. System overview](#2-system-overview)
- [3. Decision log](#3-decision-log)
- [4. What is implemented today](#4-what-is-implemented-today)
- [5. Lobby server design](#5-lobby-server-design)
- [6. Security, validation & robustness](#6-security-validation--robustness)
- [7. Configuration reference](#7-configuration-reference)
- [8. Testing & verification](#8-testing--verification)
- [9. Open questions](#9-open-questions)
- [Appendix: decision template](#appendix-decision-template)

---

## 0. Working on this project

**Every change must be documented.** This applies to all contributors and all coding agents; the rules are also in [`AGENTS.md`](../AGENTS.md), which agents load automatically.

1. **Read this file first.** Check [§1](#1-game-spec) for the intended behavior and [§5](#5-lobby-server-design) for the agreed design before writing code.
2. **Record design decisions.**
   - Any non-obvious choice (a library, a data shape, a protocol rule, a tradeoff) gets a new `D<n>` entry in [§3](#3-decision-log), written with the [template](#appendix-decision-template).
   - Never delete or rewrite an accepted decision. Mark it `Superseded by D<m>` and add the new one.
3. **Keep status markers true.** When you build something marked 🚧, move its description into [§4](#4-what-is-implemented-today) and mark it ✅. If you resolve a ❓, record the answer where the question was and in the decision log.
4. **Log every change** in [`CHANGELOG.md`](./CHANGELOG.md): newest first, dated, one line per change, linking the decision if there is one.
5. **Keep the reference current.** If you change a dependency version, config file, script, or limit, update [§7](#7-configuration-reference).
6. **Don't silently deviate.** If the implementation has to differ from the design here, update the design (and the decision log) in the same change.

---

## 1. Game spec

A Kahoot-style take on Monikers / Fishbowl.

- Everyone joins a lobby on their own phone with a 4-letter code and writes phrases into a shared pile.
- Teams then take turns: one player gets the phrases and tries to get their team to guess as many as possible before the timer runs out.
- An optional shared screen (TV) shows the timer, scores and emotes.

### 1.1 Roles

| Role                 | Who                                                                                        | Can                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Host screen**      | The device that created the lobby: a TV or laptop everyone can see. **Not a player** (D18) | Shows the code, players, timer, scores and emotes. No controls: like Jackbox or Kahoot, it just runs the game                                                                                                                                                                                  |
| **Game master (GM)** | A player. The first to join; the GM can hand the role to anyone connected                  | **Controls the game:** settings, kick, rename, designate Cavan, hand off GM, move late joiners onto a team, start the game, run turns (`start_turn`, `end_turn`, `pause_timer`, `add_time` while paused, `restart_prev_turn`, `reveal`), **approve or reject Cavan's phrases**, **Play again** |
| **Cavan**            | One player the GM designates (optional)                                                    | Nothing extra. Cavan is the **moderated** player, not a moderator: every phrase Cavan writes must be accepted or rejected by the game master before it enters the pile. This always applies when someone is Cavan; there's no setting for it (D16)                                             |
| **Team captain**     | First player on each team                                                                  | Name their team and add or remove members during team selection                                                                                                                                                                                                                                |
| **Active player**    | Whoever's turn it is                                                                       | See the current phrase, press `next` (got it) and `back` (undo)                                                                                                                                                                                                                                |
| **Everyone**         | Any player                                                                                 | Send emotes (thumbs up, thumbs down, tomato, …)                                                                                                                                                                                                                                                |

### 1.2 Flow

| Stage         | Phase (§5)                                | What happens                                                                                                                                                            |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Lobby      | `lobby`                                   | The host screen creates the lobby and shows the code; players join on their phones with code + name; the first player is GM and configures ✅                           |
| 0b. Teams     | `teams`                                   | Usually 2 teams (more are allowed). The GM or captains build them; "random" spins a wheel of names with confetti, shown on the host screen                              |
| 1. Writing    | `writing`                                 | Everyone writes their phrases (3 each by default), validated against the config. Moderated phrases wait for GM approval. The GM starts the game once every phrase is in |
| 2. Rounds 1–3 | `roundIntro`, then turns                  | Each round opens with an explainer that every device acknowledges; then turns alternate between teams until the pile is empty                                           |
| Turn          | `turnReady` → `turnActive` → `turnReview` | See the turn rules below                                                                                                                                                |
| End           | `results`                                 | After round 3 the team with the most points wins. Equal top scores are a tie, with no tiebreaker. The GM can **Play again**                                             |

**Turn rules** (house rules, confirmed 2026-10-26; 🚧 built in the turn-loop slice; data model in D13):

1. Round 1 starts with player 1 of team A. Turns then alternate teams in a fixed order: A1, B1, A2, B2, … With more teams: A1, B1, C1, A2, … Each team cycles through its own players, so a smaller team simply wraps around sooner.
2. The game master starts the turn. The active player gets the turn length (1 minute by default) and sees one phrase at a time on their phone while their team guesses.
3. **Next** means it was guessed: the team scores +1 and a new phrase appears. A guessed phrase doesn't come back for the rest of that round.
4. **Back** undoes the last Next (e.g. it was hit by accident): the team loses that point and the previous phrase is shown again.
5. When the timer ends, the turn goes into **review**. The active player can still go **back**, all the way to the first phrase of their turn, and **forward** again up to the last phrase they saw, to settle a disputed last guess. No new phrases are drawn in review.
6. The game master presses **Proceed**: the turn's score is locked in and the next team's player is up.
7. When the last phrase in the pile is guessed, **the timer stops right there** and the round ends. The turn still goes to review, so the last guess can be disputed. After Proceed, **the same player keeps going** into the next round with whatever time was left (D17). Rotation then continues normally from them.
8. Rounds 2 and 3 reuse the whole pile, with different clue rules:
   - **Round 1, Describe it:** describe the phrase without saying any of the words in it.
   - **Round 2, Charades:** act it out, no talking.
   - **Round 3, One word:** give a clue of exactly one word.

   The round intro screen shows these rules. The text lives in `ROUND_RULES` in `packages/game/src/constants.ts`.
9. After round 3, the team with the most points wins. Equal top scores are a tie, and there's no tiebreaker.

### 1.3 Lifecycle requirements

These were added after the design board and are the main drivers of [§5.6](#56-presence-disconnects--rejoin) and [§5.7](#57-play-again).

- **Disconnect detection.** The server must notice when a player is gone, even when their phone dies without closing the connection. An inactive player's turn is skipped.
- **Rejoin by name.** A player who comes back and enters the **same name** as an inactive player rejoins _as that player_, keeping their team, phrases and score, and is marked active again.
- **Play again.** After a game ends, a **Play again** button returns everyone to the lobby without anyone reconnecting or re-entering the code.
- **Ephemeral.** Nothing is kept after a lobby ends: no accounts, no history.
- **Robust, not secure.** Nothing sensitive is stored. Security work exists to stop things breaking (see [§6](#6-security-validation--robustness)).

### 1.4 Fun extras (from the board, not yet designed)

- **Backdoors:** a prank that rewrites every phrase, and a reveal-all. These are intentional features, not vulnerabilities.
- **Periodic table easter egg:** show the element when a phrase is an element name.
- **Tomato button**, and joke "microtransactions".
- **Personalization** during join (optional "phase 3" on the board).

---

## 2. System overview

```
 phones / TV (browser)                 Vercel                      Cloudflare
┌──────────────────────┐         ┌────────────────┐        ┌──────────────────────────────┐
│ Next.js client       │  HTTP   │ apps/web       │        │ apps/party (Worker)          │
│  /                   │◀───────▶│ Next.js 16     │        │  routePartykitRequest()      │
│  /play/[code]        │         │ (pages, assets)│        │        │                     │
│                      │         └────────────────┘        │        ▼  one per lobby code │
│ partysocket ─────────┼──── WebSocket /parties/lobby/ABCD ─▶  Lobby Durable Object      │
└──────────────────────┘                                   │   state in memory          │
                                                           │   + SQLite storage         │
          @tmn/game (shared TS) is bundled into both ──▶   └──────────────────────────────┘
```

- **apps/web** serves the UI. It holds no game state on the server; every live interaction goes over the WebSocket.
- **apps/party** is a Cloudflare Worker. The URL `/parties/lobby/<CODE>` is routed to the Durable Object instance named `<CODE>`, so **each lobby is its own single-threaded server** with its own memory and storage.
- **packages/game** is plain TypeScript shared by both apps: constants, types, the message protocol, and (🚧) the rules reducer and validation.

Web and party **deploy separately** (Vercel and Cloudflare), so for a while after each deploy they can be on different versions. [§6.8](#68-deploys--version-skew) covers how that's handled.

---

## 3. Decision log

Entries are append-only. Use the [template](#appendix-decision-template) for new ones.

### D1: Lobby state lives in a Durable Object (PartyServer), not Redis or Supabase

**Status:** Accepted · 2026-10-25

**Decision:** One Cloudflare Durable Object per lobby, using [`partyserver`](https://github.com/cloudflare/partykit/tree/main/packages/partyserver) on the server and [`partysocket`](https://www.npmjs.com/package/partysocket) on the client.

**Why:**

- A Durable Object is a stateful actor addressed by name. Naming it by lobby code gives a dedicated, single-threaded server per game: no races between players acting at the same moment, and no locking.
- It holds WebSockets directly, so the realtime transport and the state live in the same place.
- Its built-in SQLite storage survives the object being evicted from memory, which makes rejoin robust. An alarm can wipe that storage when the lobby goes idle, so data is ephemeral by construction.
- The Workers free plan includes SQLite-backed Durable Objects. There's nothing to provision.

**Alternatives considered:**

| Option                                              | Why not                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redis** (Upstash/Valkey) + a WebSocket service    | Redis would only be an external copy of state the lobby process already holds. We would still need a separate long-lived WebSocket server, because Vercel functions can't hold sockets. That's two moving parts instead of one.                                                                      |
| **Supabase** (Realtime + Postgres)                  | Built for durable data. Realtime Broadcast relays messages between clients with no server in charge, so it can't keep phrases secret or own the timer without moving logic into Edge Functions and DB rows that then need cleanup jobs. A good fit later _if_ we add accounts or saved phrase packs. |
| **Socket.IO on a single Node server** (Fly/Railway) | Simple and a valid fallback. But it means running a custom Next server or a second always-on box, lobbies are lost on every deploy, and scaling past one box would need Redis anyway.                                                                                                                |
| **Hosted PartyKit**                                 | Shut down in October 2026 ([announcement](https://blog.partykit.io/posts/hosted-platform-shutdown)). PartyServer is its official successor and keeps the same programming model, running in our own Cloudflare account.                                                                              |

### D2: pnpm workspaces monorepo, no Turborepo

**Status:** Accepted · 2026-10-25

Three packages (`apps/web`, `apps/party`, `packages/game`) share types and rules, so they live in one repo. pnpm's `-r` / `--parallel` flags cover everything the root scripts need. Turborepo can be added later if build caching becomes worth it. Packages are scoped `@tmn/*` and depend on each other with `workspace:*`.

### D3: Shared game logic in `packages/game`, with no runtime-specific code

**Status:** Accepted · 2026-10-25

The same rules must run in two places:

- on the server, which is the source of truth
- on the client, for instant feedback, e.g. "too many words in this phrase"

Putting them in one package means the two can't drift apart. The package must not touch DOM or Workers APIs, so it can also be unit-tested with plain Vitest.

It is consumed as raw TypeScript (`"exports": { ".": "./src/index.ts" }`), with no build step:

- **Next.js:** Turbopack transpiles workspace packages automatically, so `transpilePackages` is **not** needed. Next 16.4's own docs say so.
- **Wrangler:** its esbuild bundler handles TS natively.

### D4: Next.js 16 with Cache Components (the new default)

**Status:** Accepted · 2026-10-25

`create-next-app@16.4.3` enables `cacheComponents` and `partialPrefetching`. We kept the defaults.

**Consequence:** a dynamic route like `/play/[code]` doesn't know its params at build time, so params must be read inside `<Suspense>`. See [`app/play/[code]/page.tsx`](../apps/web/app/play/%5Bcode%5D/page.tsx). The page is built as a **partial prerender**: a static shell plus streamed content.

**Hosting:** Vercel is the zero-config target. The whole app could later move to Cloudflare via `@opennextjs/cloudflare` if we want one provider.

### D5: Tooling: Biome, TypeScript 7, Vitest 5

**Status:** Accepted · 2026-10-25

- **Biome** replaces ESLint and Prettier with one fast binary. There's a single `biome.json` at the root, with Next/React rule domains enabled. It also formats Markdown, JSON, and CSS (including Tailwind directives).
- **TypeScript 7** (the native Go compiler) runs `tsc --noEmit` in every package, and Next's build-time type check works with it (verified with `next build`).
- **Vitest 5** runs the unit tests in `packages/game`.

### D6: Dependency policy

**Status:** Accepted · 2026-10-25

- **Always use the latest stable versions.** Look them up (`pnpm view <pkg> version`) rather than guessing. Exact versions are in [§7](#7-configuration-reference).
- **pnpm's supply-chain release-age gate stays on.** pnpm 11 refuses packages published in the last ~24 h. When that blocks the newest release, use the newest version that passes. Don't add a `minimumReleaseAgeExclude` entry.
- **`allowBuilds`** in `pnpm-workspace.yaml` explicitly approves install scripts:
  - `esbuild` and `workerd` are allowed, because Wrangler needs their native binaries.
  - `sharp` and `unrs-resolver` are denied; we don't use them.
- **`@types/node` tracks the Node major we run (24)**, not the newest types (26), so the types never describe APIs the runtime lacks.

### D7: Identity is your name within a lobby, plus a device token for seamless reconnects

**Status:** Accepted · 2026-10-26 (revises the earlier token-only idea, which was never built)

**Decision:**

- There are no accounts. A player is identified by their **name, unique within the lobby** and compared case-insensitively.
- The server also issues a random **session token**, which the browser keeps in `localStorage` per lobby code.
- A reconnect that presents the token takes over its player immediately.
- A join that presents only a name can claim a player with that name **only if that player is inactive**.

**Why:**

- **Name:** the user requirement is "if a phone dies, they rejoin as themselves by entering the same name". That has to work from a different device, so it can't depend on anything stored in the browser.
- **Token:** a name alone would break the most common case. When a phone switches from Wi-Fi to cellular, the new socket arrives while the old one still looks alive, so a name-only rejoin would be refused as "name taken". The token makes refreshes and network switches invisible.

**Consequence:** anyone who knows an inactive player's name can take them over. This is accepted, because nothing is at stake and the game master can kick or rename ([§6.9](#69-accepted-risks--non-goals)). Full rules are in [§5.6](#56-presence-disconnects--rejoin).

### D8: Presence uses client heartbeats and a server sweep; inactive players are skipped

**Status:** Accepted · 2026-10-26

**Decision:**

- Clients send a `ping` text frame every few seconds. The Durable Object answers with `pong` using `ctx.setWebSocketAutoResponse(...)`, which does **not** wake a hibernated object.
- A periodic alarm sweep reads `ctx.getWebSocketAutoResponseTimestamp(ws)` for every socket.
- A player whose sockets have all been silent past a threshold is marked **inactive**. Turn rotation skips inactive players.

**Why:**

- WebSocket `close` events alone aren't enough: a phone that dies or drops off the network often never sends a close frame, and the server can't tell a half-open socket from a quiet one.
- Auto-response keeps heartbeats cheap and hibernation-friendly.

**Alternatives:**

- **Server-initiated pings:** these need the object awake to send them.
- **Relying on Cloudflare's eventual socket timeout:** too slow, and outside our control.

### D9: "Play again" resets the same lobby in place

**Status:** Accepted · 2026-10-26 · superseded in part by D18 (the actor is now the game master)

**Decision:** `playAgain` is a host action in `results`. It moves the same Durable Object back to the `lobby` phase. Players, roles, config and teams are kept; the game data (phrases, scores, turns) is cleared.

**Why:** everyone's socket is already connected to this lobby code. Resetting in place means nobody navigates, reconnects or re-enters a code; the next state push simply shows the lobby. A fresh lobby would force everyone to move.

### D10: Robustness over security: validate at the boundary, server is authoritative, state can never go invalid

**Status:** Accepted · 2026-10-26

**Decision:**

- Every inbound message is size-checked and schema-validated (zod) before it reaches game logic.
- Every action is authorized by role and phase inside the reducer.
- Clients only send **intents**; the server owns time, randomness, scores and hidden phrases.
- After each transition the new state is checked against invariants. A failing transition is rejected and the previous state is kept.

**Why:** there is nothing worth stealing, so the goal is that no client can crash a lobby, corrupt its state, or see hidden phrases, whether it's buggy, outdated or mischievous. See [§6](#6-security-validation--robustness).

### D11: Documentation is part of every change

**Status:** Accepted · 2026-10-26

**Decision:** every change updates this file and [`CHANGELOG.md`](./CHANGELOG.md) as described in [§0](#0-working-on-this-project). The rules live in root [`AGENTS.md`](../AGENTS.md); [`CLAUDE.md`](../CLAUDE.md) imports it, so Claude Code and other agents load them automatically.

**Why:** the project is meant to be picked up and extended by different developers and agents. Design intent that only lives in a chat transcript is lost.

### D12: Dev servers are reachable from the LAN with zero config

**Status:** Accepted · 2026-10-26

**Decision:**

- The dev worker listens on `0.0.0.0:8787` (`dev.ip` in `wrangler.jsonc`).
- The client connects to `<page hostname>:8787` unless `NEXT_PUBLIC_PARTY_HOST` is set.
- `allowedDevOrigins` admits `10.*` and `192.168.*` origins.

**Why:** the game is played on phones, so testing on phones has to work from plain `pnpm dev`. The first setup needed a separately started worker plus a hand-set host. That led to an `EADDRINUSE` clash with `pnpm dev`'s worker, and to tabs stuck on "connecting…" when the host pointed at an interface the worker wasn't listening on.

**Alternatives:**

- **Documenting manual steps:** proven error-prone.
- **A tunnel (e.g. cloudflared):** adds a dependency and an internet round trip for local play.

**Consequences:**

- The dev worker and dev server are reachable by anyone on the same network. That's acceptable, because they hold only local test lobbies.
- Production must set `NEXT_PUBLIC_PARTY_HOST`.

### D13: A turn is a list of seen phrases plus a cursor

**Status:** Accepted · 2026-10-26

**Decision:**

- A turn records `seen`, the phrases in the order the active player saw them, and `cursor`, how many of them currently count as guessed.
- `next` moves the cursor forward. When the cursor reaches the end of `seen` (only while the timer runs), it draws a random unguessed phrase from the pile.
- `back` moves the cursor back.
- In review (`turnReview`), back and forward move within `0…maxCursor`, where `maxCursor` is the furthest the cursor got during the live turn.
- `proceed` removes `seen[0…cursor)` from the pile and adds `cursor` to the team's score.
- Turn order is per team: an index into the team rotation, plus a next-player index per team.

**Why:**

- The rules let a player undo all the way to their first phrase and redo up to their last, both during and after the timer. With one list and a cursor, undo and redo are just moving an index.
- The live score is simply `cursor`, so it can't drift from what's on screen, and nothing is committed until Proceed.
- Per-team player indices give the A1, B1, A2, B2 order, and handle uneven teams, late joiners and skipped (inactive) players without a precomputed list.

**Alternatives:**

- **A log of next/back events replayed for the score:** more state and harder invariants.
- **A flat precomputed turn-order list:** breaks with uneven teams or mid-game joiners.

**Consequences:**

- New invariants: `0 ≤ cursor ≤ maxCursor ≤ seen.length`, `seen` holds no duplicates, and every phrase in `seen` is in the pile.
- `restartPrevTurn` needs a snapshot of the pile, scores and rotation from before the last Proceed.
- This replaces `turnOrder` and `turn.guessed` from the first sketch.

### D14: Lobbies are created over the WebSocket, not an HTTP endpoint

**Status:** Accepted · 2026-10-26 (replaces the `POST /parties/lobby/<CODE>` idea, which was never built)

**Decision:**

- The host's browser picks a random code, connects to `/parties/lobby/<CODE>` like every other client, and sends `{ type: "create" }`. Since D18 there's no name: the host screen isn't a player.
- If that lobby already exists, the server answers `CODE_TAKEN`, and the client moves its session to a new random code and retries.
- A `join` on a code that was never created gets `LOBBY_NOT_FOUND`.

**Why:** one protocol and one validation path instead of two. It also avoids CORS, which would have had to allow ever-changing LAN origins in dev.

**Consequences:** connecting to an unused code instantiates an empty Durable Object that stores nothing. That's cheap and harmless.

### D15: Presence is computed in the shell; only status changes reach the reducer

**Status:** Accepted · 2026-10-26 (refines D8)

**Decision:**

- The Durable Object tracks liveness itself, from three sources: each socket's last auto-responded ping (`ctx.getWebSocketAutoResponseTimestamp`), its connect time, and the player's last message.
- Every sweep (5 s) passes the reducer only the transitions: `_presence { active: [...], inactive: [...] }`.
- A player goes inactive once nothing has been heard from any of their sockets for `INACTIVE_AFTER_MS` (20 s).
- `LobbyState` doesn't store a `lastSeenAt`.

**Why:** a heartbeat timestamp in state would change on every sweep. That's a storage write and a broadcast every 5 s per lobby for nothing. Socket liveness is runtime information anyway; the reducer only needs to know who's in or out, so it can apply the consequences (role handoff now, turn skipping later).

**Alternatives:** `lastSeenAt` in state, as in the first sketch. Rejected for the write amplification above.

**Consequences:**

- The in-memory tracking is lost when the object hibernates or restarts. On wake every player gets a fresh grace period, so a dead phone is still caught at most `INACTIVE_AFTER_MS` after the wake.
- When a player is marked inactive, their remaining sockets are closed. A phone that was only asleep reconnects and rejoins by token.
- Presence sweeps don't count as activity for expiry. Instead, when `expiresAt` passes while someone is still active, the shell sends `_touch` to extend it.

### D16: Cavan's phrases are always vetted; there's no moderation setting

**Status:** Accepted · 2026-10-26

**Decision:**

- There's no "phrase approval" option.
- Whenever a player is designated Cavan (`roles.cavanId`), every phrase they write is `pending` until the game master approves or rejects it.
- Nobody else's phrases are ever moderated.
- The `moderation` config field (`off | cavan | all`) is removed, which bumps `SCHEMA_VERSION` and `PROTOCOL_VERSION` to 2.

**Why:** that's the house rule. Vetting Cavan is the whole point of the role, so a setting that could turn it off, or extend it to everyone, only added a way to get it wrong.

**Consequences:**

- Designating Cavan turns the vetting on; clearing Cavan turns it off.
- The lobby shows a note, "The game master approves or rejects every phrase Cavan writes", whenever someone is Cavan.

### D17: When the pile runs out, the same player keeps going with the time left

**Status:** Accepted · 2026-10-26 (refines D13)

**Decision:**

- A turn records why it ended in `turn.endedBy`: `"timer" | "pile" | "gm"`.
- When `next` guesses the last phrase in the pile, the timer freezes and `remainingMs` keeps the time left. The turn goes to review with `endedBy: "pile"`.
- On `proceed`, a turn that ended by `"pile"` stays with the same player and keeps its `remainingMs`:
  - If the pile is still empty, the round advances, through the next `roundIntro`. After round 3 it goes to `results` instead.
  - If a disputed phrase was put back during review, play continues in the same round.
  - Either way the GM starts the continued turn as usual.
- A turn that ended by `"timer"` or `"gm"` passes to the next team.

**Why:** that's the house rule: "the timer stops there, the same player keeps going, and round 2 starts with however much was left on the timer". Handling the "put back in review" case the same way gives one rule, "pile-out means you keep your time", instead of a special case.

**Consequences:**

- The rotation pointer doesn't advance on a pile-out Proceed.
- Invariant: `endedBy` is `null` while the turn is live, and set in `turnReview`.
- ❓ Q11 covers a pile-out with almost no time left.

### D18: The host is a shared screen, not a player; the game master controls the game

**Status:** Accepted · 2026-10-26 (supersedes the original "host is a player with admin powers" model; D9 updated accordingly)

**Decision:**

- Like Jackbox or Kahoot, the **host is the screen**: the TV or laptop that clicks "Host a new game" at `/`.
- The screen creates the lobby, gets a `screenToken` (kept in `localStorage`, so a refresh reclaims the lobby), and shows the public view at `/host/<CODE>`: code, join address, players, and later the timer, scores and emotes.
- The screen **can't act**. The shell rejects anything it sends with `FORBIDDEN`.
- **Every control belongs to the game master**, a player on their phone: settings, kick, rename, Cavan, handing off GM, starting the game, running turns, vetting Cavan's phrases, and Play again.
- The first player to join becomes GM. If the GM goes inactive, the role passes to the earliest-joined active player. The role doesn't snap back when they return (Q2).
- One host screen at a time: a reconnecting screen gets the current state and replaces the old one (`bye: replaced`).

**Why:** that's how the user wants it to work, and how the games it's modelled on work. One person runs the game from their phone while everyone watches the big screen.

**Consequences:**

- `LobbyState.roles` is now `{ gamemasterId: PlayerId | null, cavanId }`. It's `null` only before anyone joins.
- `hostId` is gone, and `screenToken` was added. This bumps `SCHEMA_VERSION` and `PROTOCOL_VERSION` to 3.
- New messages: `create {}` (no name) and `screen { token }`. `joined` now has `as: "player" | "screen"`.
- `PlayerView.isHost` is gone.
- Q7 (what the TV screen is) is answered: it's the host.

### D19: Fast client reconnects

**Status:** Accepted · 2026-10-26

**Decision:** the client overrides partysocket's reconnect backoff: first retry after 250 ms, ×1.5 growth, capped at 4 s. The library defaults were 3 s, ×1.3 and 10 s. The values are `RECONNECT_MIN_DELAY_MS` and `RECONNECT_MAX_DELAY_MS` in `constants.ts`.

**Why:** the defaults suit public websites with thousands of clients. Here a lobby has at most about 40, usually on the same Wi-Fi, and a phone that wakes or switches networks should be back almost instantly.

**Consequences:**

- A dropped socket is retried within about 250 ms.
- **Known issue:** in Firefox, _reloading_ a page (TV or phone) still takes about 4 s to reconnect. Fresh loads are fast. Tracing showed the new page's first attempt being abandoned while the old page's socket closes, followed by a later retry. It's client-side; the server answers in under 10 ms once the socket opens. Not fixed yet.

### D20: The host screen shows a LAN address, not `localhost`

**Status:** Accepted · 2026-10-26

**Decision:**

- When the host screen was opened via a loopback address (`localhost`, `127.0.0.1`, `[::1]`), it fetches `GET /api/lan-address`. That dev-only route handler lists this machine's private IPv4 addresses, with Wi-Fi interfaces first (`wl*`, `wifi*`, macOS `en0`).
- The screen shows "Join on your phone at <first>:<port>", plus "Not working? Try <others>" when the machine has more than one address.
- Opened any other way (a LAN IP, or a deployed domain), the screen just shows its own URL's host.

**Why:**

- Running the TV on the dev machine itself via `localhost` is the natural setup, but phones can't reach `localhost`.
- A browser can't discover its own LAN IP, so the server has to tell it.
- With several interfaces (e.g. ethernet `10.42.0.1` and Wi-Fi `10.0.0.247`), the phones are almost always on Wi-Fi.

**Consequences:**

- The route returns 404 unless `NODE_ENV === "development"`, so a deployed app never reveals anything about its host machine.
- It calls `connection()` so it's never prerendered with the build machine's IPs.
- The interface-name heuristic can pick the wrong one on unusual setups; that's what the alternatives line is for.

---

## 4. What is implemented today

✅ **Slice 1: the lobby phase, end to end** (2026-10-26). It covers:

- creating a lobby, and joining by code and name
- a live player list with connection status
- a host screen (TV) that creates the lobby and shows the code and players (D18)
- game master controls on the GM's phone: settings, kick, rename, hand off GM, Cavan
- rejoin by token or by name
- disconnect detection and role handoff
- lobby expiry

Everything after the lobby (teams, writing, turns, results) is 🚧.

### `packages/game` (`@tmn/game`)

| File            | What's in it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`  | Every tunable: protocol and schema versions (both 2), limits, heartbeat and presence timings, expiry and rate limits ([§6.6](#66-resource-limits)). Also `ROUNDS` and `ROUND_RULES`, the per-round clue rules shown on round intros.                                                                                                                                                                                                                                                                                            |
| `code.ts`       | `normalizeCode`, `isValidCode`, `randomCode`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `names.ts`      | `cleanName` (NFC; strips control and format characters such as zero-width spaces and bidi overrides; collapses whitespace), `nameKey` (case-insensitive identity) and `validateName`.                                                                                                                                                                                                                                                                                                                                           |
| `config.ts`     | `ConfigSchema` (zod, ranges from `CONFIG_RANGES`) and `DEFAULT_CONFIG` (60 s turns, 2 teams, 3 phrases each, up to 3 words per phrase, 20 players; no moderation field, D16).                                                                                                                                                                                                                                                                                                                                                   |
| `types.ts`      | `LobbyState` v1: code, phase, config, players, roles, timestamps. Later slices add fields with a `SCHEMA_VERSION` bump.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `protocol.ts`   | `ClientMessage` zod union (`create`, `screen`, `join`, `updateConfig`, `kick`, `rename`, `setGamemaster`, `setCavan`), using strict objects and bounded strings. Also `ServerMessage` and `ErrorCode`.                                                                                                                                                                                                                                                                                                                          |
| `reducer.ts`    | `createLobby` and `reduce(state, action, { actorId, now, newId })`, which return `{ ok, state, effects }` or `{ ok: false, code, message }`. Implements the join rules ([§5.6](#56-presence-disconnects--rejoin)), host actions, `_presence`, `_touch`, and `normalizeRoles` (the first player becomes GM; GM handoff), which runs after every action. Only the GM may act (D18). Effects tell the shell to bind a player socket (`bound`), bind the host screen (`screenBound`) or close a kicked player's sockets (`kicked`). |
| `invariants.ts` | `checkInvariants(state)`: names are valid and unique, roles point at real players, there's a GM as soon as anyone has joined and they're active whenever anyone is, no player shares the screen token, config is in range, and so on.                                                                                                                                                                                                                                                                                           |
| `view.ts`       | `viewFor(state, viewer)`. It copies fields one by one, so tokens can't leak.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Tests (41, Vitest):**

- unit tests for every action and permission, all the join and rejoin paths, role handoff and expiry
- view leak tests
- a fast-check property test that throws 300 random sequences of valid and garbage messages at the reducer. It asserts the reducer never throws, never mutates its input (inputs are deep-frozen) and never breaks an invariant. It also asserts every action type succeeded at least once, so it can't pass vacuously.

### `apps/party` (`@tmn/party`)

[`src/lobby.ts`](../apps/party/src/lobby.ts) is the shell ([§5.2](#52-reducer--server-shell)):

- **`onStart`** loads persisted state, discarding it if `schemaVersion` doesn't match, and registers the `ping` → `pong` auto-response.
- **`onConnect`** answers a wrong `?v=` with `reload` and caps connections at `MAX_CONNECTIONS`.
- **`onMessage`** runs the boundary checks in order (text only, byte size, token-bucket rate limit, JSON, zod), then `create` or the reducer. The actor always comes from the socket's attachment.
- **`commit`** stops at errors, no-ops, invariant violations and failed storage writes. Otherwise it:
  1. persists the new state
  2. applies effects: binds the socket and sends `joined`; closes older sockets for the same player with `bye: replaced`; closes kicked players' sockets with `bye: kicked`
  3. reschedules the alarm
  4. pushes `viewFor` to every bound socket
- **`onAlarm`** runs the presence sweep (D15). When `expiresAt` has passed and nobody is active, it expires the lobby (`bye: expired`, then `deleteAll`); if someone is still active, it extends the expiry instead.

[`scripts/e2e-lobby.mjs`](../apps/party/scripts/e2e-lobby.mjs) runs 25 checks over real WebSockets with `pnpm --filter @tmn/party e2e` (it needs `pnpm dev` running). It covers:

- the version gate, create and join
- `CODE_TAKEN`, `LOBBY_NOT_FOUND` and `NAME_TAKEN`
- malformed, unknown and oversized messages
- authorization and config validation
- rate limiting and token takeover
- a silent client going inactive and then rejoining by name
- kick

`src/index.ts`, `wrangler.jsonc` and `worker-configuration.d.ts` are as before. In dev the worker listens on `0.0.0.0:8787` (D12).

### `apps/web` (`@tmn/web`)

- **`/`** has two forms:
  - `join-form.tsx`: enter a code and go to `/play/CODE`
  - `host-button.tsx`: "Host a new game" saves a screen session with `creating: true` under a random code and goes to `/host/CODE` (D14, D18)
- **`/host/[code]`**: `host-screen.tsx` is the TV view. It shows a big code, a "Join on your phone at <address>" line (a LAN address when opened via `localhost`, with alternatives; D20), a player grid (GM and Cavan tags, offline players dimmed), a settings summary and who the GM is. It also handles "hosted on another screen" and closed lobbies.
- **`/play/[code]`**: `page.tsx` reads params inside Suspense (D4) and renders `game.tsx`, which shows:
  - status screens: connecting, the name prompt (with a small, muted "Rejoining? Use the same name as before" hint under the button), lobby not found, kicked, expired, replaced
  - a reconnecting banner and an error toast
  - `lobby-screen.tsx`: the code, the player list (a green or grey dot plus a dimmed name and an "offline" label, so status doesn't rely on colour alone; role badges; a note when someone is Cavan; the GM's ⋯ menu to hand off game master, make or unmake Cavan, rename, kick) and settings (dropdowns for the GM, read-only for everyone else)
- **`lib/use-lobby.ts`** wraps `usePartySocket` with `?v=PROTOCOL_VERSION`.
  - On every (re)connect it sends `create` or `join` from the saved session.
  - It handles `joined` (stores the token), `state`, `error` (join errors go to the name form), `bye` (stops reconnecting) and `reload`.
  - It sends `ping` every 5 s and forces a reconnect if pongs stop.
- **`lib/session.ts`** keeps a per-lobby `{ name, token, creating }` in `localStorage`, with every access guarded.
- **`lib/party-host.ts`** picks the worker host (D12).
- **`app/api/lan-address/route.ts`** is a dev-only `GET` returning this machine's private IPv4s, Wi-Fi first, for the host screen (D20). It returns 404 in production.
- **`globals.css`** defines the shared `field`, `btn-primary` and `btn-secondary` classes as Tailwind v4 `@utility` blocks. Plain rules inside `@layer components` were silently dropped by the v4 pipeline.
- **Not offered in the UI yet:** the profanity filter. It's stored in config but not enforced until the writing slice.

### Repo

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main` and on PRs: frozen install, lint, typecheck, test, web build.
- [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md) and [`docs/CHANGELOG.md`](./CHANGELOG.md).

## 5. Lobby server design

> Parts marked ✅ are built (slice 1, see [§4](#4-what-is-implemented-today)); everything else is 🚧, the agreed design. Build against it, and update it if reality forces a change ([§0](#0-working-on-this-project)).

### 5.1 State & persistence

**One object per lobby.**

- All state for a lobby is a single `LobbyState` value inside its `Lobby` Durable Object.
- Lobbies hold tens of players and hundreds of phrases, so storing state as one blob (`ctx.storage.put("state", state)`) is simpler than tables and plenty fast.

**Load and save.**

- `onStart()` loads the state.
- Every accepted transition is persisted **before** it is broadcast.
- The stored blob carries a `schemaVersion` ([§6.5](#65-state-integrity)).

**`LobbyState`.** ✅ marks fields in schema v1. The rest is the target shape for later slices:

```ts
type LobbyState = {
  schemaVersion: number; // ✅
  code: string; // ✅
  // ✅ (only "lobby" is reachable so far)
  phase:
    | "lobby"
    | "teams"
    | "writing"
    | "roundIntro"
    | "turnReady"
    | "turnActive"
    | "turnReview"
    | "results";
  // ✅ roundLengthSec, teamCount, maxPlayers, phrasesPerPlayer, maxWordsPerPhrase, profanityFilter (no moderation field: D16)
  config: Config;
  // ✅ No lastSeenAt: presence lives in the shell (D15).
  players: Record<
    PlayerId,
    {
      id;
      name;
      token;
      teamId;
      status: "active" | "inactive";
      waiting;
      joinedAt;
    }
  >;
  roles: { gamemasterId: PlayerId | null; cavanId: PlayerId | null }; // ✅ GM is null only before anyone joins (D18)
  screenToken: string; // ✅ lets the host screen reconnect; never sent to clients
  createdAt: number; // ✅
  expiresAt: number; // ✅

  // 🚧 Later slices.
  teams: Record<
    TeamId,
    { name: string; captainId: PlayerId | null; memberIds: PlayerId[] }
  >;
  teamOrder: TeamId[]; // rotation: team A, B, …
  nextTeam: number; // index into teamOrder for the next turn
  nextMember: Record<TeamId, number>; // next player index within each team (D13)
  phrases: Record<
    PhraseId,
    {
      authorId: PlayerId;
      text: string;
      status: "pending" | "approved" | "rejected";
    }
  >;
  round: 1 | 2 | 3;
  pile: PhraseId[]; // approved phrases not yet guessed this round
  turn: {
    playerId: PlayerId;
    teamId: TeamId;
    seen: PhraseId[]; // in the order shown (D13)
    cursor: number; // seen[0…cursor) currently count as guessed
    maxCursor: number; // furthest cursor reached while the timer ran
    endsAt: number | null; // null while paused or in review
    remainingMs: number;
    endedBy: "timer" | "pile" | "gm" | null; // null while live (D17)
  } | null;
  prevTurn: unknown; // snapshot from before the last proceed, for restartPrevTurn
  acknowledged: PlayerId[]; // round-intro acknowledgements
  scores: Record<TeamId, number>;
};
```

### 5.2 Reducer & server shell

**Rules are a pure reducer.** `reduce(state, action, { actorId, now, rng })` lives in `packages/game` and returns either `{ state }` or `{ error }`.

- It never mutates its input and never throws on bad input.
- `now` and `rng` are injected, so timers, shuffles and the team wheel are deterministic in tests.
- The server picks every random result (wheel spins, shuffles); clients only animate to it.

**The Durable Object is a thin shell.** For each message it:

1. size-checks and parses it
2. validates it with zod
3. runs the reducer
4. checks invariants
5. persists
6. pushes per-player views

Server-originated actions (`timeout`, `presenceSweep`) go through the same reducer.

### 5.3 Per-player views (secrecy)

After each change the server sends every connection `viewFor(state, playerId)` rather than the raw state.

| Viewer                             | What their view includes                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Active player, during `turnActive` | the current phrase                                                      |
| Game master, when someone is Cavan | the moderation queue (Cavan's pending phrases)                          |
| Game master, after `reveal()`      | the active player's phrases                                             |
| Each author (including Cavan)      | their own phrases and each one's status (pending / approved / rejected) |
| Everyone                           | names, teams, statuses, scores, phase, timer, counts only for phrases   |

Tokens never appear in any view. Emotes are broadcast without touching state.

### 5.4 Actions & permissions

The reducer enforces this table, and rejects anything not listed. ✅ marks actions that are built.

| Action                                         | Who                                | Phase                      | Notes                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ `create {}`                                 | the host screen                    | before the lobby exists    | Creates an empty lobby; the screen gets a token (D14, D18). `CODE_TAKEN` if the lobby exists                                                                                                                                                                                                                    |
| ✅ `screen { token }`                          | the host screen                    | any                        | Reconnects the screen; `FORBIDDEN` with the wrong token. Replaces any older screen                                                                                                                                                                                                                              |
| ✅ `join { name, token? }`                     | unjoined socket                    | any                        | Rules in [§5.6](#56-presence-disconnects--rejoin). `LOBBY_NOT_FOUND` before `create`                                                                                                                                                                                                                            |
| ✅ `updateConfig { config }`                   | game master                        | `lobby`                    | Partial. Out-of-range values are rejected; `maxPlayers` can't drop below the current player count                                                                                                                                                                                                               |
| ✅ `kick { playerId }`                         | game master                        | any                        | Not yourself. Removes the player and closes their sockets; Cavan is cleared if it was them (the GM can't kick themselves). Mid-turn, their turn ends 🚧                                                                                                                                                         |
| ✅ `rename { playerId, name }`                 | game master                        | any                        | Must stay unique (changing only the casing of your own name is fine)                                                                                                                                                                                                                                            |
| ✅ `setCavan { playerId \| null }`             | game master                        | `lobby`–`writing`          | 🚧 Phrases Cavan already submitted with no review become `pending`                                                                                                                                                                                                                                              |
| ✅ `setGamemaster { playerId }`                | game master                        | any                        | Target must be active                                                                                                                                                                                                                                                                                           |
| `startTeams`                                   | game master                        | `lobby`                    | At least 2 active players                                                                                                                                                                                                                                                                                       |
| `nameTeam`, `addToTeam`, `removeFromTeam`      | game master or that team's captain | `teams`                    | `addToTeam { playerId \| "random" }`: random is chosen by the server and shown as a wheel spin                                                                                                                                                                                                                  |
| `confirmTeams`                                 | game master                        | `teams`                    | Every active, non-waiting player is on a team, and every team has at least 1 player                                                                                                                                                                                                                             |
| `assignWaiting { playerId, teamId }`           | game master                        | after `teams`              | Moves a late joiner out of the waiting room into a team's rotation                                                                                                                                                                                                                                              |
| `submitPhrase { text }`                        | player on a team                   | `writing`                  | Validated ([§6.4](#64-domain-validation)).`pending` if the author is Cavan, otherwise `approved` (D16)                                                                                                                                                                                                          |
| `deletePhrase { phraseId }`                    | author                             | `writing`                  | Own phrases only                                                                                                                                                                                                                                                                                                |
| `approvePhrase`, `rejectPhrase`                | game master                        | `writing`                  | `pending` phrases only. Rejected phrases don't count toward the quota; the author writes a replacement                                                                                                                                                                                                          |
| `startGame`                                    | game master                        | `writing`                  | Every **active** player has their quota of approved phrases and nothing is pending → round 1 `roundIntro`                                                                                                                                                                                                       |
| `acknowledge`                                  | any active player                  | `roundIntro`               | When every active player has acknowledged → `turnReady`                                                                                                                                                                                                                                                         |
| `startTurn`                                    | game master                        | `turnReady`                | Countdown on the active player's device, then `turnActive`                                                                                                                                                                                                                                                      |
| `next`                                         | active player                      | `turnActive`               | `cursor + 1`; draws a new phrase when at the end of `seen` (D13). Guessing the last phrase in the pile freezes the timer → `turnReview`, `endedBy: "pile"` (D17)                                                                                                                                                |
| `back`                                         | active player                      | `turnActive`, `turnReview` | `cursor − 1`, never below 0: the point comes off and the previous phrase shows again                                                                                                                                                                                                                            |
| `forward`                                      | active player                      | `turnReview`               | `cursor + 1`, up to `maxCursor`. Redo only; no new phrases                                                                                                                                                                                                                                                      |
| `pauseTimer`, `resumeTimer`                    | game master                        | `turnActive`               |                                                                                                                                                                                                                                                                                                                 |
| `addTime { ms }`                               | game master                        | `turnActive`, paused only  | Positive or negative; remaining time clamped                                                                                                                                                                                                                                                                    |
| `endTurn`                                      | game master                        | `turnActive`               | → `turnReview`                                                                                                                                                                                                                                                                                                  |
| `proceed`                                      | game master                        | `turnReview`               | Adds `cursor` to the team's score and removes `seen[0…cursor)` from the pile. `endedBy: "pile"` keeps the same player and the time left (D17): next round's `roundIntro` if the pile is empty (`results` after round 3), else `turnReady` in the same round. Otherwise → `turnReady` for the next team's player |
| `restartPrevTurn { ms }`                       | game master                        | `turnReady`                | Undoes the last `proceed` from its snapshot; same player, chosen time                                                                                                                                                                                                                                           |
| `reveal`                                       | game master                        | `turnActive`               | Shows the GM the active player's phrases                                                                                                                                                                                                                                                                        |
| `emote { kind }`                               | anyone                             | any                        | Broadcast only; rate-limited                                                                                                                                                                                                                                                                                    |
| `playAgain`                                    | game master                        | `results`                  | [§5.7](#57-play-again)                                                                                                                                                                                                                                                                                          |
| ✅ `_presence { active, inactive }` _(server)_ | shell sweep                        | any                        | Status transitions only (D15)                                                                                                                                                                                                                                                                                   |
| ✅ `_touch` _(server)_                         | shell alarm                        | any                        | Extends `expiresAt` while someone is still active                                                                                                                                                                                                                                                               |
| `timeout` _(server)_                           | alarm                              | `turnActive`               | Timer reached zero → `turnReview`                                                                                                                                                                                                                                                                               |

Every accepted action except `_presence` pushes `expiresAt` to now + 2 h.

**Moderation:** only Cavan's phrases need GM approval, and always do while someone is Cavan (D16).

### 5.5 Timers & the alarm

**The server owns the clock.**

- While a turn runs, `turn.endsAt` is an epoch-ms timestamp. While paused it is `null`, and `remainingMs` holds the time left.
- Clients render the countdown from `endsAt`, correcting their clock with the server `now` included in every message.

**One alarm, three jobs.** A Durable Object has a single alarm. It is always set to the earliest of:

- 🚧 `turn.endsAt`, which triggers `timeout` and puts the turn into review. Proceeding is always the GM's call. When the pile runs out first, `endsAt` is cleared and the time left is kept in `remainingMs` (D17).
- ✅ the next presence sweep (every `PRESENCE_SWEEP_MS`, while any player is active or any bound socket is open)
- ✅ `expiresAt`, which closes all sockets and runs `ctx.storage.deleteAll()` (or `_touch`es if someone is still active)

`expiresAt` is either last activity + 2 h, or entering `results` + 15 min. That expiry is what makes the "ephemeral" requirement true without a cleanup job.

### 5.6 Presence, disconnects & rejoin

**Detecting a dead connection** (D8, D15) ✅.

- **Client:** sends `"ping"` every `HEARTBEAT_INTERVAL_MS` (5 s). The server auto-responds `"pong"` without waking. If two pongs in a row go missing, the client forces a reconnect.
- **Server:** every 5 s the sweep takes, per player, the newest of their sockets' last auto-responded ping, connect time and last message.
- A player becomes **inactive** when that's older than `INACTIVE_AFTER_MS` (20 s). Their remaining sockets are closed, so a phone that was only asleep reconnects and rejoins by token.
- A player with an open, pinging socket is never inactive. A quick refresh reconnects well inside the window and never shows as inactive.

**What being inactive does:**

- **Turn rotation skips them.** When an inactive player's turn comes up, the next active player _on the same team_ goes instead, so the team doesn't lose its turn. If the team has nobody active, the team is skipped. ❓ See [§9](#9-open-questions).
- **If the active player drops mid-turn:**
  1. The timer **auto-pauses** as soon as their last socket closes or goes stale.
  2. If they're back before going inactive, the GM resumes.
  3. If they go inactive, the turn ends as if `endTurn` and goes to review. The GM proceeds: phrases already guessed count, and the rest return to the pile.
  4. If it was a false alarm, the GM can still `restartPrevTurn`.
- ✅ **No stuck roles.**
  - If the **game master** goes inactive, GM passes to the earliest-joined active player (D18). The host screen going away changes nothing; it can reopen `/host/<CODE>` in the same browser.
  - If a **team captain** goes inactive, the next active team member becomes captain.
- Inactive players don't block `acknowledge` or `startGame`; only active players count.

**Rejoining** (D7) ✅. On `join { name, token? }` the server checks, in order:

1. **The token matches a player:** bind this socket to that player and close any older sockets for them (newest wins). Status becomes active. This covers refreshes, network switches and duplicate tabs.
2. **`nameKey(name)` matches an inactive player:** bind to that player, mark them active, and issue a new token. They keep team, phrases, score and roles (unless a role was handed off while they were away). This covers a dead phone or a new device.
3. **`nameKey(name)` matches an active player:** reject with `NAME_TAKEN`.
4. **Otherwise**, create a new player:
   - in `lobby`, they join normally
   - in any later phase, they go to the **waiting room** (`waiting: true`) until the game master assigns a team
   - `maxPlayers` is enforced

`nameKey(name)` trims the name, collapses inner whitespace, applies Unicode NFC normalization, and lowercases it. The display name keeps the player's casing.

### 5.7 Play again

`playAgain` (game master, `results` phase) changes state as follows (D9, D18):

| Kept                                                                                                           | Cleared                                                                                | Removed                                                                                |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Lobby code, every open socket, active players, roles, config, teams (as the starting point for team selection) | Phrases, pile, scores, round, turn order and index, turn, `prevTurn`, acknowledgements | Inactive players. They can still rejoin by name, because the lobby phase accepts joins |

Waiting-room players become normal lobby players. `expiresAt` is refreshed and the phase becomes `lobby`. Because the state is pushed to every connection, every screen moves to the lobby at once.

**UI:** the GM's phone shows **Play again**; other phones and the host screen show "Waiting for <GM> to play again…".

### 5.8 Protocol

✅ The types live in [`packages/game/src/protocol.ts`](../packages/game/src/protocol.ts).

**Client → server.**

- The connect URL is `/parties/lobby/<CODE>?v=<PROTOCOL_VERSION>`.
- After that, the client sends the raw text frame `"ping"` every 5 s, which gets an auto-responded `"pong"`.
- Every other message is JSON `{ type, ...payload }`:
  - the host screen sends `create` or `screen { token }` and then nothing else
  - a phone sends `join` first, then (as GM) the actions in [§5.4](#54-actions--permissions)

**Server → client:**

- `{ type: "joined", as: "player", playerId, token }` or `{ type: "joined", as: "screen", token }`: this socket is now that player, or the host screen. The client stores the token.
- `{ type: "state", view, now }`: the viewer's `viewFor` after every change. The host screen gets the public view, `viewFor(state, null)`.
- `{ type: "error", code, message }`, sent only to the offending socket. The `message` is written to be shown to players.
- `{ type: "bye", reason: "kicked" | "replaced" | "expired" }`, sent just before the server closes the socket on purpose. The client stops reconnecting.
- `{ type: "reload" }`: protocol version mismatch ([§6.8](#68-deploys--version-skew)).

**Error codes:** `BAD_MESSAGE`, `NOT_JOINED`, `FORBIDDEN`, `WRONG_PHASE`, `INVALID`, `NAME_TAKEN`, `LOBBY_FULL`, `LOBBY_NOT_FOUND`, `CODE_TAKEN`, `RATE_LIMITED`, `INTERNAL`.

**Close codes:** 4000 reload, 4001 kicked, 4002 expired, 4003 replaced or inactive, 1008 rate-limit abuse, 1013 too many connections.

### 5.9 Libraries planned

- ✅ `zod` for message schemas
- `obscenity` for the profanity filter, which works in both Workers and the browser
- `motion` and `canvas-confetti` for the wheel and celebrations
- ✅ `fast-check` for property tests ([§8](#8-testing--verification))

---

## 6. Security, validation & robustness

**Threat model.**

- Nothing sensitive is stored: no accounts, no personal data, and everything is deleted when the lobby expires.
- The goal is not secrecy, it's that **nothing breaks**. A buggy client, an outdated client, a flaky network, or a friend poking at the WebSocket must never:
  - crash a lobby
  - corrupt its state
  - get it stuck
  - reveal hidden phrases

D10 is the governing decision. Each subsection below is a defensive layer.

### 6.1 Transport

- Production uses `https://` and `wss://` only. `partysocket` picks `wss://` for any non-local host.
- Lobby creation is a WebSocket message like everything else (D14), so there's no HTTP endpoint and no CORS surface.
- The only HTTP endpoint, `/api/lan-address`, exists only in development (D20).

### 6.2 Message boundary

Applies to every inbound frame, in this order:

1. **Size:** frames over `MAX_MESSAGE_BYTES` are rejected **before** parsing.
2. **Heartbeat:** the literal `"ping"` is answered by auto-response and never reaches code.
3. **Parse:** `JSON.parse` inside `try`; failure → `BAD_MESSAGE`.
4. **Schema:** a zod discriminated union of all client actions, with strict objects so unknown keys are rejected. Strings are length-bounded and numbers are range-bounded in the schema itself.
5. **Rate limit:** a per-connection token bucket. Excess messages are dropped with `RATE_LIMITED`; sustained abuse closes the socket with code `1008`.

A rejected message never changes state, and the error reply goes only to the sender.

### 6.3 Authorization

- The reducer checks the **actor's role** and the **current phase** for every action ([§5.4](#54-actions--permissions)).
- The actor is always the player bound to the socket on the server, **never** an id taken from the message body.
- A socket that hasn't joined can only send `join`, `create` or `screen` (and `ping`).
- The host screen's socket can't send anything but `ping` (D18). A player socket can't send `create` or `screen`.

### 6.4 Domain validation

These checks live in `packages/game`, so the client can run them for instant feedback; the server's result is final.

- **Names:** ✅ after `cleanName`, 1–`NAME_MAX_LEN` code points, unique in the lobby by `nameKey`, with control and format characters stripped. 🚧 Profanity-checked if the config says so.
- **Phrases:** trimmed, 1–`PHRASE_MAX_LEN` characters, word count ≤ `maxWordsPerPhrase`, profanity-checked if configured, no duplicates within the lobby (case-insensitive), and the author must be within their quota.
- **Config:** ✅ any field outside the ranges in [§6.6](#66-resource-limits) is rejected: by the schema at the boundary, and again when the reducer merges the update.
- **Ids:** must refer to existing players, teams or phrases. Unknown ids → `INVALID`.

### 6.5 State integrity

- **Server-authoritative.** Clients send intents (`next`, `addTime { ms }`), never results. Scores, timers, turn order, random picks and the phrase pile are computed only on the server.
- **Atomic transitions.** The reducer is pure and returns a new state. If it returns an error or throws, the error is caught and logged, the sender gets `INTERNAL`, and **the previous state is kept**.
- **Invariants.** `checkInvariants(state)` runs after every transition, in production as well as tests, because it's cheap. A violation rejects the transition. Examples:
  - `roles.*` point at existing players
  - there's a game master as soon as anyone has joined, and they're active whenever any player is
  - every `teamId` exists, and every team member's `teamId` matches
  - `pile` ⊆ approved phrases
  - `turn.playerId` exists and is on a team
  - `remainingMs` is within bounds
  - `phase`-specific fields are present
- **Persist before broadcast.** If `ctx.storage.put` fails, the in-memory state reverts and nothing is broadcast.
- **Schema version.** If a stored blob's `schemaVersion` doesn't match the code, the lobby is reset rather than loaded half-understood. That's acceptable, because lobbies are ephemeral.
- **Single-threaded, but async-aware.** Don't `await` external I/O between reading state and writing it back. Durable Object input gates protect storage awaits.

### 6.6 Resource limits

Defined in [`constants.ts`](../packages/game/src/constants.ts) and [`config.ts`](../packages/game/src/config.ts); tune freely. If you change one, update this table.

| Limit                                               | Default                              |
| --------------------------------------------------- | ------------------------------------ |
| `MAX_MESSAGE_BYTES`                                 | 4 KB                                 |
| `NAME_MAX_LEN`                                      | 20 characters                        |
| `PHRASE_MAX_LEN`                                    | 80 characters                        |
| `maxWordsPerPhrase`                                 | config 1–10                          |
| `phrasesPerPlayer`                                  | config 1–10                          |
| `maxPlayers`                                        | config 2–40 (hard cap 40)            |
| `teamCount`                                         | config 2–8                           |
| `roundLengthSec`                                    | config 15–180                        |
| Connections per lobby                               | 60 (players + TVs + duplicate tabs)  |
| `addTime`                                           | ±60 s per action; remaining 0–10 min |
| Rate limit                                          | 10 msg/s, burst 20; emotes 2/s       |
| `HEARTBEAT_INTERVAL_MS`                             | 5 000                                |
| `INACTIVE_AFTER_MS`                                 | 20 000                               |
| `RECONNECT_MIN_DELAY_MS` / `RECONNECT_MAX_DELAY_MS` | 250 / 4 000 (×1.5 growth, D19)       |
| `PRESENCE_SWEEP_MS`                                 | 5 000                                |
| Idle expiry / after results                         | 2 h / 15 min                         |

### 6.7 Output safety

- The server only ever sends `viewFor(...)` output ([§5.3](#53-per-player-views-secrecy)). Tests assert that no view contains tokens, or phrases the viewer shouldn't see.
- React escapes all rendered text. **Never use `dangerouslySetInnerHTML`** for player-provided content (names, phrases, team names).

### 6.8 Deploys & version skew

Web (Vercel) and party (Cloudflare) deploy independently, so an old browser tab can talk to a new Worker and the reverse.

- `PROTOCOL_VERSION` lives in `packages/game` and is sent on connect (`?v=`). On a mismatch, the server replies `{ type: "reload" }` and the client reloads the page.
- **Bump `PROTOCOL_VERSION` on any breaking message or view change.** Prefer additive changes.
- Deploy **party first**, then web, for additive changes.
- Durable Object class changes need a new `migrations` entry in `wrangler.jsonc`. Never edit an existing one.
- A Worker deploy drops sockets. `partysocket` reconnects, and the state is reloaded from storage.

### 6.9 Accepted risks & non-goals

| Risk                                                  | Why it's accepted                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Anyone with the code can join                         | That's how party games work. Codes aren't listed anywhere, and late joiners land in the waiting room |
| Typing an inactive player's name takes them over (D7) | Required for rejoin-by-name. Nothing is at stake, and the GM can kick or rename                      |
| Session tokens are convenience, not authentication    | They only shortcut reconnects                                                                        |
| The GM sees Cavan's phrases                           | By design: the GM vets them (D16)                                                                    |
| Backdoors (prank rewrite, reveal-all)                 | Intentional game features. When built, they must still be server-side actions with role checks       |
| Phrases aren't encrypted in storage                   | Deleted at expiry; nothing sensitive                                                                 |

**Not doing:** accounts, auth, encryption at rest, anti-cheat beyond hiding phrases, audit logs.

### 6.10 Failure modes

| Scenario                                   | Expected behavior                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Phone dies mid-turn                        | Timer auto-pauses; after `INACTIVE_AFTER_MS` the turn ends and the next player is up; they can rejoin by name         |
| Page refresh / Wi-Fi ↔ cellular            | Token rebind; nobody notices                                                                                          |
| Same player open in two tabs               | Newest socket wins; the older one is closed with a "replaced" notice                                                  |
| GM leaves                                  | GM passes to the earliest-joined active player (§5.6)                                                                 |
| Host screen closes or reloads              | The game carries on; reopening `/host/<CODE>` in the same browser reclaims it (about 4 s on a reload in Firefox, D19) |
| Everyone leaves                            | Lobby expires; storage deleted                                                                                        |
| Worker redeploy or Durable Object eviction | Clients reconnect; state reloaded from storage                                                                        |
| Malformed, oversized or unknown message    | Error reply to the sender; state unchanged                                                                            |
| Client clock is wrong                      | Countdown uses the server's `now` offset                                                                              |
| Reducer bug throws or breaks an invariant  | Transition rejected, previous state kept, error logged                                                                |
| Stale client after a deploy                | `reload` on protocol mismatch                                                                                         |

---

## 7. Configuration reference

**Versions** (latest stable as of 2026-10-25; see D6):

| Package                              | Version       |
| ------------------------------------ | ------------- |
| next                                 | 16.4.3        |
| react / react-dom                    | 19.3.1        |
| tailwindcss / @tailwindcss/turbopack | 4.3.3         |
| typescript                           | 7.0.2         |
| @biomejs/biome                       | 2.6.3         |
| vitest                               | 5.0.5         |
| wrangler                             | 4.152.0       |
| partyserver                          | 0.5.10        |
| partysocket                          | 1.3.0         |
| @cloudflare/workers-types            | 5.20261025.1  |
| @types/node                          | 24.19.2       |
| zod                                  | 4.6.7         |
| fast-check                           | 4.10.2        |
| Node / pnpm                          | 24.18 / 11.24 |

**Config files:**

| File                        | What it does                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)       | Workspace scripts. `dev` runs every package's `dev` in parallel (Next :3000 + Wrangler :8787). `build`, `test`, and `typecheck` fan out with `pnpm -r`. `lint` and `format` run Biome once over the whole repo.                                       |
| `pnpm-workspace.yaml`       | Workspace globs (`apps/*`, `packages/*`) and `allowBuilds` (see D6).                                                                                                                                                                                  |
| `tsconfig.base.json`        | Shared strict settings: `ES2022`, `moduleResolution: bundler`, `noUncheckedIndexedAccess` (catches unchecked map/array lookups in game state), and `verbatimModuleSyntax` (forces explicit `import type`). Each package's `tsconfig.json` extends it. |
| `biome.json`                | Lint and format for the whole repo. Skips `node_modules`, `.next`, `.wrangler`, `dist`, generated `worker-configuration.d.ts`, and anything in `.gitignore`.                                                                                          |
| `.gitignore`                | Unanchored patterns so they apply in every package. Also ignores `.wrangler/` (local Durable Object state) and `.dev.vars*`. Ignores `.env*` except `.env.example`.                                                                                   |
| `apps/web/next.config.ts`   | The create-next-app defaults (Cache Components, Partial Prefetching, Tailwind Turbopack loader), plus `allowedDevOrigins` for LAN IPs (D12).                                                                                                          |
| `apps/party/wrangler.jsonc` | Worker name, entry point, compatibility date, Durable Object binding and migration, dev address `0.0.0.0:8787` (D12).                                                                                                                                 |
| `AGENTS.md` / `CLAUDE.md`   | Contributor and agent rules (D11).                                                                                                                                                                                                                    |
| `.github/workflows/ci.yml`  | CI on pushes to `main` and on PRs: `pnpm install --frozen-lockfile`, lint, typecheck, test, web build. Actions: checkout v7, pnpm/action-setup v6 (pnpm version from `packageManager`), setup-node v7 (Node 24).                                      |

---

## 8. Testing & verification

**Commands** (run all of them before finishing any change):

| Command                        | What it checks                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                    | Biome over the whole repo                                                                                            |
| `pnpm typecheck`               | `tsc --noEmit` in every package; web runs `next typegen` first so route types like `PageProps<"/play/[code]">` exist |
| `pnpm test`                    | Vitest in `packages/game` (unit + property tests)                                                                    |
| `pnpm --filter @tmn/web build` | Production build, including Next's type check                                                                        |
| `pnpm --filter @tmn/party e2e` | 34 WebSocket checks against a running dev worker (start `pnpm dev` first). Takes ~30 s                               |

**Unit and property tests** (`packages/game`):

- ✅ **Per action:** succeeds for the allowed role and phase, and is rejected with the right code otherwise.
- ✅ **Views:** `viewFor` never leaks tokens, for any viewer. 🚧 Hidden phrases, once phrases exist.
- ✅ **Presence, rejoin and role handoff:** all four join paths, screen create and reconnect, GM handoff, and expiry, using an injected clock.
- ✅ **Property test:** random valid and garbage sequences never throw, never mutate their input, never break invariants, and every action type has really been exercised.
- 🚧 Turn rules (D13, D17), Cavan vetting (D16), teams, play again.

**Manual end-to-end check** ✅:

1. Run `pnpm dev`. On the computer (the "TV"), open `http://localhost:3000` and click **Host a new game**. The screen shows the code and "Waiting for players…".
2. Join the code from a phone or a private window. That player becomes **game master**; the TV shows them with a GM tag.
3. Join from a second device. Both phones and the TV update.
4. Refresh a phone: it rejoins without asking for a name. Refresh the TV: it reclaims the lobby (about 4 s, D19).
5. From the GM's ⋯ menu, rename, make Cavan, change a setting, then kick. The kicked player sees "The game master removed you from the lobby".
6. Close the GM's tab and wait about 20 s: they show as offline, and GM passes to the next player. Rejoin with the same name: they're back as the same player.

This flow was verified with headless Firefox, using a separate storage context per device.

**Testing on phones on the same Wi-Fi:**

1. Run `pnpm dev` and nothing else. It already starts the worker on all interfaces. Starting the worker a second time fails with `Address already in use (0.0.0.0:8787)`.
2. Open `http://<your LAN IP>:3000` on the phone. `pnpm dev` prints a "Network" URL, but that may be a different interface: use the IP of the interface the phone shares, e.g. your Wi-Fi IP from `ip -4 -br addr`.
3. Leave `NEXT_PUBLIC_PARTY_HOST` unset. If it points at an address the worker isn't reachable on, every tab hangs on "connecting…".

If your LAN uses `172.16–31.x` addresses, add them to `allowedDevOrigins` in `next.config.ts`.

---

## 9. Open questions

The design makes an assumption for each of these, so work isn't blocked. Confirm or change them, and record the answer here and in the decision log.

| #   | Question                                                                 | Current assumption / answer                                                                                                 |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Q1  | When an inactive player's turn comes up, does their **team** still play? | Yes: the next active teammate goes; the team is skipped only if nobody on it is active                                      |
| Q2  | Does the original game master get GM back when they rejoin?              | No. GM stays with whoever it passed to; the GM can hand it back with "Make game master" ✅ built this way                   |
| Q3  | How many rounds, and how do they work?                                   | **Answered 2026-10-26:** 3 rounds with the same mechanics and the same full pile each round (§1.2)                          |
| Q4  | When the pile empties mid-turn, what happens to the time left?           | **Answered 2026-10-26:** the timer stops; the same player keeps going into the next round with the time that was left (D17) |
| Q5  | Are kicked players banned from rejoining?                                | No; after the lobby phase they land in the waiting room, so the GM controls it                                              |
| Q6  | How are the backdoors triggered?                                         | Undecided; must be server-side and role-gated                                                                               |
| Q7  | Does the TV screen join as a player or a spectator?                      | **Answered 2026-10-26:** the TV _is_ the host: a non-player screen that runs the game (D18)                                 |
| Q8  | Who starts round 2 and round 3?                                          | **Answered 2026-10-26:** rotation continues; in practice the player who emptied the pile continues first (D17)              |
| Q9  | Do rounds have different clue rules?                                     | **Answered 2026-10-26:** R1 describe without saying any of the words, R2 charades (no talking), R3 one word (§1.2)          |
| Q10 | What does a tie look like at the end?                                    | **Answered 2026-10-26:** a tie is a tie: no tiebreaker, the tied teams are shown as tied                                    |
| Q11 | What if the pile runs out with almost no time left (say under 1 s)?      | Carry over whatever is left, however small; the GM can `addTime` while paused if it feels unfair                            |

## Appendix: decision template

Copy this into [§3](#3-decision-log) with the next free number, and add a matching line to [`CHANGELOG.md`](./CHANGELOG.md).

```md
### D<n>: <short decision title>

**Status:** Proposed | Accepted | Superseded by D<m> · YYYY-MM-DD

**Decision:** What we're doing, in one or two sentences.

**Why:** The forces behind it (requirements, constraints, evidence).

**Alternatives:** What else was considered and why it lost.

**Consequences:** What this makes easier or harder; follow-up work.
```
