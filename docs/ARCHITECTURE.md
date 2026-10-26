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

| Role                 | Who                                                  | Can                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Host**             | The player who created the lobby                     | Configure the lobby, start team selection, kick and rename players, designate Cavan, change the game master, move late joiners from the waiting room onto a team, press **Play again**   |
| **Game master (GM)** | Defaults to the host; the host can hand it to anyone | Run turns (`start_turn`, `end_turn`, `pause_timer`, `add_time` while paused, `restart_prev_turn`, `reveal`), **approve or reject moderated phrases**, start the game once phrases are in |
| **Cavan**            | One player the host designates (optional)            | Nothing extra. Cavan is the **moderated** player, not a moderator: every phrase Cavan submits must be accepted or rejected by the game master before it enters the pile                  |
| **Team captain**     | First player on each team                            | Name their team and add or remove members during team selection                                                                                                                          |
| **Active player**    | Whoever's turn it is                                 | See the current phrase, press `next` (got it) and `back` (undo)                                                                                                                          |
| **Everyone**         | Any player                                           | Send emotes (thumbs up, thumbs down, tomato, …)                                                                                                                                          |

### 1.2 Flow

| Stage          | Phase (§5)                 | What happens                                                                                                                                                                         |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Lobby       | `lobby`                    | Host configures; players join with code + name                                                                                                                                       |
| 0b. Teams      | `teams`                    | Host or captains build teams; "random" spins a wheel of names with confetti                                                                                                          |
| 1. Writing     | `writing`                  | Everyone submits phrases, validated against the config (count, words per phrase, profanity filter). Moderated phrases wait for GM approval. GM starts the game when everything is in |
| 2. Round intro | `roundIntro`               | Every device shows the round's rules; everyone taps acknowledge                                                                                                                      |
| 2. Turns       | `turnReady` ⇄ `turnActive` | Next player in the fixed order is up; GM starts the turn; countdown; active player cycles phrases                                                                                    |
| End            | `results`                  | Scores; host can **Play again**                                                                                                                                                      |

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
                                                           │   + SQLite storage (🚧)    │
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

**Consequence:** anyone who knows an inactive player's name can take them over. This is accepted, because nothing is at stake and the host can kick or rename ([§6.9](#69-accepted-risks--non-goals)). Full rules are in [§5.6](#56-presence-disconnects--rejoin).

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

**Status:** Accepted · 2026-10-26

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

---

## 4. What is implemented today

✅ The scaffold proves the whole pipeline end to end: browser → Next.js page → WebSocket → Durable Object → broadcast → browser. There is no game logic yet.

### `packages/game` (`@tmn/game`)

[`src/index.ts`](../packages/game/src/index.ts):

| Export                 | Purpose                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAME_NAME`            | Display name, used for the page title and heading.                                                                                                                          |
| `PARTY` (`"lobby"`)    | The PartyServer namespace the client connects to. It's the kebab-cased Durable Object binding name (`Lobby` → `lobby`).                                                     |
| `CODE_LENGTH` (`4`)    | Lobby code length.                                                                                                                                                          |
| `normalizeCode(input)` | Uppercases, strips non A–Z, and truncates to `CODE_LENGTH`. Used both for the join form input and for the room name, so `/play/abcd` and `/play/ABCD` reach the same lobby. |
| `ServerMessage`        | Union type of messages the server sends. Currently only `{ type: "count", n }`.                                                                                             |

[`src/index.test.ts`](../packages/game/src/index.test.ts) has unit tests for `normalizeCode`.

### `apps/party` (`@tmn/party`)

- [`src/index.ts`](../apps/party/src/index.ts) is the Worker entry. `routePartykitRequest` maps `/parties/:party/:room` to the matching Durable Object; anything else returns 404. It also re-exports the `Lobby` class, which Wrangler requires.
- [`src/lobby.ts`](../apps/party/src/lobby.ts) defines `class Lobby extends Server<Env>`:
  - `static options = { hibernate: true }` lets Cloudflare evict the object from memory while sockets stay open, which keeps idle lobbies close to free. The catch is that in-memory fields don't survive eviction, which is why the planned design persists state ([§5.1](#51-state--persistence)).
  - `onConnect` and `onClose` broadcast the current connection count.
  - In `onClose`, the closing socket may still be listed by `getConnections()`. So it's skipped by `id` and excluded from the broadcast, which keeps the count right either way.
- [`wrangler.jsonc`](../apps/party/wrangler.jsonc) declares the `Lobby` Durable Object binding. The `v1` migration registers it with `new_sqlite_classes`, which gives it SQLite-backed storage. In dev it listens on `0.0.0.0:8787` so phones on the LAN can reach it (D12).
- [`worker-configuration.d.ts`](../apps/party/worker-configuration.d.ts) is generated by `pnpm --filter @tmn/party types` (`wrangler types --include-runtime=false`). It declares the typed `Env` (with `Env.Lobby`). It's committed so a fresh clone type-checks. **Re-run the command after editing `wrangler.jsonc`.** Runtime types come from `@cloudflare/workers-types`, which is also a peer dependency of `partyserver`.

### `apps/web` (`@tmn/web`)

- [`app/layout.tsx`](../apps/web/app/layout.tsx) is the root layout. It sets the Geist fonts and uses `GAME_NAME` as the title. The template's `font-family: Arial` override was removed from `globals.css` so Geist actually applies.
- [`app/page.tsx`](../apps/web/app/page.tsx) and [`app/join-form.tsx`](../apps/web/app/join-form.tsx) make up the landing page. It's a statically prerendered server component with a small client form. The form normalizes input as you type and navigates to `/play/<CODE>` when it has 4 letters.
- [`app/play/[code]/page.tsx`](../apps/web/app/play/%5Bcode%5D/page.tsx) is a server component that resolves `params` inside `<Suspense>` (see D4).
- [`app/play/[code]/lobby-status.tsx`](../apps/web/app/play/%5Bcode%5D/lobby-status.tsx) is a client component. It calls `usePartySocket({ host, party: PARTY, room })` and shows "connecting…" or "connected · N players". `partysocket` reconnects automatically. It also picks `ws://` for `localhost` and private LAN ranges (10.x, 192.168.x, 172.16–31.x) and `wss://` everywhere else.
- **Party host:** `partyHost()` in `lobby-status.tsx` uses `NEXT_PUBLIC_PARTY_HOST` if it's set (production). Otherwise it uses `<page hostname>:8787`, so the same build works from `localhost` and from a phone hitting your LAN IP without any `.env` (D12). See [`.env.example`](../apps/web/.env.example).
- [`next.config.ts`](../apps/web/next.config.ts) sets `allowedDevOrigins: ["10.*.*.*", "192.168.*.*"]`. Next 16 blocks dev assets for non-localhost origins by default, which leaves pages un-hydrated on phones (stuck on "connecting…").
- [`AGENTS.md`](../apps/web/AGENTS.md) is generated by Next, and `next dev` re-adds it. It points coding agents at the version-matched docs in `node_modules/next/dist/docs/`.

### Repo-level docs

- [`AGENTS.md`](../AGENTS.md) holds the contributor and agent rules; [`CLAUDE.md`](../CLAUDE.md) imports it.
- [`docs/CHANGELOG.md`](./CHANGELOG.md) is the dated change log.

---

## 5. Lobby server design

> 🚧 **Not implemented yet.** This is the agreed design for the lobby server. Build against it, and update it if reality forces a change ([§0](#0-working-on-this-project)).

### 5.1 State & persistence

**One object per lobby.**

- All state for a lobby is a single `LobbyState` value inside its `Lobby` Durable Object.
- Lobbies hold tens of players and hundreds of phrases, so storing state as one blob (`ctx.storage.put("state", state)`) is simpler than tables and plenty fast.

**Load and save.**

- `onStart()` loads the state.
- Every accepted transition is persisted **before** it is broadcast.
- The stored blob carries a `schemaVersion` ([§6.5](#65-state-integrity)).

**`LobbyState` sketch:**

```ts
type LobbyState = {
  schemaVersion: number;
  phase:
    | "lobby"
    | "teams"
    | "writing"
    | "roundIntro"
    | "turnReady"
    | "turnActive"
    | "results";
  config: {
    roundLengthSec: number;
    teamCount: number;
    maxPlayers: number;
    phrasesPerPlayer: number;
    maxWordsPerPhrase: number;
    profanityFilter: "off" | "names" | "phrases" | "both";
    moderation: "off" | "cavan" | "all"; // whose phrases need GM approval
  };
  players: Record<
    PlayerId,
    {
      name: string; // display name; nameKey(name) is unique in the lobby
      token: string; // session token, never sent to other clients
      teamId: TeamId | null;
      status: "active" | "inactive";
      waiting: boolean; // joined after the lobby phase; host must assign a team
      lastSeenAt: number; // epoch ms, from heartbeats and messages
      joinedAt: number;
    }
  >;
  teams: Record<
    TeamId,
    { name: string; captainId: PlayerId | null; memberIds: PlayerId[] }
  >;
  roles: { hostId: PlayerId; gamemasterId: PlayerId; cavanId: PlayerId | null };
  phrases: Record<
    PhraseId,
    {
      authorId: PlayerId;
      text: string;
      status: "pending" | "approved" | "rejected";
    }
  >;
  round: number;
  pile: PhraseId[]; // approved phrases not yet guessed this round
  turnOrder: PlayerId[]; // fixed rotation, alternating teams
  turnIndex: number;
  turn: {
    playerId: PlayerId;
    endsAt: number | null;
    remainingMs: number;
    guessed: PhraseId[];
  } | null;
  prevTurn: /* snapshot for restart_prev_turn */ unknown;
  acknowledged: PlayerId[]; // round-intro acknowledgements
  scores: Record<TeamId, number>;
  expiresAt: number;
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
| Game master, when moderation is on | the moderation queue (pending phrases with author names)                |
| Game master, after `reveal()`      | the active player's phrases                                             |
| Each author (including Cavan)      | their own phrases and each one's status (pending / approved / rejected) |
| Everyone                           | names, teams, statuses, scores, phase, timer, counts only for phrases   |

Tokens never appear in any view. Emotes are broadcast without touching state.

### 5.4 Actions & permissions

The reducer enforces this table. Anything not listed is rejected.

| Action                                    | Who                         | Phase                     | Notes                                                                                                                  |
| ----------------------------------------- | --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `join { name, token? }`                   | anyone                      | any                       | Rules in [§5.6](#56-presence-disconnects--rejoin)                                                                      |
| `updateConfig`                            | host                        | `lobby`                   | Values clamped to [§6.6](#66-resource-limits) ranges                                                                   |
| `kick { playerId }`                       | host                        | any                       | Removes the player and closes their sockets; if they were mid-turn, the turn ends                                      |
| `rename { playerId, name }`               | host                        | any                       | Must stay unique                                                                                                       |
| `setCavan { playerId \| null }`           | host                        | `lobby`–`writing`         | Phrases Cavan already submitted with no review become `pending`                                                        |
| `setGamemaster { playerId }`              | host                        | any                       | Target must be active                                                                                                  |
| `startTeams`                              | host                        | `lobby`                   | At least 2 active players                                                                                              |
| `nameTeam`, `addToTeam`, `removeFromTeam` | host or that team's captain | `teams`                   | `addToTeam { playerId \| "random" }`: random is chosen by the server and shown as a wheel spin                         |
| `confirmTeams`                            | host                        | `teams`                   | Every active, non-waiting player is on a team, and every team has at least 1 player                                    |
| `assignWaiting { playerId, teamId }`      | host                        | after `teams`             | Moves a late joiner out of the waiting room and appends them to the turn order                                         |
| `submitPhrase { text }`                   | player on a team            | `writing`                 | Validated ([§6.4](#64-domain-validation)). Becomes `pending` if moderation applies to the author, otherwise `approved` |
| `deletePhrase { phraseId }`               | author                      | `writing`                 | Own phrases only                                                                                                       |
| `approvePhrase`, `rejectPhrase`           | game master                 | `writing`                 | `pending` phrases only. Rejected phrases don't count toward the author's quota; the author writes a replacement        |
| `startGame`                               | game master                 | `writing`                 | Every **active** player has their quota of approved phrases and nothing is pending                                     |
| `acknowledge`                             | any active player           | `roundIntro`              | When every active player has acknowledged → `turnReady`                                                                |
| `startTurn`                               | game master                 | `turnReady`               | Countdown on the active player's device, then `turnActive`                                                             |
| `next`, `back`                            | active player               | `turnActive`              | `next`: +1, phrase leaves the pile. `back`: undoes the last `next` of this turn                                        |
| `pauseTimer`, `resumeTimer`               | game master                 | `turnActive`              |                                                                                                                        |
| `addTime { ms }`                          | game master                 | `turnActive`, paused only | Positive or negative; remaining time clamped                                                                           |
| `endTurn`                                 | game master                 | `turnActive`              |                                                                                                                        |
| `restartPrevTurn { ms }`                  | game master                 | `turnReady`               | Restores the previous turn's snapshot with a manually chosen time                                                      |
| `reveal`                                  | game master                 | `turnActive`              | Shows the GM the active player's phrases                                                                               |
| `emote { kind }`                          | anyone                      | any                       | Broadcast only; rate-limited                                                                                           |
| `playAgain`                               | host                        | `results`                 | [§5.7](#57-play-again)                                                                                                 |
| `timeout` _(server)_                      | alarm                       | `turnActive`              | Timer reached zero                                                                                                     |
| `presenceSweep` _(server)_                | alarm                       | any                       | [§5.6](#56-presence-disconnects--rejoin)                                                                               |

**Moderation, i.e. who needs GM approval:**

- `config.moderation = "cavan"` (the main use): only phrases by `roles.cavanId`.
- `"all"`: every author except the game master.
- `"off"`: nobody.

### 5.5 Timers & the alarm

**The server owns the clock.**

- While a turn runs, `turn.endsAt` is an epoch-ms timestamp. While paused it is `null`, and `remainingMs` holds the time left.
- Clients render the countdown from `endsAt`, correcting their clock with the server `now` included in every message.

**One alarm, three jobs.** A Durable Object has a single alarm. It is always set to the earliest of:

- `turn.endsAt`, which triggers `timeout`
- the next presence sweep (every `PRESENCE_SWEEP_MS`, only while any player is active)
- `expiresAt`, which closes all sockets and runs `ctx.storage.deleteAll()`

`expiresAt` is either last activity + 2 h, or entering `results` + 15 min. That expiry is what makes the "ephemeral" requirement true without a cleanup job.

### 5.6 Presence, disconnects & rejoin

**Detecting a dead connection** (D8).

- **Client:** sends `"ping"` every `HEARTBEAT_INTERVAL_MS` (5 s). The server auto-responds `"pong"` without waking. If two pongs in a row go missing, the client forces a reconnect.
- **Server:** each sweep computes a player's `lastSeenAt` from their sockets' auto-response timestamps and their last message.
- A player becomes **inactive** when none of their sockets is open with a fresh heartbeat **and** `now − lastSeenAt > INACTIVE_AFTER_MS` (20 s). The server closes their stale sockets.
- A clean `close` (tab closed) starts the same countdown immediately. A quick refresh reconnects well inside the window and never shows as inactive.

**What being inactive does:**

- **Turn rotation skips them.** When an inactive player's turn comes up, the next active player _on the same team_ goes instead, so the team doesn't lose its turn. If the team has nobody active, the team is skipped. ❓ See [§9](#9-open-questions).
- **If the active player drops mid-turn:**
  1. The timer **auto-pauses** as soon as their last socket closes or goes stale.
  2. If they're back before going inactive, the GM resumes.
  3. If they go inactive, the turn ends as if `endTurn`: phrases already guessed count, and the current phrase returns to the pile. Play moves to the next active player.
  4. If it was a false alarm, the GM can still `restartPrevTurn`.
- **No stuck roles.**
  - If the **host** goes inactive, host passes to the earliest-joined active player.
  - If the **game master** goes inactive, GM falls back to the host.
  - If a **team captain** goes inactive, the next active team member becomes captain.
- Inactive players don't block `acknowledge` or `startGame`; only active players count.

**Rejoining** (D7). On `join { name, token? }` the server checks, in order:

1. **The token matches a player:** bind this socket to that player and close any older sockets for them (newest wins). Status becomes active. This covers refreshes, network switches and duplicate tabs.
2. **`nameKey(name)` matches an inactive player:** bind to that player, mark them active, and issue a new token. They keep team, phrases, score and roles (unless a role was handed off while they were away). This covers a dead phone or a new device.
3. **`nameKey(name)` matches an active player:** reject with `NAME_TAKEN`.
4. **Otherwise**, create a new player:
   - in `lobby`, they join normally
   - in any later phase, they go to the **waiting room** (`waiting: true`) until the host assigns a team
   - `maxPlayers` is enforced

`nameKey(name)` trims the name, collapses inner whitespace, applies Unicode NFC normalization, and lowercases it. The display name keeps the player's casing.

### 5.7 Play again

`playAgain` (host, `results` phase) changes state as follows (D9):

| Kept                                                                                                           | Cleared                                                                                | Removed                                                                                |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Lobby code, every open socket, active players, roles, config, teams (as the starting point for team selection) | Phrases, pile, scores, round, turn order and index, turn, `prevTurn`, acknowledgements | Inactive players. They can still rejoin by name, because the lobby phase accepts joins |

Waiting-room players become normal lobby players. `expiresAt` is refreshed and the phase becomes `lobby`. Because the state is pushed to every connection, every screen moves to the lobby at once.

**UI:** the results screen shows **Play again** to the host; everyone else sees "Waiting for the host…".

### 5.8 Protocol

- **Client → server:** JSON `{ type, ...payload }`, one of the actions in [§5.4](#54-actions--permissions), plus the raw `"ping"` heartbeat frame. Connect query: `?v=<PROTOCOL_VERSION>`.
- **Server → client:**
  - `{ type: "state", view, now }`
  - `{ type: "emote", from, kind }`
  - `{ type: "error", code, message }`, sent only to the offending connection
  - `{ type: "reload" }`, on a protocol version mismatch ([§6.8](#68-deploys--version-skew))
- **Error codes:** `BAD_MESSAGE`, `FORBIDDEN`, `WRONG_PHASE`, `INVALID`, `NAME_TAKEN`, `LOBBY_FULL`, `RATE_LIMITED`, `INTERNAL`.

### 5.9 Libraries planned

- `zod` for message schemas
- `obscenity` for the profanity filter, which works in both Workers and the browser
- `motion` and `canvas-confetti` for the wheel and celebrations
- `fast-check` for property tests ([§8](#8-testing--verification))

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
- `POST /parties/lobby/<CODE>` (lobby creation) only allows CORS from the web app's origin. A lobby code that already exists returns `409`.

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
- A socket that hasn't joined can only send `join` (and `ping`).

### 6.4 Domain validation

These checks live in `packages/game`, so the client can run them for instant feedback; the server's result is final.

- **Names:** after `nameKey` normalization, 1–`NAME_MAX_LEN` characters, unique in the lobby, control characters stripped, profanity-checked if the config says so.
- **Phrases:** trimmed, 1–`PHRASE_MAX_LEN` characters, word count ≤ `maxWordsPerPhrase`, profanity-checked if configured, no duplicates within the lobby (case-insensitive), and the author must be within their quota.
- **Config:** every field clamped to the ranges in [§6.6](#66-resource-limits).
- **Ids:** must refer to existing players, teams or phrases. Unknown ids → `INVALID`.

### 6.5 State integrity

- **Server-authoritative.** Clients send intents (`next`, `addTime { ms }`), never results. Scores, timers, turn order, random picks and the phrase pile are computed only on the server.
- **Atomic transitions.** The reducer is pure and returns a new state. If it returns an error or throws, the error is caught and logged, the sender gets `INTERNAL`, and **the previous state is kept**.
- **Invariants.** `checkInvariants(state)` runs after every transition, in production as well as tests, because it's cheap. A violation rejects the transition. Examples:
  - `roles.*` point at existing players
  - the host and game master are active whenever any player is active
  - every `teamId` exists, and every team member's `teamId` matches
  - `pile` ⊆ approved phrases
  - `turn.playerId` exists and is on a team
  - `remainingMs` is within bounds
  - `phase`-specific fields are present
- **Persist before broadcast.** If `ctx.storage.put` fails, the in-memory state reverts and nothing is broadcast.
- **Schema version.** If a stored blob's `schemaVersion` doesn't match the code, the lobby is reset rather than loaded half-understood. That's acceptable, because lobbies are ephemeral.
- **Single-threaded, but async-aware.** Don't `await` external I/O between reading state and writing it back. Durable Object input gates protect storage awaits.

### 6.6 Resource limits

These are proposed defaults, to be defined as constants in `packages/game` and tuned freely. If you change them, update this table.

| Limit                       | Default                              |
| --------------------------- | ------------------------------------ |
| `MAX_MESSAGE_BYTES`         | 4 KB                                 |
| `NAME_MAX_LEN`              | 20 characters                        |
| `PHRASE_MAX_LEN`            | 80 characters                        |
| `maxWordsPerPhrase`         | config 1–10                          |
| `phrasesPerPlayer`          | config 1–10                          |
| `maxPlayers`                | config 2–40 (hard cap 40)            |
| `teamCount`                 | config 2–8                           |
| `roundLengthSec`            | config 15–180                        |
| Connections per lobby       | 60 (players + TVs + duplicate tabs)  |
| `addTime`                   | ±60 s per action; remaining 0–10 min |
| Rate limit                  | 10 msg/s, burst 20; emotes 2/s       |
| `HEARTBEAT_INTERVAL_MS`     | 5 000                                |
| `INACTIVE_AFTER_MS`         | 20 000                               |
| `PRESENCE_SWEEP_MS`         | 5 000                                |
| Idle expiry / after results | 2 h / 15 min                         |

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
| Typing an inactive player's name takes them over (D7) | Required for rejoin-by-name. Nothing is at stake, and the host can kick or rename                    |
| Session tokens are convenience, not authentication    | They only shortcut reconnects                                                                        |
| The GM sees moderated phrases                         | By design: the GM approves them                                                                      |
| Backdoors (prank rewrite, reveal-all)                 | Intentional game features. When built, they must still be server-side actions with role checks       |
| Phrases aren't encrypted in storage                   | Deleted at expiry; nothing sensitive                                                                 |

**Not doing:** accounts, auth, encryption at rest, anti-cheat beyond hiding phrases, audit logs.

### 6.10 Failure modes

| Scenario                                   | Expected behavior                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Phone dies mid-turn                        | Timer auto-pauses; after `INACTIVE_AFTER_MS` the turn ends and the next player is up; they can rejoin by name |
| Page refresh / Wi-Fi ↔ cellular            | Token rebind; nobody notices                                                                                  |
| Same player open in two tabs               | Newest socket wins; the older one is closed with a "replaced" notice                                          |
| Host or GM leaves                          | Role hands off automatically (§5.6)                                                                           |
| Everyone leaves                            | Lobby expires; storage deleted                                                                                |
| Worker redeploy or Durable Object eviction | Clients reconnect; state reloaded from storage                                                                |
| Malformed, oversized or unknown message    | Error reply to the sender; state unchanged                                                                    |
| Client clock is wrong                      | Countdown uses the server's `now` offset                                                                      |
| Reducer bug throws or breaks an invariant  | Transition rejected, previous state kept, error logged                                                        |
| Stale client after a deploy                | `reload` on protocol mismatch                                                                                 |

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

---

## 8. Testing & verification

**Commands** (run all of them before finishing any change):

| Command                        | What it checks                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                    | Biome over the whole repo                                                                                            |
| `pnpm typecheck`               | `tsc --noEmit` in every package; web runs `next typegen` first so route types like `PageProps<"/play/[code]">` exist |
| `pnpm test`                    | Vitest in `packages/game`                                                                                            |
| `pnpm --filter @tmn/web build` | Production build, including Next's type check                                                                        |

**Tests to write with the lobby server** 🚧:

- **Per action:** it succeeds for the allowed role and phase, and is rejected with the right code for every other role or phase ([§5.4](#54-actions--permissions)).
- **Views:** `viewFor` never leaks tokens or hidden phrases, for every viewer type.
- **Presence and rejoin:** with an injected clock, cover inactivity after the threshold, turn skipping, mid-turn auto-pause and end, role handoff, and all four rejoin paths.
- **Play again:** what's kept, cleared and removed matches [§5.7](#57-play-again).
- **Property tests** (`fast-check`): random sequences of valid _and_ garbage messages from random actors never throw, never break invariants, and never change state on error.
- **Purity:** reducer inputs are deep-frozen in tests, so any mutation throws.

**Manual end-to-end check** ✅ (current scaffold):

1. Run `pnpm dev` and open `http://localhost:3000`.
2. Enter a code; the page should show `connected · 1 player`.
3. Open the same code in a second tab. Both should show `2 players`.
4. Close one tab. The other should drop back to `1 player`.

This flow was verified with headless Firefox during scaffolding.

**Testing on phones on the same Wi-Fi:**

1. Run `pnpm dev` and nothing else. It already starts the worker on all interfaces. Starting the worker a second time fails with `Address already in use (0.0.0.0:8787)`.
2. Open `http://<your LAN IP>:3000` on the phone. `pnpm dev` prints a "Network" URL, but that may be a different interface: use the IP of the interface the phone shares, e.g. your Wi-Fi IP from `ip -4 -br addr`.
3. Leave `NEXT_PUBLIC_PARTY_HOST` unset. If it points at an address the worker isn't reachable on, every tab hangs on "connecting…".

If your LAN uses `172.16–31.x` addresses, add them to `allowedDevOrigins` in `next.config.ts`.

---

## 9. Open questions

The design above makes an assumption for each of these, so work isn't blocked. Confirm or change them, and record the answer here and in the decision log.

| #   | Question                                                                      | Current assumption                                                                     |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Q1  | When an inactive player's turn comes up, does their **team** still play?      | Yes: the next active teammate goes; the team is skipped only if nobody on it is active |
| Q2  | Does the original host get host back when they rejoin?                        | No. Host stays with whoever it passed to (a `setHost` action could be added)           |
| Q3  | How many rounds, and what are their rules?                                    | Monikers-style 3 rounds (describe, one word, charades), reusing the same pile          |
| Q4  | When the pile empties mid-turn, does leftover time carry into the next round? | Undecided                                                                              |
| Q5  | Are kicked players banned from rejoining?                                     | No; after the lobby phase they land in the waiting room, so the host controls it       |
| Q6  | How are the backdoors triggered?                                              | Undecided; must be server-side and role-gated                                          |
| Q7  | Does the TV screen join as a player or a spectator?                           | Spectator connection (no name, read-only view); not yet designed                       |

---

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
