# Changelog

Newest first. One line per change, linking the decision (`D<n>` in [ARCHITECTURE.md](./ARCHITECTURE.md#3-decision-log)) where there is one. Every change gets an entry; see [AGENTS.md](../AGENTS.md).

## 2026-10-26

- **Fixed:** the host screen said "Join on your phone at localhost:3000" when opened on the dev machine. It now asks a dev-only `/api/lan-address` route for the machine's LAN IPs and shows the Wi-Fi one, with any others as fallbacks ([D20](./ARCHITECTURE.md#d20-the-host-screen-shows-a-lan-address-not-localhost)).
- **Changed:** the host is now a shared screen (TV or laptop), not a player ([D18](./ARCHITECTURE.md#d18-the-host-is-a-shared-screen-not-a-player-the-game-master-controls-the-game)).
  - "Host a new game" opens `/host/<CODE>`, which shows the code, join address, players and settings, and has no controls.
  - The game master, a player and the first to join, now holds every control, and the role passes on automatically if they drop.
  - New messages are `create {}`, `screen { token }` and `joined.as`. `SCHEMA_VERSION` and `PROTOCOL_VERSION` go to 3.
  - The e2e script grew to 34 checks.
- **Changed:** client reconnect backoff is now 250 ms → 4 s, instead of partysocket's 3 s → 10 s ([D19](./ARCHITECTURE.md#d19-fast-client-reconnects)). Known issue: a page _reload_ still takes about 4 s to reconnect in Firefox.
- **Fixed:** the shell now applies effects even when the state didn't change (needed for screen reconnects).
- **Changed:** removed the "phrase approval" setting. Cavan's phrases are now always vetted by the game master whenever someone is Cavan ([D16](./ARCHITECTURE.md#d16-cavans-phrases-are-always-vetted-theres-no-moderation-setting)). This bumps `SCHEMA_VERSION` and `PROTOCOL_VERSION` to 2, so open lobbies reset and old tabs reload.
- **Changed:** max words per phrase now defaults to 3.
- **Docs:** answered the open questions. A pile-out mid-turn stops the timer and the same player carries the time left into the next round ([D17](./ARCHITECTURE.md#d17-when-the-pile-runs-out-the-same-player-keeps-going-with-the-time-left)); rotation continues; the round rules are describe / charades / one word (now `ROUND_RULES`); a tie is a tie. Added Q11.
- **Changed:** offline players now show a dimmed name and an "offline" label, not just a grey dot. The "Rejoining?" hint is now small and muted, below the Join button.
- **Fixed:** the property test could flake. fast-check's default sizing made most sequences too short to ever exercise `kick`, so it now uses 20–80 steps and sends joins from unjoined sockets.
- **Added:** slice 1, the lobby phase end to end ([§4](./ARCHITECTURE.md#4-what-is-implemented-today)).
  - `packages/game`: constants, config schema, names, protocol (zod), a pure reducer with join/rejoin rules, host actions, presence and role handoff, invariants, and `viewFor`. 41 unit and property tests.
  - `apps/party`: the real `Lobby` shell, with persistence, boundary validation, rate limiting, heartbeats and the presence sweep, expiry, effects and per-player views. Also a 25-check WebSocket e2e script (`pnpm --filter @tmn/party e2e`).
  - `apps/web`: host and join flows, the name prompt, the live lobby screen with host controls and settings, and the `useLobby` hook (session tokens, heartbeat, reload on version mismatch).
- **Added:** GitHub Actions CI: lint, typecheck, test and web build on pushes to `main` and on PRs.
- **Docs:** recorded the house rules: 3 rounds, alternating teams, next/back, review after the timer, and Proceed (§1.2). Resolved Q3, answered Q4, and added Q8–Q10.
- **Decisions:** the turn model is seen phrases plus a cursor, with per-team rotation ([D13](./ARCHITECTURE.md#d13-a-turn-is-a-list-of-seen-phrases-plus-a-cursor)). Lobbies are created over the WebSocket instead of `POST` ([D14](./ARCHITECTURE.md#d14-lobbies-are-created-over-the-websocket-not-an-http-endpoint)). Presence is computed in the shell, and only status changes reach the reducer ([D15](./ARCHITECTURE.md#d15-presence-is-computed-in-the-shell-only-status-changes-reach-the-reducer)).
- **Changed:** out-of-range config values are now rejected rather than clamped (§6.4).
- **Fixed:** the shared button and input styles weren't applied: Tailwind v4 dropped them from `@layer components`, so they're now `@utility` blocks.
- **Fixed:** tabs hanging on "connecting…" and `EADDRINUSE` when starting the worker separately. The dev worker now listens on `0.0.0.0`, the client derives the party host from the page hostname, and Next allows LAN dev origins. The phone-testing docs were corrected ([D12](./ARCHITECTURE.md#d12-dev-servers-are-reachable-from-the-lan-with-zero-config)).
- **Docs:** corrected the Cavan role. Cavan is the _moderated_ player, and the game master approves or rejects every phrase Cavan submits. Updated roles, views, actions and moderation config (`off | cavan | all`).
- **Docs:** designed disconnect detection with heartbeats and a presence sweep. Inactive players' turns are skipped; covers mid-turn drops and role handoff ([D8](./ARCHITECTURE.md#d8-presence-uses-client-heartbeats-and-a-server-sweep-inactive-players-are-skipped)).
- **Docs:** designed rejoin by entering the same name, plus a session token for seamless reconnects ([D7](./ARCHITECTURE.md#d7-identity-is-your-name-within-a-lobby-plus-a-device-token-for-seamless-reconnects), revised).
- **Docs:** designed **Play again**, which returns the same lobby to the lobby phase with everyone still connected ([D9](./ARCHITECTURE.md#d9-play-again-resets-the-same-lobby-in-place)).
- **Docs:** added the security, validation and robustness section (§6) and the actions & permissions matrix (§5.4) ([D10](./ARCHITECTURE.md#d10-robustness-over-security-validate-at-the-boundary-server-is-authoritative-state-can-never-go-invalid)).
- **Docs:** added the contributor and agent rules: root `AGENTS.md`, `CLAUDE.md` importing it, and this changelog. Also added the game spec (§1), status markers, open questions (§9) and a decision template ([D11](./ARCHITECTURE.md#d11-documentation-is-part-of-every-change)).

## 2026-10-25

- **Added:** pnpm workspaces monorepo with `apps/web` (Next.js 16), `apps/party` (PartyServer Durable Object) and `packages/game` (shared TS) ([D1](./ARCHITECTURE.md#d1-lobby-state-lives-in-a-durable-object-partyserver-not-redis-or-supabase)–[D5](./ARCHITECTURE.md#d5-tooling-biome-typescript-7-vitest-5)).
- **Added:** live connection-count smoke path (landing page → `/play/[code]` → `Lobby` broadcast), verified in headless Firefox.
- **Added:** Biome, TypeScript 7, and Vitest 5 tooling; the dependency policy ([D6](./ARCHITECTURE.md#d6-dependency-policy)); `docs/ARCHITECTURE.md` and the README.
