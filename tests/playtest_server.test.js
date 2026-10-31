import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

let server, base
before(async () => {
  server = spawn(process.execPath, ['index.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', API_SALT: 'test-only-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start')), 5000)
    server.stdout.on('data', data => {
      const url = String(data).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (url) { clearTimeout(timeout); resolve(url) }
    })
    server.stderr.on('data', data => process.stderr.write(data))
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)) })
  })
})
after(async () => {
  if (server?.exitCode === null) { server.kill(); await once(server, 'exit') }
})

function browser() {
  const jar = new Map()
  return {
    jar,
    async request(path, body) {
      const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(5000),
        method: body ? 'POST' : 'GET',
        headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      for (const cookie of response.headers.getSetCookie()) {
        const [name, ...value] = cookie.split(';')[0].split('=')
        value.join('=') ? jar.set(name, value.join('=')) : jar.delete(name)
      }
      return response
    },
    async state() {
      const response = await this.request('/api/playtest')
      assert.equal(response.status, 200)
      return response.json()
    },
    async page() {
      const response = await this.request(`/game/${jar.get('game_id')}`)
      assert.equal(response.status, 200)
      const html = await response.text()
      const read = name => JSON.parse(html.match(new RegExp(`window\\.${name} = (.+)`))[1].replace(/;$/, ''))
      return { game: read('game_obj'), player: read('player_obj'), opponents: read('opponents_obj') }
    },
    async socket() {
      // Speak the documented Engine.IO polling framing, using no test dependencies.
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
      const request = async (url, body) => fetch(url, { signal: AbortSignal.timeout(5000),
        method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'Content-Type': 'text/plain' } : {}) }, body })
      const url = `${base}/socket.io/?EIO=4&transport=polling`
      const open = await (await request(url)).text()
      const sid = JSON.parse(open.slice(1)).sid
      const endpoint = `${url}&sid=${sid}`
      await request(endpoint, '40')
      const packets = await (await request(endpoint)).text()
      return { packets, send: async (event, ...args) => request(endpoint, '42' + JSON.stringify([event, ...args])) }
    },
  }
}

const resources = amount => Object.fromEntries(['S', 'L', 'B', 'O', 'W'].map(key => [key, amount]))

test('solo seats preserve state, resource edits validate, reload replaces the sandbox', async () => {
  const owner = browser()
  let response = await owner.request('/playtest/new?players=4&scenario=opening')
  assert.equal(response.status, 302)
  const initialId = owner.jar.get('game_id')
  const initial = await owner.page()
  assert.equal(initial.player.id, 1)
  assert.equal(initial.game.map_changes.length, 16)
  assert.ok(initial.opponents.every(player => !player.closed_cards))
  const originalSocket = await owner.socket()
  assert.match(originalSocket.packets, /40/)
  await originalSocket.send('player_online')

  response = await owner.request('/api/playtest/seat', { playerId: 3 })
  assert.equal(response.status, 200)
  const selected = await owner.page()
  assert.equal(selected.player.id, 3)
  assert.deepEqual(selected.game, initial.game, 'Switching controls must not advance or rebuild the game')
  await originalSocket.send('roll_the_dice')
  assert.equal((await owner.page()).game.dice_rolls.length, 0, 'The previous active-seat socket is revoked')
  const socket = await owner.socket()
  await socket.send('player_online')
  await socket.send('roll_the_dice')
  await socket.send('end_turn')
  assert.equal((await owner.state()).phase, 'player_roll', 'Inactive seat cannot roll or skip a turn')

  response = await owner.request('/api/playtest/resources', { playerId: 2, mode: 'set', resources: resources(2) })
  assert.equal(response.status, 200)
  assert.deepEqual((await owner.state()).players[1].resources, resources(2))
  await owner.request('/api/playtest/resources', { playerId: 2, mode: 'add', resources: resources(1) })
  assert.deepEqual((await owner.state()).players[1].resources, resources(3))
  for (const invalid of [-1, 0.5, 100, '2']) {
    response = await owner.request('/api/playtest/resources', { playerId: 2, mode: 'set', resources: resources(invalid) })
    assert.equal(response.status, 400)
    assert.deepEqual((await owner.state()).players[1].resources, resources(3), 'Rejected edits are atomic')
  }
  response = await owner.request('/api/playtest/scenario', { scenario: 'missing', playerCount: 2 })
  assert.equal(response.status, 400)
  assert.equal(owner.jar.get('game_id'), initialId, 'Bad reload leaves the room intact')
  response = await owner.request('/api/playtest/scenario', { scenario: 'midgame', playerCount: 2 })
  assert.equal(response.status, 200)
  assert.notEqual(owner.jar.get('game_id'), initialId)
  const middle = await owner.page()
  assert.equal(middle.game.active_pid, 1)
  assert.equal(middle.game.config.player_count, 2)
  assert.equal(middle.player.public_vps, 4)
  await owner.request('/api/playtest/scenario', { scenario: 'midgame' })
  const reloaded = await owner.page()
  assert.deepEqual(reloaded.game.map_changes, middle.game.map_changes)
  assert.deepEqual(reloaded.player.closed_cards, middle.player.closed_cards)
  await owner.request('/logout')
})

test('sandbox ownership gates private pages, sockets, and editing; normal rooms stay separate', async () => {
  const owner = browser(), other = browser()
  await owner.request('/playtest/new?players=3&scenario=opening')
  other.jar.set('game_id', owner.jar.get('game_id'))
  other.jar.set('player_id', '1')
  assert.equal((await other.request('/api/playtest')).status, 403)
  assert.equal((await other.request(`/game/${owner.jar.get('game_id')}`)).status, 403)
  assert.equal((await other.request('/api/playtest/seat', { playerId: 2 })).status, 403)
  assert.match((await other.socket()).packets, /41/, 'Unauthorized Socket.IO client is disconnected')
  await other.request('/logout')
  assert.equal((await owner.state()).playerCount, 3, 'Forged logout does not close the owner room')
  assert.equal((await other.request(`/login?game_id=${owner.jar.get('game_id')}`)).status, 200)
  await owner.request('/api/sessions/clear?salt=wrong')
  assert.equal((await owner.state()).playerCount, 3, 'Wrong admin secret cannot clear rooms')
  const normal = browser()
  const config = encodeURIComponent(JSON.stringify({ hotseat: true, scenarioId: 'midgame', timer: false }))
  assert.equal((await normal.request(`/game/new?players=2&config=${config}`)).status, 302)
  assert.equal((await normal.request('/api/playtest')).status, 403)
  assert.equal((await normal.request('/api/playtest/resources', { playerId: 1, mode: 'set', resources: resources(5) })).status, 403)
  const joiner = browser()
  assert.equal((await joiner.request(`/login?game_id=${normal.jar.get('game_id')}&name=Second`)).status, 302)
  assert.equal((await joiner.page()).game.config.hotseat, undefined)
  await owner.request('/logout')
  await normal.request('/logout')
  await joiner.request('/logout')
})
