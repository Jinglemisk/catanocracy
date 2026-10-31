# Catanocracy — current plan

Updated: 2026-10-31

The direction and baseline defects are in [SPEC.md](../SPEC.md). This is the single
current engineering plan. Assembly and CPU opponents are not implemented yet.

## Available now

- Public source at https://github.com/Jinglemisk/catanocracy, with upstream
  attribution and the MIT code license retained.
- Solo hotseat for 2–4 seats: click a right-side portrait to change the controlled
  hand without advancing the turn. Normal multiplayer remains separate.
- Repeatable opening and midgame positions, selectable at launch or in Devtools.
  Midgame gives each player four points and a useful seven-card hand.
- Devtools can reload/change scenarios and add/set a chosen player's resources.
  Timers are off; resource edits wait until any mandatory robber prompt finishes.
- The left toolbar ends with a red Devtools button. A collapsible game log docked
  above the bottom bar on the left replaces bottom messages. Routine prompts are
  compact, and held development cards appear as individual faces in the hand
  alongside resources. Unavailable
  action cards are gray, including newly bought copies when an older copy is
  playable. Logs are kept per room and selected seat in the current browser tab.
- Roll/end-turn actor and phase checks, validated robber discards, and a reconnect
  fix so a late disconnect cannot clear the current connection. Reloads preserve
  pending discards, including when a discarded hand still exceeds seven cards.
- The session-clear wrong-secret fall-through is fixed. Solo controls require a
  separate browser ownership token, never included in the public game snapshot.
- [CPU research](ai-cpu.md): native JavaScript heuristics are the recommended first
  opponent. Existing external engines require substantial adapters.

## Next

1. Finish base-game correctness: card-weighted random theft/discards, finite bank
   accounting and shortages, own-turn victory, then remaining server action
   validation. Review trade authorization, development cards, road interruption,
   ties, piece limits, reconnects and timeout choices in a complete game.
2. Add a player-specific observation, shared legal actions and validated dispatch.
   Reuse these for human and CPU controllers. Keep exact opponent hands and deck
   order outside CPU policy input. Add seeded randomness and action logs when the
   first CPU runner needs reproducible decisions.
3. Implement the first native heuristic CPU: legal setup, builds, bank/port trades,
   robber/discards, development cards and turn completion. Initially decline
   domestic trades and label that limitation. No model service is required.
4. Consolidate effective-rule calculations and expose existing settings; add
   missing configuration incrementally. Introduce the asset mapping alongside it.
5. Implement the optional Assembly with a small reviewed resolution deck. Both
   legal actions and CPU decisions must use the same effective rules as humans.

## Decisions for the first Assembly slice

Confirm the proposed cadence, costs/rewards, tenure and law limit in the spec;
review the Catan-specific deck and conflict rules; choose disconnect/timeout
behaviour during preparation and voting; decide whether normal Catan scoring
remains unchanged. Every player has one vote. These balance decisions do not
block base-game repairs, solo testing or CPU foundations.

## Verification and limits

The automated suite covers legal/repeatable positions for all six scenario and
player-count combinations, trade/build/turn flows, four-seat robber discards,
reconnect replacement, real HTTP/Socket.IO seat controls, rejected edits and
sandbox isolation from ordinary rooms. Browser checks cover the Solo launcher,
portrait switching and Devtools. This is not a complete-game rules audit.

Scenario reload restores the board, hands and deck, but future dice are random.
Rooms stay in memory and disappear on a process restart. The preview binds only to
Tailscale and uses PM2; no boot-time service has been installed. The inherited
multiplayer identity/admin model still needs review before broader exposure.
