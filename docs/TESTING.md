# Testing a room with multiple players

## Start both services

From the repository root:

```sh
pnpm dev
```

This starts the web app at **http://localhost:3000** and the game server at **http://localhost:8787**. If the web app is already running, start only the missing service with `pnpm --filter @tmn/party dev`. Do not start a second worker on port 8787.

## See and control every screen on one computer

Open **http://localhost:3000/dev** (or click **Test multiple players** on the development homepage).

1. Choose **Players** (2–12) and **Teams** (2–8, no more than the player count).
2. Click **Start test room**. A real host screen and real phone screens appear. Each phone has its own saved identity and WebSocket. Alex joins first and becomes game master; the other phones join after Alex.
3. Click inside any phone to use its controls. Scroll the test desk to see the remaining phones. The screen header shows its connection, phase and GM status.
4. Use **Reload** to refresh just one device. Use **Disconnect**, wait about 20–25 seconds for presence detection, then **Reconnect** to test recovery. The same player keeps their team and phrases.
5. Click **New test room** for a fresh room. This closes the old previews; old rooms expire normally.

The test desk is available only under `pnpm dev`. **The production preview at port 3002 does not expose `/dev`.** These are real game screens, not mocked results. The helper only gives each embedded device a separate local session; server validation and permissions are identical to normal play.

## Walk through the wheel and writing

Use six players and two teams for the first run:

1. On the host, check that all six players are listed. Only **Alex’s phone** has the **Everyone’s in** button.
2. Press **Everyone’s in** on Alex’s phone. The roster closes and the server starts the wheel automatically on every screen. There is no player self-selection or per-phone spin button.
3. Watch each spin pick a name and place that player on a team. A spin takes **2.6 seconds**, followed by a **0.9-second reveal**. Six players take about **21 seconds**. The server decides the winner; the animation only displays that choice.
4. Check that each name is assigned once, that the sides are balanced (3 and 3), and that the **first person drawn for each team** has the **CAPTAIN** badge. With five players, expect 3 and 2; with seven and three teams, expect 3, 2 and 2.
5. After the final reveal, captains can enter and **Save name** on their own team card. The GM can name either team. Other players have no naming or moving controls. Blank or duplicate names are rejected.
6. **Start writing phrases** stays disabled until every team has a saved name and a connected member, and every connected non-waiting player has a team.
7. On Alex’s phone, use **Move a player here… → Move** to correct assignments. Captains cannot move members. Removing/moving a captain hands the role to the next eligible member in assignment order. Try leaving a team empty: continuing must be blocked.
8. Press **Start writing phrases** on the GM’s phone. Every eligible phone gets a real phrase form. Add three phrases per player (default), each with at most three words. Try an empty phrase, too many words, an overlong phrase, and a duplicate: none should enter the pile.
9. A player sees only their own phrase text. The host, GM and other phones see counts. **Delete** removes an author’s own phrase and restores a quota slot. The GM has no special permission to read or delete another player’s phrases.
10. Fill everyone’s quota. The host shows everyone ready. The timed guessing rounds remain a future development stage; this slice ends after phrase collection.

## Failure and permission checks

- **Host mirrors:** open the host iframe’s URL in another tab (including its `?device=test-host` suffix). Both host screens must stay live. In normal play, opening `/host/CODE` in another tab of the browser that created the room also works. A different browser without the room’s saved host key cannot reclaim it; it can join as a player.
- **Player identity:** normal tabs share localStorage, so opening the same player URL in another normal tab reclaims that player and replaces the old player socket. Incognito windows also share their incognito session with each other. Use the test desk, separate browser profiles, Firefox containers, different browsers or actual phones for independent players.
- **Refresh mid-spin:** reload the host or a phone while the wheel is moving. The draft continues from server state, without a new result or duplicated member.
- **GM disconnect:** disconnect Alex and wait 20–25 seconds. GM passes to the next connected player. Alex’s return does not automatically take GM back.
- **Disconnected winner:** disconnect or kick a player while they are on the wheel. They are skipped once the server knows they are inactive/removed, and the remaining draft continues. Abrupt phone loss takes the normal presence-detection interval to become known.
- **Late arrival:** join a new player after **Everyone’s in**. They wait outside the frozen roster. After the wheel ends, the GM can move them onto a team before starting writing. New arrivals after writing starts wait for the next game.
- **Game server unavailable:** stop only the party worker and try a fresh room. After eight seconds the screen shows connection help and **Try again**. Restart the worker: the pending code and settings are retained.
- **Removed role:** there is no Cavan role, button, flag or moderation queue. Legacy `setCavan` messages are rejected.

For an extra independent local phone outside the desk, open `/play/CODE?device=extra-phone` under `pnpm dev`, enter a new name and join. The `device` suffix is a development-only local storage namespace, not a game-server identity or authorization shortcut.

## Actual phones

Keep the host screen open on the computer. Open the LAN address printed there on each phone, join the four-letter code, and enter different names. Both services must be reachable from that Wi-Fi. Each phone is naturally independent; no `device` parameter is needed. The host is not a player, so the host operator joins from their own phone too.

## Automated checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @tmn/web build
pnpm --filter @tmn/party e2e
```

The last command needs the running party worker and takes roughly 40 seconds. It exercises real WebSockets, including host mirrors, role handoff, timed server wheel progression, captain naming, GM corrections, late arrivals, phrase privacy and deletion. `PARTY_HOST` overrides the worker address when needed. Unit/property tests freeze reducer inputs and check invariants, including balanced assignments and the injected clock/RNG.

The six-player browser flow is also checked with independently controlled frames: all screens receive the draft, captain names and writing transition; a phone reload survives a spin; all players can fill their quotas; host/other players cannot see private phrases; and disconnect/reconnect retains identity and phrases.
