import * as CONST from '../public/js/const.js'

export const SCENARIOS = [
  {
    id: 'opening',
    label: 'Opening turn',
    description: 'Setup complete: two settlements and two roads each, with normal starting resources.',
  },
  {
    id: 'midgame',
    label: 'Midgame',
    description: 'Four points each, expanded roads, a city, and hands ready for building or trading.',
  },
]

const MIDGAME_HANDS = [
  { S: 0, L: 1, B: 1, O: 3, W: 2 },
  { S: 1, L: 2, B: 2, O: 1, W: 1 },
  { S: 2, L: 1, B: 1, O: 1, W: 2 },
  { S: 1, L: 1, B: 1, O: 3, W: 1 },
]

const landEdge = edge => !edge.corner1.surroundedBySea() && !edge.corner2.surroundedBySea()
const yieldScore = corner => corner.tiles.reduce((score, tile) =>
  score + (CONST.TILE_RES[tile.type] ? 6 - Math.abs(7 - Number(tile.num)) : 0), 0)
const byYield = (a, b) => yieldScore(b) - yieldScore(a) || a.id - b.id

function startingLocation(game) {
  const player = game.getPlayer(game.active_pid)
  const ownedResources = new Set(player.pieces.S.flatMap(id =>
    game.board.findCorner(id).tiles.map(tile => CONST.TILE_RES[tile.type]).filter(Boolean)))
  const score = corner => yieldScore(corner) + 2 * new Set(corner.tiles
    .map(tile => CONST.TILE_RES[tile.type]).filter(resource => resource && !ownedResources.has(resource))).size
  const corner = game.board.getSettlementLocations(-1)
    .sort((a, b) => score(b) - score(a) || a.id - b.id)[0]
  if (!corner) throw new Error('Scenario has no legal starting settlement')
  // Aim the opening road toward a productive future intersection.
  const roads = corner.getEdges(-1).filter(landEdge)
  const expansionScore = edge => edge.jumpCorner(corner).getEdges(-1)
    .filter(next => next.id !== edge.id && landEdge(next))
    .reduce((best, next) => Math.max(best, yieldScore(next.jumpCorner(edge.jumpCorner(corner)))), 0)
  roads.sort((a, b) => expansionScore(b) - expansionScore(a) || a.id - b.id)
  if (!roads.length) throw new Error('Scenario has no legal starting road')
  return { settlement: corner.id, road: roads[0].id }
}

function expansionPath(game, player) {
  const sources = new Map()
  for (const id of player.pieces.R) {
    const edge = game.board.findEdge(id)
    for (const corner of [edge.corner1, edge.corner2]) {
      if (!corner.player_id || corner.player_id === player.id) sources.set(corner.id, corner)
    }
  }
  let frontier = [...sources.values()].sort((a, b) => a.id - b.id).map(corner => ({ corner, roads: [] }))
  const visited = new Set(sources.keys())
  // The fixture needs only one expansion per seat; fail clearly if the board changes.
  for (let distance = 0; distance <= 4 && frontier.length; distance++) {
    const candidates = frontier.filter(({ corner }) =>
      !corner.piece && !corner.surroundedBySea() && corner.hasNoNeighbours())
    if (candidates.length) return candidates.sort((a, b) => byYield(a.corner, b.corner))[0]
    const next = []
    for (const { corner, roads } of frontier) {
      for (const edge of corner.getEdges(-1).filter(landEdge).sort((a, b) => a.id - b.id)) {
        const target = edge.jumpCorner(corner)
        if (visited.has(target.id) || (target.player_id && target.player_id !== player.id)) continue
        visited.add(target.id)
        next.push({ corner: target, roads: [...roads, edge.id] })
      }
    }
    frontier = next
  }
  throw new Error(`Scenario has no legal expansion for player ${player.id}`)
}

function fixedDeck() {
  const cards = [...CONST.DEVELOPMENT_CARDS_DECK]
  let seed = 20261031
  for (let i = cards.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

/** Populate a fresh 2–4-seat game; normal game actions remain in charge afterward. */
export function applyScenario(game, scenarioId) {
  if (!SCENARIOS.some(scenario => scenario.id === scenarioId)) throw new Error('Unknown playtest scenario')
  if (game.state) throw new Error('Scenarios require a fresh game')
  if (game.player_count < 2 || game.player_count > 4 || game.players.filter(Boolean).length !== game.player_count) {
    throw new Error('Scenarios require two to four occupied seats')
  }
  Object.assign(game.config, {
    timer: false, auto_roll: false, map_shuffle: 'none', mapkey: CONST.DEFAULT_MAPKEY, scenarioId,
  })
  game.dev_cards = fixedDeck()
  game.start()
  for (let placement = 0; placement < game.player_count * 2; placement++) {
    const { settlement, road } = startingLocation(game)
    game.initialBuildIO(game.active_pid, settlement, road)
  }
  if (game.state !== CONST.GAME_STATES.PLAYER_ROLL) throw new Error('Scenario setup did not reach the first turn')

  if (scenarioId === 'midgame') {
    for (const player of game.players) {
      const city = player.pieces.S.map(id => game.board.findCorner(id)).sort(byYield)[0]
      const { corner, roads } = expansionPath(game, player)
      for (const road of roads) game.build(player.id, 'R', road)
      if (!game.board.getSettlementLocations(player.id).some(location => location.id === corner.id)) {
        throw new Error(`Scenario expansion is not connected for player ${player.id}`)
      }
      game.build(player.id, 'S', corner.id)
      game.build(player.id, 'C', city.id)
      player.takeCards(Object.fromEntries(Object.keys(CONST.RESOURCES).map(key => [key, player.closed_cards[key]])))
      player.giveCards(MIDGAME_HANDS[player.id - 1])
    }
    game.turn = 8
  }
  return game
}
