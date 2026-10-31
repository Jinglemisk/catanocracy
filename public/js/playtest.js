import { SOCKET_EVENTS, RESOURCES } from './const.js'

const PHASES = {
  INITIAL_SETUP: 'Initial setup', player_roll: 'Roll dice', player_actions: 'Take actions',
  drop_resource_for_robber: 'Discard for robber', moving_robber: 'Move robber', end: 'Game ended',
}

export default class PlaytestUI {
  busy = false
  data

  constructor(game, socket) {
    this.game = game
    this.playerId = window.player_obj.id
    this.players = [window.player_obj, ...window.opponents_obj]
    document.querySelector('#game').classList.add('hotseat-game')
    this.render()
    this.connectPortraits()
    socket.on(SOCKET_EVENTS.STATE_CHANGE, () => this.updateStatus())
    this.updateStatus()
    const restoreKey = `playtest-panel:${game.id}`
    const target = sessionStorage.getItem(restoreKey)
    if (target) {
      sessionStorage.removeItem(restoreKey)
      this.openPanel(Number(target))
    }
  }

  render() {
    this.toolbar = document.querySelector('#game > .accessibility-zone')
    this.launcher = document.createElement('button')
    this.launcher.type = 'button'
    this.launcher.className = 'icon playtest-open'
    this.launcher.title = 'Devtools'
    this.launcher.setAttribute('aria-label', 'Devtools')
    this.launcher.setAttribute('aria-haspopup', 'dialog')
    this.launcher.textContent = '⚙'
    this.toolbar.append(this.launcher)
    this.errorNotice = document.createElement('p')
    this.errorNotice.className = 'playtest-toolbar-error'
    this.errorNotice.setAttribute('role', 'alert')
    this.errorNotice.hidden = true
    document.body.append(this.errorNotice)
    this.dialog = document.createElement('dialog')
    this.dialog.className = 'playtest-panel'
    this.dialog.setAttribute('aria-labelledby', 'playtest-title')
    this.dialog.innerHTML = `
      <header><div><span class="playtest-eyebrow">Solo sandbox</span><h2 id="playtest-title">Devtools</h2></div>
        <button type="button" class="playtest-close" aria-label="Close Devtools">×</button></header>
      <p class="playtest-panel-status"></p>
      <button type="button" class="playtest-active-seat secondary">Control active player</button>
      <p class="playtest-error" role="alert" hidden></p>
      <form class="playtest-scenario-form">
        <h3>Scenarios</h3>
        <div class="playtest-row">
          <label>Scenario<select name="scenario" required></select></label>
          <label>Players<select name="playerCount"><option>2</option><option>3</option><option>4</option></select></label>
        </div>
        <p class="playtest-scenario-description"></p>
        <p class="playtest-hint">Loading a scenario resets this sandbox. Timers are off.</p>
        <div class="playtest-buttons"><button type="submit">Load scenario</button>
          <button type="button" class="playtest-reload secondary">Reload current</button></div>
      </form>
      <form class="playtest-resource-form">
        <h3>Player resources</h3>
        <div class="playtest-row">
          <label>Player<select name="playerId" required></select></label>
          <label>Action<select name="mode"><option value="add">Add to hand</option><option value="set">Set hand totals</option></select></label>
        </div>
        <p class="playtest-hand-summary"></p>
        <div class="playtest-resources">${Object.entries(RESOURCES).map(([key, label]) => `
          <label>${label}<input type="number" name="${key}" min="0" max="99" step="1" value="0" required></label>
        `).join('')}</div>
        <div class="playtest-buttons"><button type="submit">Apply resources</button>
          <button type="button" class="playtest-give-all secondary">Add 1 of each</button></div>
      </form>
      <p class="playtest-hint">Click a player portrait to control that seat. Switching seats keeps the current turn. There are no CPU players.</p>`
    document.body.append(this.dialog)
    this.launcher.addEventListener('click', () => this.openPanel())
    this.dialog.querySelector('.playtest-active-seat').addEventListener('click', () => this.switchSeat(this.game.active_pid))
    this.dialog.querySelector('.playtest-close').addEventListener('click', () => this.dialog.close())
    this.dialog.querySelector('.playtest-scenario-form').addEventListener('submit', event => {
      event.preventDefault()
      const form = event.currentTarget
      this.loadScenario(form.elements.scenario.value, Number(form.elements.playerCount.value))
    })
    this.dialog.querySelector('[name="scenario"]').addEventListener('change', () => this.updateDescription())
    this.dialog.querySelector('.playtest-reload').addEventListener('click', () => {
      if (this.data) this.loadScenario(this.data.scenario, this.data.playerCount)
    })
    this.dialog.querySelector('.playtest-resource-form').addEventListener('submit', event => {
      event.preventDefault()
      const form = event.currentTarget
      const resources = Object.fromEntries(Object.keys(RESOURCES).map(key => [key, Number(form.elements[key].value)]))
      this.editResources(resources, form.elements.mode.value)
    })
    this.dialog.querySelector('.playtest-give-all').addEventListener('click', () => {
      this.editResources(Object.fromEntries(Object.keys(RESOURCES).map(key => [key, 1])), 'add')
    })
    for (const name of ['playerId', 'mode']) {
      this.dialog.querySelector(`[name="${name}"]`).addEventListener('change', () => this.updateResourceFields())
    }
    // The game's global shortcuts must not fire while editing Devtools fields.
    document.addEventListener('keydown', event => {
      if (this.dialog.open) event.stopPropagation()
    }, true)
  }

  connectPortraits() {
    const portraits = document.querySelectorAll('#game > .all-players .player')
    portraits.forEach(portrait => {
      const playerId = Number(portrait.dataset.id)
      portrait.setAttribute('role', 'button')
      portrait.tabIndex = 0
      portrait.setAttribute('aria-pressed', String(playerId === this.playerId))
      portrait.setAttribute('aria-label', `Control ${this.playerName(playerId)}`)
      portrait.title = `Click to control ${this.playerName(playerId)}`
      portrait.classList.toggle('playtest-controlled', playerId === this.playerId)
      const badge = document.createElement('span')
      badge.className = 'playtest-seat-badge'
      badge.textContent = playerId === this.playerId ? 'Controlling' : 'Click to control'
      portrait.append(badge)
      portrait.addEventListener('click', event => {
        if (!event.target.closest('.largest-army, .longest-road')) this.switchSeat(playerId)
      })
      portrait.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        this.switchSeat(playerId)
      })
    })
  }

  playerName(id) { return this.players.find(player => player.id === id)?.name || `Player ${id}` }

  updateStatus() {
    const text = `Controlling ${this.playerName(this.playerId)} · Turn: ${this.playerName(this.game.active_pid)}`
    this.dialog.querySelector('.playtest-panel-status').textContent = `${text} · ${PHASES[this.game.state] || this.game.state}`
    this.dialog.querySelector('.playtest-active-seat').disabled = this.busy || this.game.active_pid === this.playerId
  }

  async request(path, body) {
    const response = await fetch(`/api/playtest${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'The playtest request failed. Try reloading the page.')
    return data
  }

  async run(action) {
    if (this.busy) return
    this.busy = true
    this.setError('')
    this.toggleControls(true)
    try { await action() }
    catch (error) { this.setError(error.message || 'Could not connect to the game.') }
    finally { this.busy = false; this.toggleControls(false); this.updateStatus() }
  }

  toggleControls(disabled) {
    this.launcher.disabled = disabled
    for (const container of [this.dialog]) {
      container.querySelectorAll('button:not(.playtest-close), input, select').forEach(control => { control.disabled = disabled })
    }
  }

  setError(message) {
    for (const target of [this.errorNotice, this.dialog.querySelector('.playtest-error')]) {
      target.textContent = message
      target.hidden = !message
    }
  }

  switchSeat(playerId) {
    if (playerId === this.playerId) return
    this.run(async () => {
      await this.request('/seat', { playerId })
      window.location.reload()
    })
  }

  openPanel(targetPlayerId = this.playerId) {
    if (!this.dialog.open) this.dialog.showModal()
    this.run(async () => {
      this.data = await this.request('')
      const scenarioSelect = this.dialog.querySelector('[name="scenario"]')
      scenarioSelect.replaceChildren(...this.data.scenarios.map(scenario => new Option(scenario.label, scenario.id)))
      scenarioSelect.value = this.data.scenario
      this.dialog.querySelector('[name="playerCount"]').value = this.data.playerCount
      const playerSelect = this.dialog.querySelector('[name="playerId"]')
      playerSelect.replaceChildren(...this.data.players.map(player => new Option(player.name, player.id)))
      playerSelect.value = targetPlayerId
      this.updateDescription()
      this.updateResourceFields()
    })
  }

  updateDescription() {
    const id = this.dialog.querySelector('[name="scenario"]').value
    this.dialog.querySelector('.playtest-scenario-description').textContent = this.data?.scenarios.find(scenario => scenario.id === id)?.description || ''
  }

  updateResourceFields() {
    const form = this.dialog.querySelector('.playtest-resource-form')
    const player = this.data?.players.find(player => player.id === Number(form.elements.playerId.value))
    if (!player) return
    for (const key of Object.keys(RESOURCES)) {
      form.elements[key].value = form.elements.mode.value === 'set' ? player.resources[key] : 0
    }
    this.dialog.querySelector('.playtest-hand-summary').textContent = `Current hand: ${Object.entries(RESOURCES).map(([key, name]) => `${player.resources[key]} ${name.toLowerCase()}`).join(' · ')}`
  }

  loadScenario(scenario, playerCount) {
    this.run(async () => {
      const result = await this.request('/scenario', { scenario, playerCount })
      window.location.assign(result.url)
    })
  }

  editResources(resources, mode) {
    const playerId = Number(this.dialog.querySelector('[name="playerId"]').value)
    this.run(async () => {
      await this.request('/resources', { playerId, resources, mode })
      sessionStorage.setItem(`playtest-panel:${this.game.id}`, playerId)
      window.location.reload()
    })
  }
}
