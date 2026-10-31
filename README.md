# Catanocracy

Browser Catan with solo playtesting and a planned Assembly where players vote on
laws that change the game.

Built on [bigomega/catan](https://github.com/bigomega/catan) by
[Bharath Raja (bigomega)](https://github.com/bigomega).

## Features

- **Multiplayer and hotseat:** 2–4 players; play every seat yourself by clicking
  player portraits.
- **Playtest modes:** opening and midgame scenarios, scenario reloads, and
  Devtools for changing player count and granting resources.
- **Configuration:** victory target, timers, automatic dice rolls, custom maps,
  and map shuffling. Advanced options currently use a configuration object.
- **Game UI:** a docked game log, dice statistics, compact prompts, and development
  cards in your hand, with unavailable cards grayed out.
- **Assembly — planned:** an optional law system inspired by Hegemony. Propose,
  vote, enact and repeal laws, with **one vote per player**.
- **Also planned:** broader rule configuration, replaceable asset packs, CPU
  opponents, and further base-game rule fixes.

See the [spec](SPEC.md) and [current plan](docs/plan.md). Two-player games use the
base rules; there is no dedicated two-player variant.

## Run

With Node.js 24:

```sh
npm ci
npm start
```

Open http://127.0.0.1:3000. Use `HOST` and `PORT` to change the listening address.
Games are stored in memory and disappear when the server restarts.
Run checks with `npm test`.

## License

Code is licensed under [MIT](LICENSE), with the original author's attribution
retained. Artwork and sound are inherited from upstream; their individual reuse
terms are not documented.

For a deeper Catan-like game with buildings and populations, try
[Hegemony](https://github.com/Jinglemisk/hegemony).
