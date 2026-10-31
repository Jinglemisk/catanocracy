import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { applyScenario } from '../models/playtest_scenarios.js'

function game() {
  const game = new Game({ id: 'flow', host: { id: 1 },
    config: { ...CONST.GAME_CONFIG, player_count: 4, hotseat: true, timer: false },
    io: { to: () => ({ emit() {} }) }, onGameEnd() {} })
  for (let i = 1; i < 4; i++) game.join()
  return applyScenario(game, 'midgame')
}
const resources = count => ({ S: count, L: count, B: count, O: count, W: count })

function roll(t, game, numbers) {
  const rng = t.mock.method(Math, 'random', () => numbers.shift() / 6 - 0.01)
  game.playerRollIO(1)
  rng.mock.restore()
}

test('controlled seats can trade, build, and hand the turn on without inactive-seat commands advancing it', t => {
  const g = game()
  g.endTurnIO(1)
  assert.equal(g.state, CONST.GAME_STATES.PLAYER_ROLL)
  g.playerRollIO(2)
  assert.equal(g.dice_rolls.length, 0)
  roll(t, g, [1, 1])
  assert.equal(g.state, CONST.GAME_STATES.PLAYER_ACTIONS)
  g.setPlaytestResources(1, resources(4), 'set')
  g.setPlaytestResources(2, resources(4), 'set')
  g.tradeRequestIO(1, 'Px', { L: 1 }, { O: 1 })
  assert.equal(g.ongoing_trades.length, 1)
  assert.equal(g.toJSON().ongoing_trades[0].status, 'open', 'Offer survives seat reload')
  g.tradeResponseIO(2, 0, true)
  assert.equal(g.getPlayer(1).closed_cards.L, 3)
  assert.equal(g.getPlayer(1).closed_cards.O, 5)
  assert.equal(g.getPlayer(2).closed_cards.L, 5)
  assert.equal(g.getPlayer(2).closed_cards.O, 3)
  const player = g.getPlayer(1), city = player.pieces.S[0]
  g.clickedLocationIO(1, CONST.LOCS.CORNER, city)
  assert.equal(g.board.findCorner(city).piece, 'C')
  assert.equal(player.public_vps, 5)
  g.endTurnIO(2)
  assert.equal(g.active_pid, 1)
  g.playerRollIO(1)
  assert.equal(g.dice_rolls.length, 1, 'Duplicate roll cannot skip the action phase')
  g.endTurnIO(1)
  assert.equal(g.active_pid, 2)
  assert.equal(g.state, CONST.GAME_STATES.PLAYER_ROLL)
})

test('four seats finish one robber discard each, including a hand still above seven after discarding', t => {
  const g = game()
  for (let pid = 1; pid <= 4; pid++) g.setPlaytestResources(pid, resources(4), 'set')
  roll(t, g, [3, 4])
  assert.equal(g.state, CONST.GAME_STATES.ROBBER_DROP)
  assert.deepEqual(g.toJSON().robbing_players, [1, 2, 3, 4])
  assert.throws(() => g.setPlaytestResources(1, resources(0), 'set'), /Finish any robber action/)
  for (const invalid of [resources(3), resources(-2), { dK: 10 }, { S: 10 }]) {
    g.robberDropIO(1, invalid)
    assert.equal(g.getPlayer(1).resource_count, 20)
  }
  g.robberDropIO(1, resources(2))
  assert.equal(g.getPlayer(1).resource_count, 10)
  assert.deepEqual(g.toJSON().robbing_players, [2, 3, 4], 'Reload knows this seat already discarded')
  g.robberDropIO(1, resources(1))
  assert.equal(g.getPlayer(1).resource_count, 10, 'Cannot discard twice for the same seven')
  for (let pid = 2; pid <= 4; pid++) g.robberDropIO(pid, resources(2))
  assert.equal(g.state, CONST.GAME_STATES.ROBBER_MOVE)
  const tile = g.board.getRobbableTiles()[0]
  g.robberMoveIO(2, tile)
  assert.equal(g.state, CONST.GAME_STATES.ROBBER_MOVE)
  g.robberMoveIO(1, tile)
  assert.equal(g.state, CONST.GAME_STATES.PLAYER_ACTIONS)
})

test('late socket disconnect cannot erase the replacement connection', () => {
  const g = game(), old = new EventEmitter(), replacement = new EventEmitter()
  old.id = 'old'; replacement.id = 'replacement'
  let disconnects = 0
  old.on('disconnect', () => disconnects++)
  g.setUpPlayerSocket(1, old)
  g.setUpPlayerSocket(1, replacement)
  g.removePlayerSocket(1, old)
  assert.equal(g.getPlayerSoc(1), replacement)
  assert.equal(g.getPlayer(1).online, true)
  old.emit('disconnect')
  assert.equal(disconnects, 1, 'Removing game commands preserves server cleanup')
  old.emit(CONST.SOCKET_EVENTS.ROLL_DICE)
  assert.equal(g.dice_rolls.length, 0, 'Superseded socket cannot issue commands')
})
