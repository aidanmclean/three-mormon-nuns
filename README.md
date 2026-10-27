# three-mormon-nuns

A Kahoot-style version of a popular charades-like party game, similar to _Monikers_ and _Fishbowl_. Everyone joins a lobby from their phone with a 4-letter code, writes phrases, and then teams take turns describing, one-wording, and acting them out against the clock.

- Game design: [`docs/3mormons.excalidraw`](docs/3mormons.excalidraw) (open with the Excalidraw VS Code extension or excalidraw.com)
- Spec, architecture, design decisions, security & validation: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Change history: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- **Contributing (humans and AI agents):** [`AGENTS.md`](AGENTS.md). Every change must update the docs and changelog.

For one-computer multiplayer testing, open **http://localhost:3000/dev** under `pnpm dev`: it shows a real host and 2–12 independent, controllable phone screens. See [TESTING.md](docs/TESTING.md) for the wheel, naming, writing and reconnect checklist. `/dev` is unavailable in the production preview.

## Stack

| Part                                   | Tech                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Web app (`apps/web`)                   | Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4          |
| Realtime lobby server (`apps/party`)   | Cloudflare Workers + Durable Objects via PartyServer, one instance per lobby |
| Shared rules & types (`packages/game`) | Plain TypeScript, used by both apps                                          |
| Tooling                                | pnpm workspaces, TypeScript 7, Biome, Vitest                                 |

There is no database. Lobbies are ephemeral, and each one lives in its own Durable Object. [ARCHITECTURE.md § D1](docs/ARCHITECTURE.md#d1-lobby-state-lives-in-a-durable-object-partyserver-not-redis-or-supabase) explains why this beats Redis or Supabase for this game.

## Getting started

Prerequisites: Node 24+ and pnpm 11+.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts both servers:

- web app on http://localhost:3000
- lobby Worker on http://localhost:8787

Both services are required to create or join a lobby. If the web app is already running on its own, start the game server with `pnpm --filter @tmn/party dev`. A missing game server shows a connection error after 8 seconds; the page keeps retrying, and **Try again** retains your pending room and rules.

On the computer you'll use as the shared screen, click **Host a new game**, choose the rules, then **Create lobby**. The shared screen shows a 4-letter code. Join that code from phones, or from private windows (a normal second tab shares your session). The first player to join is the **game master** and controls the game from their phone.

The game master presses **Everyone’s in** to close the roster. The server’s wheel assigns players one at a time; first-drawn players become team captains and save their team names. The GM can correct memberships, then start writing. Players submit private phrases under the room’s quota and word limits; timed guessing rounds are the next development slice.

The interface uses a light-mode retro comic style. Illustration sources are recorded in [ASSETS.md](docs/ASSETS.md).

No Cloudflare account is needed for local development; Wrangler runs Durable Objects locally.

**On phones:** with `pnpm dev` running, open `http://<your computer's LAN IP>:3000` on any phone on the same Wi-Fi. No extra config is needed. Don't start the worker separately, because `pnpm dev` already runs it.

## Scripts

| Command                           | Does                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                        | Run web + party dev servers in parallel                          |
| `pnpm build`                      | Production build of the web app                                  |
| `pnpm test`                       | Unit tests (Vitest)                                              |
| `pnpm typecheck`                  | `tsc --noEmit` in every package                                  |
| `pnpm lint`                       | Biome lint + format check                                        |
| `pnpm format`                     | Biome auto-fix + format                                          |
| `pnpm --filter @tmn/party types`  | Regenerate the Worker `Env` types after editing `wrangler.jsonc` |
| `pnpm --filter @tmn/party deploy` | Deploy the lobby Worker to Cloudflare                            |
| `pnpm --filter @tmn/party e2e`    | WebSocket end-to-end checks against the running dev worker       |

## Layout

```
apps/
  web/            Next.js app: home (/), setup (/host/new), TV (/host/[code]), phones (/play/[code])
  party/          Cloudflare Worker: Lobby Durable Object (src/lobby.ts)
packages/
  game/           @tmn/game: shared constants, types, and (soon) game rules
docs/
  3mormons.excalidraw   original game design board
  ARCHITECTURE.md       spec, design decisions, implementation notes, security
  CHANGELOG.md          dated log of every change
AGENTS.md               rules for contributors and coding agents
CLAUDE.md               imports AGENTS.md for Claude Code
```

## Deploying

- **Web:** import the repo into Vercel with the root directory set to `apps/web`. Set `NEXT_PUBLIC_PARTY_HOST` to the Worker's host, e.g. `three-mormon-nuns-party.<account>.workers.dev`.
- **Lobby server:** run `pnpm --filter @tmn/party deploy`. This needs `wrangler login` once. The Workers free plan covers Durable Objects.
