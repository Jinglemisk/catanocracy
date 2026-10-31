# Catanocracy

General specification · 2026-10-31

Catanocracy is a browser multiplayer Catan variant built from
[bigomega/catan](https://github.com/bigomega/catan). It aims to add Hegemony's Assembly:
players propose resolutions, negotiate, vote, and live under the laws they pass.

The priorities are replaceable artwork, rules that can be tuned consistently, and
an Assembly that fits into an otherwise ordinary game of Catan.

This document defines the direction and records the starting defects. The preview
now includes solo hotseat playtesting, prepared scenarios and resource controls,
plus targeted action/reconnect repairs. Assembly, the remaining rule fixes,
asset replacement, and expanded configuration described here are planned work.
The current next steps are in [docs/plan.md](docs/plan.md).

## Starting point

Upstream baseline: `6f05d58e9d30b20082f4ef980fc6c8b350ea92cb`
(2026-09-30). The upstream default branch is `master`.

Keep the existing browser interface, Node server, and Socket.IO multiplayer as the
starting point. No framework migration is required. The server remains the
authority for actions, prices, resource transfers, and votes.

The first supported rules baseline is ordinary three- or four-player Catan:
settlements, roads, cities, a finite resource bank, the standard development deck,
trading, the robber, Longest Road, Largest Army, and victory on your own turn.
Upstream also allows two players, but that is not evidence of an implemented
official two-player variant. Expansions and larger player counts need their own
rules and board validation; they are outside the first milestone.

The initial project setup does not approve every proposed card, price, or timing
below. Use the labels here when implementing: a confirmed requirement is different
from a playtest starting value.

## Known shortcomings

These findings come from the source review on 2026-10-31. Since that review,
roll/end-turn now check actor and phase, robber discards validate the exact hand
and amount, stale sockets cannot clear a replacement connection, and session-clear
returns before mutation for an incorrect secret. Focused scenario and hotseat
tests now run through `npm test`. The table retains the original findings; these
repairs do not complete the broader rule or session audit. A full multiplayer
playthrough is still required.

| Finding | Evidence and consequence | Intended correction |
| --- | --- | --- |
| Unlimited resource supply | Production and bank trades add resources without tracking a shared bank stock in `models/game.js`. | Track the bank and apply ordinary shortage rules. Keep an unlimited-bank option only as an explicit variant. |
| Incorrect robber probabilities | `Player.takeRandomResources` picks uniformly among resource types. A focused probe with nine lumber and one ore returned 50/50 across evenly spaced random values. | Sample individual cards: that hand should produce 90/10 odds. Use the same correction for random discards. |
| Victory outside the winner's turn | The victory callback checks the score but not whose turn it is. Longest Road can change on another player's turn. | Claim victory only on the qualifying player's turn, including at its start. |
| Incomplete action validation | Roll and end-turn handlers advance the game without checking their caller. Other actions and reconnects also need review. | Validate the acting seat, phase, payload, resources, and ownership on the server before mutation. |
| Session administration defect | The session-clear route sends a rejection for a wrong salt but does not return, so deletion can continue. The default salt is fixed. | Remove development administration from shared gameplay or enforce authorization and return before any mutation. |
| Rules scattered through gameplay and UI | Building costs are shared constants, but other limits and checks are embedded in handlers. Most advanced settings lack a normal interface. | Introduce a small, validated ruleset and shared effective-rule calculations. |
| Artwork provenance incomplete | The author says images and sounds were acquired online and edited. The repository includes an MIT code license, but no asset-by-asset permission inventory. | Preserve code attribution; inventory and replace art/audio with assets whose reuse terms are recorded. |
| No automated regression suite | The upstream test command is a placeholder. | Add focused checks for repaired rules, effective costs, and Assembly multiplayer behaviour. |
| Games are held in memory | A server restart removes active rooms. | State this limitation. Decide on persistence when needed; do not imply reconnect support means restart recovery. |

Do not import findings from OpenCatan into this project's bug list. In particular,
this upstream already constructs a finite standard development-card deck; the
probability-based development-card bug belonged to the other candidate.

## Configuration

Audit what already exists before adding another setting. Upstream configuration
already includes player count, victory target, timers for setup/rolling/actions/
robber choices, automatic rolling, a limit on trade requests, Longest Road and
Largest Army thresholds, custom board descriptions, and selective shuffling of
terrain, numbers, and ports. Most are supplied through a configuration object,
rather than a finished lobby panel. Discarding above seven and many other rules
remain hardcoded.

The intended rule groups are:

- Construction: costs, piece supplies, placement restrictions, and city upgrades.
- Production: settlement/city yields, terrain resources, bank quantities, and
  shortage behaviour.
- Trade: bank and port ratios, allowed trading windows, and offer limits.
- Robber: discard threshold and amount, eligible targets, movement and stealing.
- Cards: development-deck composition, purchase cost, and play restrictions.
- Progress: achievement thresholds, victory target, and victory timing.
- Turns and setup: player count, placement order, starting resources, clocks,
  board selection, and shuffling.
- Assembly: enable/disable, cadence, voting rule, proposal/repeal costs, author
  rewards, active-law limits, protection, and the available resolution deck.

Numerical values and supported rule choices should be data. A fundamentally new
mechanic still requires code and interface work. Avoid a general scripting system
or arbitrary rules language in the first version.

Each room owns its validated starting ruleset. Only its host changes settings
before play. All players can inspect the effective settings. Reject invalid values
and unsupported combinations instead of silently accepting them. Keep standard
Catan as a reproducible preset, and record a room's ruleset with its session state.

Standing laws modify the room's starting rules through one calculation path. For
example, a settlement normally costs one wool; a law removes that requirement;
repeal restores the configured starting cost. The displayed price, affordability
check, and actual payment must agree. Do not permanently overwrite the starting
rules or let a law affect other rooms.

## Assembly

### Required direction

- Each player has exactly one vote in the initial version. Settlements, cities,
  resource wealth, and population do not add votes. No population or influence
  economy is imported from Hegemony.
- Normal play pauses for a scheduled Assembly and resumes after its resolution.
- Players choose proposals; the game does not automatically impose random laws.
- Proposals stay private until the reveal. Votes and outcomes are public.
- Laws change rules for the whole table and can later be repealed. A directive is
  a one-time action and does not occupy a standing-law slot.
- Keep the system optional so the same application can play baseline Catan.

### Proposed first playtest rules

These values are candidates, not settled balance decisions:

| Choice | Initial proposal |
| --- | --- |
| Schedule | After every two complete rounds, first after every player has taken two normal turns |
| Agenda | At most one proposal per player; pass, draw from a chosen politician, or propose an eligible repeal |
| Draw | Pay one resource of any type to the bank; inspect privately; propose or discard; no redraw or held card for a later sitting |
| Repeal | Pay one resource to put an eligible standing law on the ballot |
| Voting | Every player votes yes or no; more yes than no passes; ties fail |
| Order | Rotate the first Assembly speaker between sittings; keep normal Catan turn order unchanged |
| Reward | A successfully enacted law/directive pays its author one resource printed for its politician, subject to bank availability; repeals and failures pay nothing |
| Standing laws | At most four; a new law at the limit replaces the oldest law only if it is removable |
| Minimum tenure | Protect a law during its passing sitting and the following sitting; a law passed at Assembly 1 first becomes removable at Assembly 3 |
| Conflicting prices | At most one construction-price law; a new one replaces the existing one only when removal is allowed |
| Card reuse | Discard failed proposals, resolved directives, and removed laws; reshuffle a politician's discards when its deck runs out |

For the first prototype, follow Hegemony's oldest-law replacement rule exactly:
if the oldest law is protected, do not skip it to remove a newer law. Block the
replacement. Recheck legality when each ballot resolves, because earlier results
may invalidate later proposals. An invalidated proposal has no effect or reward.
Track enactment order even when several laws pass in one sitting. Laws persist
until removed; minimum tenure is not an expiry timer.

Allow ordinary resource-for-resource trades between any two players during
preparation. Close outstanding offers at reveal. Discussion and non-binding
promises can continue while voting, but no resource transfers occur then. Direct
payments for votes, gifts, bought extra votes, abstentions, and chair tie-breaks
would be separate rule decisions. Do not add them silently.

Start with four small politician piles: production/resource protection, city
development, settlement/road/port interests, and targeted directives. Their names
may retain Hegemony's flavour. Rewrite their effects for Catan; do not carry over
population loss, unrest, upkeep, or skipped personal income literally.

Illustrative resolutions for review:

- Colonial Charter: settlements cost no wool; cities cost one additional ore.
- Master Builders: cities cost two ore and two grain; settlements cost one
  additional brick. This conflicts with Colonial Charter as a price law.
- Harbour Dues: everyone may trade three identical resources for one; specialised
  2:1 ports instead operate at 3:1 while the law stands.
- Grain Riot: a named rival discards two resources of their choice, or their
  remaining hand if smaller.

These are examples, not an approved or balanced deck. Keep normal Catan victory
for the initial proposal; an Assembly victory-point award needs a separate
decision. Avoid a deck dominated by price laws, since protection would block too
many proposals. Test the three- and four-player coalition dynamics separately.

### Multiplayer behaviour

The server stores the sitting, private draws, sealed proposals, public ballot,
votes, results, active laws, authors, and enactment order. Send each player only
the private information they are entitled to see. Reconnects restore the correct
view without disclosing another player's proposal.

Normal construction, dice, card play, and turn timers cannot advance the game
while an Assembly is open. A duplicate vote or retried request cannot apply an
effect twice. Keep a public record of enacted and repealed laws. A disconnect
must not silently become a yes vote; define timeout and abandoned-room behaviour
before the first multiplayer Assembly playtest.

## Replaceable assets

Use stable names for terrain, pieces, resources, card faces/backs, icons, number
tokens, backgrounds, and audio. One asset mapping should resolve those names to
files and presentation information. Gameplay must not depend on filenames, image
dimensions, colours, or sprite-sheet coordinates.

Accept SVG and raster images where appropriate. Introduce individual asset files
as needed rather than requiring an immediate redraw of everything. Keep existing
sprite sheets behind an adapter until replaced. A missing image should have a
readable fallback. Record source, creator, permission/license, and attribution for
new assets. The initial preview retains upstream art; it is not an original
Catanocracy art set.

## Delivery order and acceptance

1. Establish the checkout, private preview, this spec, and one current plan.
2. Repair and verify the base rules and server action boundaries. Complete a
   three-/four-player smoke game before attributing balance problems to laws.
3. Centralise the rules needed for tuning and the first law effects. Expose the
   existing settings through a functioning lobby; add missing ones incrementally.
4. Add the asset mapping and replace assets independently of gameplay. This can
   proceed alongside rule work without a UI-framework rewrite.
5. Implement Assembly end to end with a small reviewed deck, then playtest cadence,
   coalition formation, law protection, rewards, and meeting duration.

Use focused regression cases for resource conservation/shortages, card-weighted
theft, own-turn victory, and consistency between displayed and paid costs. The
Assembly warrants tests for private proposals, repeated requests, tie failure,
repeals, protected replacement, conflicting laws, restoration after repeal, and
resuming the correct turn. Verify a real multi-client game as well; engine checks
alone do not prove room synchronization.

Before broader release, review session identity, authorization, reconnects, and
administration endpoints, then decide whether rooms must survive server restarts.
Keep the preview on Tailscale while these remain unresolved.

## References

- [Upstream repository](https://github.com/bigomega/catan)
- [Official Catan rules](https://www.catan.com/understand-catan/game-rules)
- [Official Catan FAQ](https://www.catan.com/faq/basegame)
- [Hegemony Assembly rules](https://github.com/Jinglemisk/hegemony/blob/main/rules.md#the-assembly)
- Local evidence: `models/game.js`, `models/player.js`, `public/js/const.js`, and
  the artwork statement in `public/js/ui/accessibility_ui.js`.
