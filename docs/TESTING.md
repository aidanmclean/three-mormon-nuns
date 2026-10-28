# Testing a room with multiple players

## Start both services

From the repository root:

```sh
pnpm dev
```

This starts the web app at **http://localhost:3000** and the game server at **http://localhost:8787**. If the web app is already running, start only the missing service with `pnpm --filter @tmn/party dev`. Do not start a second worker on port 8787.

## Check the start pages

1. Open **http://localhost:3000** on a phone-sized window and a laptop-sized one. The same logo is in the top bar and as the big title, with the tagline under it. **How to play** sits top right. The cards read **Join a game** and **Host a game**, with an **OR** badge between them; on a phone, Join comes first. **Join** stays outlined until four letters are typed.
2. **How to play** opens six numbered steps and the three rounds, with **Join a game** and **Host a game** at the bottom. **Back** returns to the start page.
3. **Host** opens **Host a game**: the **House rules** card, **Create lobby**, and three lines on hosting with **game master** in bold. The logo matches the start page's. Nothing scrolls sideways at any width.

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
2. Under **How should teams be made?** leave **Spin the wheel** selected, and press **Everyone’s in** on Alex’s phone. The roster closes and the server starts the wheel automatically on every screen. There is no player self-selection or per-phone spin button.
3. Watch each spin pick a name and place that player on a team. A spin takes **2.6 seconds**, followed by a **0.9-second reveal**. Six players take about **21 seconds**. The server decides the winner; the animation only displays that choice.
4. Check that each name is assigned once, that the sides are balanced (3 and 3), and that the **first person drawn for each team** has the **CAPTAIN** badge. With five players, expect 3 and 2; with seven and three teams, expect 3, 2 and 2.
5. After the final reveal, each captain's phone opens on a big **Name your team** card (their team is listed first); **Save team name** names it, and **Rename** on the team card changes it later. The GM can name either team from its card. Other players see "<captain> (captain) picks the name" and have no naming or moving controls. Blank or duplicate names are rejected: a duplicate shows a dark message card under the top bar, which a tap dismisses.
6. **Start writing** (in the GM's dock) stays disabled until every team has a saved name and a connected member, and every connected non-waiting player has a team.
7. On Alex’s phone, tap a member, then **Move to …** or **Take off team**, to correct assignments. Captains cannot move members. Removing/moving a captain hands the role to the next eligible member in assignment order. Try leaving a team empty: continuing must be blocked.
8. Before starting writing (or during it), make someone Cavan: on Alex’s phone, open a non-GM player’s row and press **Make Cavan**. Only the GM's screens show the magnifier beside Cavan; the host and other phones show nothing (D40). The GM can’t be Cavan, and Cavan can’t be handed GM.
9. Press **Start writing** on the GM’s phone. Every eligible phone gets a real phrase form. Add three phrases per player (default), each with at most three words. Try an empty phrase, too many words, an overlong phrase, and a duplicate: none should enter the pile.
10. A player sees only their own phrase text. The host and other phones see counts. **Delete** removes an author’s own phrase and restores a quota slot. The GM can’t read or delete anyone’s phrases except Cavan’s pending ones.
11. Cavan’s phrases show **checking** on Cavan’s phone and appear in a **Check Cavan’s phrases** queue on the GM’s phone only. **Reject** one: it’s struck through for Cavan and frees a slot, so Cavan writes another. **Approve** the rest.
12. Fill everyone’s quota. **Start the game** on the GM’s phone stays refused while anything is pending or someone connected is short of approved phrases.

## Pick teams by hand

1. In a fresh room, choose **Pick them myself** on Alex’s phone, then press **Everyone’s in**.
2. Every screen shows **Pick the teams** with empty team cards and no wheel. Only Alex’s phone has the **Not on a team yet** list, with one button per team for each player.
3. Tap a team for each player. The first player placed on a team gets **CAPTAIN** and can save the team name. Other phones can’t move anyone.
4. **Spin the wheel for the rest** (under the list) runs the wheel for everyone still unplaced. Each spin fills the smallest team, so sides stay even. It also works after a normal wheel if someone is left over.
5. Join a new phone while teams are being made: they appear in **Not on a team yet**, not the waiting room. If the wheel is spinning, it draws them too.
6. **Start writing phrases** unlocks once everyone connected is on a team, every team has a connected member, and every team has a saved name. Anyone who joins after that waits for the GM.

## Walk through a game

Continue from the writing walkthrough. Two or three phrases each keeps the rounds short; the GM can set **Phrases per player** and **Round length** in the lobby.

1. **Start the game.** Every screen shows the round 1 intro (“Describe it”). Each phone taps **Got it**; when every connected player has, the turn screen appears. The GM can skip the wait with **Start the round now**.
2. The host shows who’s up and their team. The order alternates teams: the first player of team A, then of team B, then the second of team A, and so on. **Disconnect** whoever is up, wait 20–25 seconds, and check their next teammate takes the turn instead.
3. The GM presses **Start …’s turn**. The active phone shows a 3-2-1 countdown, then the phrase. The host and other phones never show it, only the clock and the score so far.
4. On the active phone, press **Got it** (+1, new phrase) and **Back** (−1, the previous phrase returns). The GM can **Pause**, change the time with **−10 s / +10 s** while paused, **Resume**, **End turn** and **Reveal** (shows the GM the current phrase).
5. Let the clock run out. The server ends the turn even if every phone is asleep. Review shows the guessed phrases on every screen. The active phone can step **Back** and **Forward** over the last guesses, and sees the phrase in play when time ran out as **NOT COUNTED**. The GM presses **Proceed**: the points are banked and the next team is up.
6. Guess the whole pile in one turn. The clock stops, and after **Proceed** round 2 (“Charades”) opens with the same player keeping the time they had left. Round 3 is “One word”.
7. **Skip a turn:** before a turn starts, the GM opens **Turn options** and taps **Skip …’s turn**. The next teammate is up with the same time, and the turn stays with that team. **Turn options** lists the skipped player under "Goes next for their team". After the other team plays, the skipped player is up for their team. With nobody else on the team connected, **Skip** is disabled and says why.
8. **Restart previous turn** on the GM’s phone (before the next turn starts) undoes the last Proceed and replays that turn with the chosen time.
9. Tap emotes on any phone. They pop up at random spots on the host, each a different size and tilt.
10. After round 3 the results show the winner, or “It’s a tie” for equal top scores, and a podium of the top three describers (the points go to whoever was describing; ties share a pedestal). **Play again** returns everyone connected to the lobby with fresh teams; disconnected players are dropped and can rejoin by name.

## Failure and permission checks

- **Host mirrors:** open the host iframe’s URL in another tab (including its `?device=test-host` suffix). Both host screens must stay live. In normal play, opening `/host/CODE` in another tab of the browser that created the room also works. A different browser without the room’s saved host key cannot reclaim it; it can join as a player.
- **Player identity:** normal tabs share localStorage, so opening the same player URL in another normal tab reclaims that player and replaces the old player socket. Incognito windows also share their incognito session with each other. Use the test desk, separate browser profiles, Firefox containers, different browsers or actual phones for independent players.
- **Refresh mid-spin:** reload the host or a phone while the wheel is moving. The draft continues from server state, without a new result or duplicated member.
- **GM disconnect:** disconnect Alex and wait 20–25 seconds. GM passes to the next connected player. Alex’s return does not automatically take GM back.
- **Disconnected winner:** disconnect or kick a player while they are on the wheel. They are skipped once the server knows they are inactive/removed, and the remaining draft continues. Abrupt phone loss takes the normal presence-detection interval to become known.
- **Late arrival:** join a new player after **Everyone’s in** but before **Start writing phrases**. They land in the pool of unplaced players (drawn by a spinning wheel, or placed by the GM). After teams are final they wait instead: during writing or mid-game the GM’s phone shows **Put on …** buttons for them, and once placed they join that team’s rotation.
- **Active player drops mid-turn:** disconnect the active phone during a turn. After 20–25 seconds the turn goes to review (“left the game”); the guessed phrases still count once the GM proceeds. Kicking the active player does the same. A kicked player’s phrases stay in the pile.
- **Game server unavailable:** stop only the party worker and try a fresh room. After eight seconds the screen shows connection help and **Try again**. Restart the worker: the pending code and settings are retained.
- **Cavan permissions:** only the GM can make or clear Cavan or approve/reject phrases. Designating Cavan after they’ve written sends their phrases back for vetting; clearing Cavan approves anything pending.

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
pnpm --filter @tmn/party e2e:game
```

The two `e2e` commands need the running party worker (`pnpm dev`, or just `pnpm --filter @tmn/party dev`). `e2e` takes roughly 40 seconds and exercises real WebSockets, including host mirrors, role handoff, timed server wheel progression, captain naming, GM corrections, late arrivals, phrase privacy and deletion. `e2e:game` (about a minute) plays a whole game: Cavan vetting, the round 1 intro, phrase secrecy mid-turn, a pile-out carried into round 2, the server clock ending a turn, a skip that keeps the turn on the team, pause/add time/end turn, emotes, results and Play again. `PARTY_HOST` overrides the worker address when needed. Unit/property tests freeze reducer inputs and check invariants, including balanced assignments and the injected clock/RNG; `game.property.test.ts` throws random turn buttons, GM controls, clock jumps and disconnects at a started game.

The six-player browser flow is also checked with independently controlled frames: all screens receive the draft, captain names and writing transition; a phone reload survives a spin; all players can fill their quotas; host/other players cannot see private phrases; and disconnect/reconnect retains identity and phrases.

A full game was also played in headless Firefox with a real host screen and a phone driven through its UI: writing, the round intro, a turn (countdown, Got it, review), results and emotes on the TV.

## End-to-end checks in CI

`.github/workflows/ci.yml` has an `e2e` job next to the usual `check` job. On every push to `main` and every PR it:

1. installs dependencies,
2. starts the party worker in the background with `pnpm --filter @tmn/party dev`. This is `wrangler dev`, which runs the Worker and Durable Objects locally in Miniflare, so it needs no Cloudflare account or secrets,
3. waits up to 60 s for port 8787,
4. runs `pnpm --filter @tmn/party e2e` and then `pnpm --filter @tmn/party e2e:game`,
5. prints the worker log if anything failed.

To add a new end-to-end check, put it in one of the two scripts (or add a new `scripts/*.mjs` plus a `package.json` script and a `run:` step in the job). Each script picks a random lobby code, so checks don't interfere. The job shows up in the **Actions** tab on GitHub once the workflow is pushed.

To reproduce the CI run locally:

```sh
pnpm --filter @tmn/party dev &   # or pnpm dev
pnpm --filter @tmn/party e2e && pnpm --filter @tmn/party e2e:game
```
