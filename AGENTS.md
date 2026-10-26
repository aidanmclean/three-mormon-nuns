# Agent & contributor guide

These rules apply to every human contributor and every coding agent working in this repo.

**Start here:** read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). It holds the game spec, the system design, every design decision, and the security and validation rules. Build against it.

## Documentation is part of every change (mandatory)

A change is not finished until its documentation is.

1. **Design decisions:** any non-obvious choice (a library, data shape, protocol rule, limit or tradeoff) gets a new `D<n>` entry in the decision log in `docs/ARCHITECTURE.md` §3, using the template at the bottom of that file.
   - Never delete or rewrite an accepted decision. Mark it `Superseded by D<m>` and add a new one.
2. **Implementation:** when you build something marked 🚧, move it to §4 ("What is implemented today") and mark it ✅. If the code has to differ from the documented design, update the design in the same change.
3. **Changelog:** add a dated line to [`docs/CHANGELOG.md`](docs/CHANGELOG.md) (newest first) for every change, linking the decision if there is one.
4. **Reference:** if you change dependency versions, config files, scripts or limits, update §7 (and §6.6 for limits).
5. **Open questions:** if you make a product assumption, add it to §9. If you resolve one, record the answer there and in the decision log.

## Engineering rules

- **The server is authoritative.** Clients send intents; the server owns time, randomness, scores and hidden phrases. Game rules live in the pure reducer in `packages/game`. The Durable Object in `apps/party` is a thin shell.
- **Validate everything at the boundary:**
  - size-check, then parse, then zod-validate every inbound message
  - authorize by role **and** phase
  - take the actor from the socket binding, never from the message body
- **Never let state go invalid.** Reducers are pure and never throw on bad input. Run invariants after every transition. Persist before broadcasting.
- **Only send `viewFor(...)` output to clients.** Never send raw state, tokens, or phrases the viewer shouldn't see. Never use `dangerouslySetInnerHTML` for player content.
- **`packages/game` stays runtime-neutral:** no DOM APIs, no Workers APIs.
- **Protocol changes:** prefer additive changes. Bump `PROTOCOL_VERSION` on any breaking message or view change, and deploy party before web.
- **Dependencies:** use the latest stable versions (check with `pnpm view <pkg> version`), but keep pnpm's release-age gate on (no `minimumReleaseAgeExclude`). `@types/node` matches the Node major in use. Approve install scripts explicitly in `pnpm-workspace.yaml` → `allowBuilds`.
- **After editing `apps/party/wrangler.jsonc`**, run `pnpm --filter @tmn/party types` and commit the regenerated `worker-configuration.d.ts`. Never edit an existing Durable Object migration; add a new one.
- **Next.js 16.4 differs from older versions.** Read the version-matched docs in `apps/web/node_modules/next/dist/docs/` before writing Next code (see [`apps/web/AGENTS.md`](apps/web/AGENTS.md)).

## Before you finish

```sh
pnpm lint        # Biome (pnpm format to auto-fix)
pnpm typecheck
pnpm test
pnpm --filter @tmn/web build   # if apps/web changed
```

Then check that the docs and changelog describe what you did.
