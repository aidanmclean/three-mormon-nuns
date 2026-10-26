# Changelog

Newest first. One line per change, linking the decision (`D<n>` in [ARCHITECTURE.md](./ARCHITECTURE.md#3-decision-log)) where there is one. Every change gets an entry; see [AGENTS.md](../AGENTS.md).

## 2026-10-26

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
