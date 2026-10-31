# CPU opponents: preliminary research

Reviewed 2026-10-31. This is a recommendation, not an implemented CPU feature or
a benchmark of playing strength.

The inherited game has timer fallbacks for placement, rolls, discards and robber
movement. Those keep a stalled game moving; they do not plan purchases, builds
or trades. A seat with these fallbacks is not a CPU opponent.

## Recommendation

Build a small native JavaScript policy over Catanocracy's own legal actions first.
It requires no model training or separate service, and can use the same changing
rules as the Assembly. Importing another game's AI first would require maintaining
two representations of the rules before we have a stable one here.

1. **Create the decision boundary.** Expose a player-specific observation, legal
   actions, and a validated action dispatcher shared by human and CPU controllers.
   Reuse the existing board placement checks. Validate the acting player and phase
   on every command, including roll and end-turn.
2. **Make decisions reproducible.** Use the opening/midgame scenarios as fixtures;
   add seeded randomness and an action log. A random legal-action policy can test
   transitions, but is only a debugging baseline. The runner must handle discards
   and trade responses outside the active player's turn, bound decision time, and
   discard pending decisions when a scenario is replaced.
3. **Add a useful heuristic CPU.** Score starting positions by dice probability
   and resource diversity, choose reachable expansion sites, upgrade productive
   settlements, and trade with the bank/ports toward a selected build. Handle
   robber, discards and development cards. Initially decline player trade offers
   and make none; show that limitation in the CPU description.
4. **Improve after complete-game tests.** Add player trading and shallow search.
   Compare completion rate, illegal-action attempts and decision time before
   comparing win rates. Consider an external engine adapter only after these
   interfaces and the effective rules are stable.

The observation must contain the CPU's own private hand and only public information
about opponents. It must not expose opponents' exact hands, unrevealed development
cards, shuffled deck order or the mutable server game. Search needs beliefs or
sampled possible hands, not access to the real hidden state.

## Existing engines

| Candidate | Available capability | Integration assessment |
| --- | --- | --- |
| [Catanatron](https://github.com/bcollazo/catanatron) | Python simulator with random, weighted, greedy, AlphaBeta and MCTS players; GPL-3.0. | Useful reference and later benchmark. An adapter must translate board IDs, state, phases and actions, and reconcile rules. Not a drop-in JavaScript CPU. |
| [JSettlers2](https://github.com/jdmonin/JSettlers2) | Java game with robots and player negotiation; GPL-3.0-or-later. | More complete negotiation machinery, but tied to its Java game objects and message protocol. Extracting it is substantial work. |
| [8910work-cell/catan-ai](https://github.com/8910work-cell/catan-ai) | MIT JavaScript research project with heuristics, MCTS, TensorFlow.js and self-play scripts. | Potential algorithm reference. Only two commits were visible during review; rule coverage, fair information access and strength were not verified. It has its own engine, not a compatible bot interface. |

Catanatron's current engine supports domestic offer/accept/reject/confirm actions.
Its normal action generator includes bank trades and responses to offers, but does
not generate new player offers. The inspected random, weighted and AlphaBeta
policies choose from that generated list, so proactive negotiation still needs
policy work. Its player interface receives the complete game state; fair hidden
information is not enforced by that interface. See the
[action generator](https://github.com/bcollazo/catanatron/blob/main/catanatron/catanatron/models/actions.py),
[player interface](https://github.com/bcollazo/catanatron/blob/main/catanatron/catanatron/models/player.py),
[weighted policy](https://github.com/bcollazo/catanatron/blob/main/catanatron/catanatron/players/weighted_random.py)
and [AlphaBeta policy](https://github.com/bcollazo/catanatron/blob/main/catanatron/catanatron/players/minimax.py).

JSettlers2 has explicit offer creation, counteroffers, bank trades and accept/reject
decisions. Its robot uses build plans, opponent tracking and separate opening and
robber strategies. These are useful design references, not isolated components we
can paste into this server. See the
[negotiator](https://github.com/jdmonin/JSettlers2/blob/main/src/main/java/soc/robot/SOCRobotNegotiator.java)
and [robot architecture](https://github.com/jdmonin/JSettlers2/blob/main/src/main/java/soc/robot/SOCRobotBrain.java).

## Assembly compatibility

Neither established engine understands Catanocracy's Assembly. Legal actions and
CPU evaluation must read shared effective rules for costs, production, trade
ratios, piece limits and victory conditions. Hard-coded standard Catan assumptions
would make legal bots strategically wrong as soon as a law changes the economy.

A first voting policy can compare a proposal's expected production and build-cost
effects on itself and opponents. Proposal selection, repeal and other Assembly
prompts also need explicit legal actions and timeout behaviour. Trained policies
or external search engines would need matching rule changes and evaluation; they
will not acquire Assembly support through state translation alone.
