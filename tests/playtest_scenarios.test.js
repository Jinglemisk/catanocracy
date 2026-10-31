import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { SCENARIOS, applyScenario } from '../models/playtest_scenarios.js'

function createGame(playerCount) {
  const game = new Game({
    id: 'fixture-test',
    host: { id: 1, name: 'Player 1' },
    config: { ...CONST.GAME_CONFIG, player_count: playerCount, timer: false, auto_roll: false },
    io: { to: () => ({ emit() {} }) },
    onGameEnd() { assert.fail('A starting scenario must not finish the game') },
  })
  while (game.players.filter(Boolean).length < playerCount) game.join()
  return game
}

function assertLegalHistory(game) {
  const board = new Board(game.config.mapkey)
  const setupBuilds = game.player_count * 4
  game.map_changes.forEach(({ pid, piece, loc }, index) => {
    if (piece === 'R') {
      const edge = board.findEdge(loc)
      assert.ok(edge, `Road ${loc} exists`)
      assert.ok(!edge.road, `Road ${loc} is unoccupied`)
      assert.ok(!edge.corner1.surroundedBySea() && !edge.corner2.surroundedBySea(), 'Road stays on land')
      const connected = [edge.corner1, edge.corner2].some(corner =>
        corner.player_id === pid || (!corner.piece && corner.getEdges(pid).length))
      assert.ok(connected, `Road ${loc} connects to player ${pid} without passing an opponent`)
      if (index < setupBuilds) {
        const previous = game.map_changes[index - 1]
        assert.equal(previous.piece, 'S')
        assert.equal(previous.pid, pid)
        assert.ok([edge.corner1.id, edge.corner2.id].includes(previous.loc), 'Setup road touches its settlement')
      }
    } else {
      const corner = board.findCorner(loc)
      assert.ok(corner, `Building ${loc} exists`)
      if (piece === 'S') {
        assert.ok(!corner.piece, `Settlement ${loc} is unoccupied`)
        assert.ok(!corner.surroundedBySea(), 'Settlement touches land')
        assert.ok(corner.getEdges().every(edge => !edge.jumpCorner(corner).piece), 'Settlement obeys distance rule')
        if (index >= setupBuilds) assert.ok(corner.getEdges(pid).length, 'Expansion connects to its road')
      } else {
        assert.equal(piece, 'C')
        assert.equal(corner.piece, 'S', 'City upgrades a settlement')
        assert.equal(corner.player_id, pid, 'City upgrades its own settlement')
      }
    }
    board.build(pid, piece, loc)
  })
  for (const player of game.players) {
    for (const piece of ['S', 'C', 'R']) {
      assert.ok(player.pieces[piece].length <= CONST.PIECES_COUNT[piece], 'Piece supply is respected')
      for (const loc of player.pieces[piece]) {
        if (piece === 'R') assert.equal(board.findEdge(loc).road, player.id)
        else {
          assert.equal(board.findCorner(loc).piece, piece)
          assert.equal(board.findCorner(loc).player_id, player.id)
        }
      }
    }
  }
}

function snapshot(game) {
  return {
    state: game.state, active: game.active_pid, turn: game.turn,
    changes: game.map_changes, deck: game.dev_cards,
    players: game.players.map(player => ({
      id: player.id, pieces: player.pieces, hand: player.closed_cards,
      points: player.public_vps, ports: player.trade_offers,
    })),
  }
}

for (const playerCount of [2, 3, 4]) {
  for (const { id } of SCENARIOS) {
    test(`${id}: ${playerCount} seats have a legal, repeatable, playable position`, () => {
      const game = applyScenario(createGame(playerCount), id)
      assertLegalHistory(game)
      assert.equal(game.state, CONST.GAME_STATES.PLAYER_ROLL)
      assert.equal(game.active_pid, 1)
      assert.equal(game.expected_actions.length, 1)
      assert.equal(game.expected_actions[0].type, CONST.GAME_STATES.PLAYER_ROLL)
      assert.equal(game.expected_actions[0].pid, 1)
      assert.equal(game.config.timer, false)
      assert.equal(game.dice_rolls.length, 0)
      assert.deepEqual([...game.dev_cards].sort(), [...CONST.DEVELOPMENT_CARDS_DECK].sort())
      assert.deepEqual(snapshot(game), snapshot(applyScenario(createGame(playerCount), id)))

      for (const player of game.players) {
        assert.equal(player.resource_count, Object.keys(CONST.RESOURCES)
          .reduce((sum, key) => sum + player.closed_cards[key], 0))
        assert.equal(player.can_play_dc, player.id === 1)
        if (id === 'opening') {
          assert.equal(player.pieces.S.length, 2)
          assert.equal(player.pieces.C.length, 0)
          assert.equal(player.pieces.R.length, 2)
          assert.equal(player.public_vps, 2)
          const expected = Object.fromEntries(Object.keys(CONST.RESOURCES).map(key => [key, 0]))
          for (const tile of game.board.findCorner(player.pieces.S[1]).tiles) {
            const resource = CONST.TILE_RES[tile.type]
            if (resource) expected[resource]++
          }
          for (const key of Object.keys(CONST.RESOURCES)) assert.equal(player.closed_cards[key], expected[key])
        } else {
          assert.equal(player.pieces.S.length, 2)
          assert.equal(player.pieces.C.length, 1)
          assert.ok(player.pieces.R.length > 2)
          assert.equal(player.public_vps, 4)
          assert.equal(player.resource_count, 7)
          assert.ok(['S', 'C', 'R', 'DEV_C'].some(piece => player.canBuy(piece)), 'Every seat can afford a build')
        }
      }
      game.playerRollIO(1)
      assert.equal(game.dice_rolls.length, 1, 'Normal turn actions resume after loading')
      assert.ok([CONST.GAME_STATES.PLAYER_ACTIONS, CONST.GAME_STATES.ROBBER_MOVE].includes(game.state))
    })
  }
}

test('scenario loading rejects unknown scenarios and an already-started game', () => {
  const game = createGame(2)
  assert.throws(() => applyScenario(game, 'missing'), /Unknown playtest scenario/)
  assert.equal(game.state, undefined)
  applyScenario(game, 'opening')
  const before = structuredClone(snapshot(game))
  assert.throws(() => applyScenario(game, 'midgame'), /fresh game/)
  assert.deepEqual(snapshot(game), before)
})
