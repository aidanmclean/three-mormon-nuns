# Changelog

Newest first. One line per change, linking the decision (`D<n>` in [ARCHITECTURE.md](./ARCHITECTURE.md#3-decision-log)) where there is one. Every change gets an entry; see [AGENTS.md](../AGENTS.md).

## 2026-10-28

- **Fixed:** messages to players were an invisible box with invisible text (their colours came from a variable that only existed inside the app). They're now a dark card with light text and a warning icon, under the top bar. Tap to dismiss, or it clears after 4 seconds ([D43](./ARCHITECTURE.md#d43-player-messages-are-a-dark-dismissable-toast-impossible-actions-are-disabled-instead)).
- **Changed:** **Skip** is disabled, with one line saying why, when nobody else on the team is connected, instead of failing with a message.
- **Fixed:** the last emoji-capable symbols are gone: the logo star, the arrows on **Host a new game**, **Join game** and **Create lobby**, and **Reset defaults** now use drawn icons.
- **Changed:** skipping a turn keeps it on the same team. The next teammate goes now, and the skipped player goes on the team's next turn: if A is up before B, skipping A makes it B's turn, then A's. **Go next** is gone; End turn moves play to the next team ([D41](./ARCHITECTURE.md#d41-skipping-a-turn-swaps-the-player-with-their-next-teammate)). Protocol 7, schema 9: deploy party before web; stored lobbies reset.
- **Fixed:** TV text always fits ([D42](./ARCHITECTURE.md#d42-tv-panels-shrink-their-content-to-fit-each-team-has-one-colour-everywhere)).
  - The stage (clock, "Paused", round intro, results), the wheel panel and team lists shrink to fit instead of clipping in a short window.
  - The TV unit has no minimum size any more.
- **Fixed:** podium medals fit on every step. Step heights now scale with the medal, and players tied for a place share one points line.
- **Changed:** TV team lists wrap into two or three columns for big teams, and names are never cut off.
- **Changed:** the phone team screen.
  - Your team is listed first.
  - Captains get a big "Name your team" card.
  - Everyone sees who is naming each team.
  - While the wheel spins, teams show as compact name chips.
- **Changed:** each team has one colour everywhere: team cards, TV columns, your team chip, the GM's team buttons and the scoreboard. The team that's up is lifted instead of turning cyan.
- **Fixed:** the TV footer says "1 phrase each", not "1 phrases each".
- **Verified:**
  - Firefox at 1920×1080, 1366×650, 1280×600 and 1000×450 with 15 players with 16-character names, from teams to results: no panel overflowed and every medal sat on its step.
  - The GM skipping from a phone: Frankie skipped → Casey (same team) → the other team → Frankie.
- **Changed:** phones redesigned for play ([D39](./ARCHITECTURE.md#d39-phones-get-an-app-style-layout-drawn-icons-replace-emoji)).
  - A sticky top bar (phase, room code) and a "you" strip.
  - One big action in a thumb-reach dock: Everyone's in, Start writing, Got it, Start turn, Next turn, Play again.
  - House rules, everyone's progress, and the GM's players and turn options fold away.
  - Big inputs, 48–64px buttons, and avatars with role icons to the right of names.
  - The GM's per-player menus open one at a time.
- **Changed:** emoji are gone: line icons, drawn emote stickers, and drawn podium medals.
- **Changed:** TV lobby tiles size to each full name and wrap into rows flush to both edges, with player colours mixed per player. A time bar drains under the in-game clock.
- **Changed:** names are capped at 16 characters.
- **Changed:** only the GM can tell who Cavan is. No magnifier, legend, explainer or "being checked" counts for anyone else or the TV ([D40](./ARCHITECTURE.md#d40-only-the-gm-and-cavan-can-tell-who-cavan-is)). Cavan's phone says "Alex checks every phrase you write".
- **Fixed:**
  - The spinning wheel no longer adds scrollbars on phones.
  - Phones open at their natural zoom (viewport export).
  - The wheel's rotating square is clipped to its circle.
- **Verified:**
  - Two UI-driven phones (390×844), the TV and scripted players, from join to results: every tap went through the real buttons, and nothing scrolls sideways.
  - A 16-player TV lobby with long names at 1080p and 720p.
  - 95 tests; lint, typecheck and build pass.
- **Changed:** the host screen is laid out for a TV ([D38](./ARCHITECTURE.md#d38-the-host-screen-has-its-own-tv-layout-sized-from-the-screen)).
  - Everything scales with the screen, and nothing scrolls.
  - A big phase label in the header, and a join chip in every phase.
  - A numbered how-to-join panel and a slanted comic player count (e.g. 7 / 20).
  - Bigger player tiles and team columns; writing progress as dots.
  - House rules as large chips, with the game master named.
  - Larger in-game text, clock, scoreboard and podium.
  - The tiny progress strip and labels are gone.
- **Verified:** headless Firefox at 1920×1080 and 1280×720, every phase from an empty lobby to results, 0–16 players, nothing off screen. 95 tests; lint, typecheck and build pass.

## 2026-10-27

- **Added:** skip a turn and send someone up next ([D35](./ARCHITECTURE.md#d35-the-gm-can-skip-whoever-is-up-and-send-a-skipped-player-up-next)).
  - Before a turn starts, the GM can skip whoever is up (washroom, or they'd rather pass). Their teammate plays with the same time.
  - The GM's phone lists skipped players with **Go next**, which gives them their team's next turn, or this one if their team is up, without costing anyone their place.
- **Added:** spin the wheel for whoever's left ([D34](./ARCHITECTURE.md#d34-until-teams-are-final-everyone-unplaced-is-in-one-pool-the-gm-can-spin-the-wheel-for-it)). Works in manual mode or after a wheel, and keeps sides balanced.
- **Changed:** people who join (or come back) before teams are final join the pool of unplaced players instead of the waiting room; a running wheel draws them too (D34, superseding D28's late-arrival rule).
- **Added:** a top-three podium of describers on the results screen, TV and phones ([D36](./ARCHITECTURE.md#d36-per-player-points-and-a-top-three-podium-on-the-results-screen)). Points go to whoever described; ties share a pedestal.
- **Added:** CI job `e2e` runs both WebSocket suites against a local `wrangler dev` worker. No Cloudflare account needed.
- **Fixed:** stale CSS after editing `globals.css` while `next dev` was stopped. Turbopack's file-system cache is now off for dev and build ([D37](./ARCHITECTURE.md#d37-turbopacks-file-system-cache-is-off-for-dev-and-build)).
- **Changed:** schema v8 (v7 rooms reset). Protocol unchanged at v6; the new messages and view fields are additive.
- **Verified:**
  - 95 unit/property tests.
  - 64 lobby and 30 game WebSocket checks, run the way the CI job runs them.
  - Headless Firefox: the GM placed a player, spun for the rest (3/2), skipped a turn to a teammate, sent the skipped player back up, and finished with a podium on the TV and phone.

- **Added:** manual team picking ([D32](./ARCHITECTURE.md#d32-manual-team-picking-as-an-alternative-to-the-wheel)).
  - Before **Everyone’s in**, the GM chooses **Spin the wheel** or **Pick them myself**.
  - In manual mode there's no wheel. The GM places each player from a **Not on a team yet** list, and the first player placed on a team is its captain.
  - `startTeams { mode? }` defaults to the wheel.
  - Schema v7 (v6 rooms reset); protocol unchanged at v6.
- **Changed:** emotes pop up at random spots across the TV, each with its own size, tilt, drift and speed, instead of rising from a line along the bottom.
- **Fixed:** a stored lobby that fails invariants is now discarded on load instead of rejecting every action forever ([D33](./ARCHITECTURE.md#d33-discard-stored-lobbies-that-fail-invariants-on-load)). This was the `invariant violation; transition rejected [ 'game state/phase mismatch' ]` log: a dev room saved before the game state existed.
- **Verified:**
  - 86 unit/property tests.
  - 61 lobby and 27 game WebSocket checks.
  - Headless Firefox: the GM chooses manual mode and places players on the phone, the TV mirrors it, and 12 emotes scatter across the TV.

- **Added:** the game loop ([D31](./ARCHITECTURE.md#d31-the-game-loop)).
  - The GM starts the game once everyone's approved phrases are in.
  - Three rounds (Describe it, Charades, One word), each with an intro everyone acknowledges (or the GM starts).
  - Team-alternating rotation that skips offline players.
  - Turns: a 3-2-1 countdown, Got it / Back, a server-timed clock, review with Back/Forward, and Proceed.
  - Pile-out carry-over of leftover time (D17), results with ties, and Play again.
  - GM controls: pause/resume, ±10 s while paused, end turn, reveal, restart previous turn. The GM can also place late joiners mid-game.
  - Emotes float up on the TV.
  - New phone game screen, TV game board, and a "Play" progress step.
- **Restored:** Cavan, the moderated player ([D30](./ARCHITECTURE.md#d30-restore-cavan-the-moderated-player), superseding D27).
  - The GM designates Cavan and approves or rejects each of Cavan's phrases from a queue only they see.
  - Rejected phrases don't count, so Cavan writes another.
  - The game can't start with anything pending.
- **Changed:** schema and protocol v6; existing rooms reset; deploy party before web. Kicking a player mid-game keeps their phrases in the pile. An active player who drops ends their turn instead of stalling it.
- **Verified:**
  - 82 unit/property tests, including a randomized game-loop property test.
  - 56 lobby and 27 full-game WebSocket checks (`pnpm --filter @tmn/party e2e:game`).
  - A headless-Firefox game with a real TV and phone: writing, round intro, a full turn on the phone, review, results and emotes.

- **Fixed:** read-only host mirrors no longer disconnect each other when a second host tab opens; player identity still uses newest-socket-wins ([D26](./ARCHITECTURE.md#d26-read-only-host-mirrors-can-coexist)).
- **Removed:** the nonexistent Cavan role, controls, flags, protocol action and moderation rules ([D27](./ARCHITECTURE.md#d27-remove-the-nonexistent-special-player-role)).
- **Changed:** **Everyone’s in** closes the roster and starts an automatic server-timed SVG wheel. Assignments are balanced, first-drawn members become captains, captains must save names, and only the GM can correct membership/start writing. Added real private phrase entry with validation, quotas and author-only deletion. Protocol/schema advance to 5; old rooms reset, and party deploys before web ([D28](./ARCHITECTURE.md#d28-everyones-in-starts-a-server-timed-wheel-then-captains-name-teams-and-players-write)).
- **Added:** development-only `/dev` multi-screen test desk with independent real host/player sessions, phase/connection labels, per-device reload/disconnect and a fresh-room control. Added [TESTING.md](./TESTING.md) with the full manual/failure checklist ([D29](./ARCHITECTURE.md#d29-a-development-only-desk-with-independently-controlled-real-screens)).
- **Verified:** 53 unit/property tests, 56 native WebSocket checks, and a six-player browser flow covering mirrors, automatic spins, GM reload, captain names, manual moves, all phrase quotas, privacy and disconnect/reconnect.

- **Fixed:** lobby creation appeared hung when the separate local game server was down. Host/player startup now shows a clear connection error and retry button after 8 seconds without a response, keeps automatic reconnects active, and retains the pending room/settings. Server creation errors are displayed immediately ([D25](./ARCHITECTURE.md#d25-show-lobby-connection-failures-while-retaining-the-pending-room)).
- **Changed:** refined the rebrand into a retro comic throughout: Bangers lettering, bold ink panels, red/blue/yellow spot colors, halftone dots and speech balloons. The main screen fits one viewport with host/join controls visible; the desktop host keeps roster/team scrolling inside panels. Removed promotional filler and replaced the ASCII trio with a published OpenClipart/FreeSVG cartoon, stored locally with [asset credits](./ASSETS.md) ([D24](./ARCHITECTURE.md#d24-retro-comic-presentation-with-published-artwork-and-a-single-screen-entry), superseding D23).
- **Changed:** rebranded the homepage, join flow, TV lobby and phone lobby in light mode: hand-set ASCII nuns, dot dithering, warm paper/vermilion/citron colors, Bricolage Grotesque and Space Mono, and a custom SVG favicon. Shared controls, visible focus, offline labels and reduced-motion behavior carry through the new layouts ([D23](./ARCHITECTURE.md#d23-a-paper-and-ink-ascii-identity-in-light-mode)).
- **Added:** host setup at `/host/new` before creating a room. All five numeric rules, reset defaults and capacity validation; chosen settings are sent atomically in `create.config`, preserved on code collisions, and remain editable by the GM in the lobby ([D21](./ARCHITECTURE.md#d21-configure-the-hosts-lobby-before-creating-it)).
- **Added:** server-authoritative team selection: self-selection/switching, captain naming/recruitment/removal, random recruitment with a public result and animated ASCII reel/confetti, balanced GM shuffles, reconnect membership and automatic captain handoff. The GM confirms only complete teams with connected members. Players can join normally through selection; later arrivals wait. Confirmation saves teams and opens the writing-stage summary; phrase entry remains future work ([D22](./ARCHITECTURE.md#d22-server-owned-team-selection-with-self-selection-and-captain-controls)).
- **Changed:** protocol and storage schema to 4 for the team model. Party must deploy before web; existing v3 lobbies reset. No dependencies or numeric limits changed.
- **Verified:** 50 unit/property tests, 46 real WebSocket checks, and a browser flow with a host and four isolated phone sessions. Checked setup-before-creation, config propagation, captain permissions, recruitment, shuffle, refresh and confirmation, plus 320px/390px layouts, light mode under dark OS settings, lint, typecheck and production build.

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
