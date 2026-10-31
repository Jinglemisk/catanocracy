import { randomBytes } from 'node:crypto'
import Game from './game.js'
import * as CONST from '../public/js/const.js'
import { SCENARIOS, applyScenario } from './playtest_scenarios.js'

const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict', maxAge: 5 * 60 * 60 * 1000 }

// Ownership is kept outside Game.toJSON(), never sent in the rendered game state.
export default class PlaytestRooms {
  #rooms = new Map()
  constructor(sessions, io) { this.sessions = sessions; this.io = io }

  owns(cookies, matchSeat = false) {
    const room = this.#rooms.get(cookies.game_id)
    return !!(room && room.expires > Date.now() && cookies.playtest_owner === room.token
      && this.sessions[cookies.game_id] === room.game
      && (!matchSeat || +cookies.player_id === room.selectedPlayerId))
  }

  isPlaytest(id) { return this.#rooms.has(id) }

  close(id) {
    const room = this.#rooms.get(id)
    if (!room) return
    room.game.clearTimer()
    this.io.in(id).disconnectSockets(true)
    delete this.sessions[id]
    this.#rooms.delete(id)
  }

  #create(playerCount, scenario, res) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4
      || !SCENARIOS.some(item => item.id === scenario)) {
      throw new Error('Choose 2–4 players and an available scenario.')
    }
    for (const [id, room] of this.#rooms) if (room.expires < Date.now()) this.close(id)
    const id = `playtest-${randomBytes(6).toString('hex')}`
    const game = new Game({
      id, io: this.io, host: { id: 1, name: 'Player 1' },
      config: { ...CONST.GAME_CONFIG, player_count: playerCount, timer: false,
        auto_roll: false, map_shuffle: false, mapkey: CONST.DEFAULT_MAPKEY,
        hotseat: true, scenarioId: scenario },
      // Keep a completed sandbox available so its owner can reload a scenario.
      onGameEnd: () => { game.state = CONST.GAME_STATES.END },
    })
    for (let i = 1; i < playerCount; i++) game.join()
    game.players.forEach(player => { player.name = `Player ${player.id}` })
    applyScenario(game, scenario)
    const room = { game, token: randomBytes(32).toString('base64url'), selectedPlayerId: 1,
      expires: Date.now() + COOKIE_OPTIONS.maxAge }
    this.sessions[id] = game
    this.#rooms.set(id, room)
    res.cookie('game_id', id, COOKIE_OPTIONS)
    res.cookie('player_id', 1, COOKIE_OPTIONS)
    res.cookie('playtest_owner', room.token, COOKIE_OPTIONS)
    return id
  }

  install(app) {
    app.get('/playtest/new', (req, res) => {
      try {
        const oldId = this.owns(req.cookies) ? req.cookies.game_id : null
        const id = this.#create(Number(req.query.players || 3), req.query.scenario || 'opening', res)
        if (oldId) this.close(oldId)
        res.redirect(`/game/${id}`)
      } catch (error) { res.status(400).send(error.message) }
    })

    app.use('/api/playtest', (req, res, next) => {
      res.set('Cache-Control', 'no-store')
      if (!this.owns(req.cookies)) return res.status(403).json({ error: 'Open your own solo playtest room first.' })
      if (req.method !== 'GET') {
        // JSON requests plus strict cookies exclude cross-site form submissions.
        if (!req.is('application/json')) return res.status(415).json({ error: 'JSON is required.' })
        let originHost
        try { originHost = req.headers.origin && new URL(req.headers.origin).host } catch { originHost = false }
        if (req.headers.origin && originHost !== req.headers.host) {
          return res.status(403).json({ error: 'Use the playtest controls in this game.' })
        }
      }
      next()
    })

    app.get('/api/playtest', (req, res) => {
      const { game, selectedPlayerId } = this.#rooms.get(req.cookies.game_id)
      res.json({ scenario: game.config.scenarioId, scenarios: SCENARIOS, playerCount: game.player_count,
        selectedPlayerId, activePlayerId: game.active_pid, phase: game.state,
        players: game.players.map(player => ({ id: player.id, name: player.name,
          resources: Object.fromEntries(Object.keys(CONST.RESOURCES).map(key => [key, player.closed_cards[key]])) })) })
    })

    app.post('/api/playtest/seat', (req, res) => {
      const room = this.#rooms.get(req.cookies.game_id)
      const pid = req.body?.playerId
      if (!Number.isInteger(pid) || !room.game.hasPlayer(pid)) {
        return res.status(400).json({ error: 'Choose a player in this room.' })
      }
      room.selectedPlayerId = pid
      // Old tabs cannot keep issuing actions for the previous seat.
      this.io.in(room.game.id).disconnectSockets(true)
      res.cookie('player_id', pid, COOKIE_OPTIONS)
      res.json({ reload: true })
    })

    app.post('/api/playtest/scenario', (req, res) => {
      const { game } = this.#rooms.get(req.cookies.game_id)
      try {
        const id = this.#create(req.body?.playerCount ?? game.player_count, req.body?.scenario, res)
        this.close(game.id)
        res.json({ url: `/game/${id}` })
      } catch (error) { res.status(400).json({ error: error.message }) }
    })

    app.post('/api/playtest/resources', (req, res) => {
      const { game } = this.#rooms.get(req.cookies.game_id)
      try {
        game.setPlaytestResources(req.body?.playerId, req.body?.resources, req.body?.mode)
        res.json({ reload: true })
      } catch (error) { res.status(400).json({ error: error.message }) }
    })
  }
}
