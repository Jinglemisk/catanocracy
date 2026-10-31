import { default as MSG, getName } from "../const_messages.js"
const $ = document.querySelector.bind(document)

export default class AlertUI {
  #player; #alert_time; #alert_timer;
  #onStatusUpdate; #showCard; #storageKey; #onLayoutChange
  #status_history = []
  $status_history = $('#game > .status-history-zone')
  $status_history_container = $('#game > .status-history-zone > .container')
  $alert = $('#game > .alert')
  $status_bar = $('#game > .current-player .status-bar')

  constructor(player, alert_time = 3, { onStatusUpdate, showCard, gameId, onLayoutChange }){
    this.#player = player
    this.#onStatusUpdate = onStatusUpdate
    this.#showCard = showCard
    this.#alert_time = alert_time
    this.#storageKey = `catanocracy:log:${gameId}:${player.id}`
    this.#onLayoutChange = onLayoutChange
    try {
      this.#status_history = JSON.parse(sessionStorage.getItem(this.#storageKey))
      if (!(this.#status_history instanceof Array)) { this.#status_history = [] }
    } catch (e) {}
  }

  render() {
    // Upgrade cached page shells too, so UI updates can preserve live rooms.
    this.$status_history.id = 'game-log'
    this.$status_history.setAttribute('role', 'complementary')
    this.$status_history.setAttribute('aria-label', 'Game log')
    this.$status_history.querySelector('.header > .history-title').textContent = 'Game log'
    this.$status_history.querySelector('.view-toggle .history-title').textContent = 'Dice stats'
    this.$status_history.querySelector('.view-toggle .dice-stats-title').textContent = 'Game log'
    this.$status_history.querySelector('.close').setAttribute('aria-label', 'Hide game log')
    this.$status_history_container.setAttribute('role', 'log')
    this.$status_history_container.setAttribute('aria-live', 'polite')
    if (!this.$status_history.querySelector('.log-perspective')) {
      const perspective = document.createElement('p')
      perspective.className = 'log-perspective'
      this.$status_history_container.before(perspective)
    }
    this.$status_bar.innerHTML = this.#player.last_status || '...'
    this.#renderHistory()
    this.$status_history.querySelector('.log-perspective').textContent = `${this.#player.name} · newest first`
    this.logButton = document.createElement('button')
    this.logButton.className = 'icon game-log-toggle'
    this.logButton.type = 'button'
    this.logButton.textContent = '≡'
    this.logButton.title = 'Game log (h)'
    this.logButton.setAttribute('aria-label', 'Game log')
    this.logButton.setAttribute('aria-controls', 'game-log')
    this.logButton.addEventListener('click', () => this.toggleStatusHistory())
    $('#game > .accessibility-zone').append(this.logButton)
    const preference = sessionStorage.getItem('catanocracy:log-open')
    this.toggleStatusHistory(preference === null ? window.innerWidth >= 1100 : preference === 'true')
    this.$alert.querySelector('.close').addEventListener('click', e => this.closeBigAlert())
    this.$status_history.querySelector('.close').addEventListener('click', e => this.toggleStatusHistory(false))
    $('#game > .current-player .status-bar-history').addEventListener('click', e => this.toggleStatusHistory())
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, select, textarea, button, [contenteditable="true"]')) return
      e.code === 'Backquote' && (this.closeBigAlert(), this.toggleStatusHistory(false))
      e.code === 'KeyH' && this.toggleStatusHistory()
    })
  }

  toggleStatusHistory(show = !this.$status_history.classList.contains('show')) {
    this.$status_history.classList[show ? 'add' : 'remove']('show')
    this.$status_history.setAttribute('aria-hidden', String(!show))
    this.logButton?.setAttribute('aria-expanded', String(show))
    sessionStorage.setItem('catanocracy:log-open', String(show))
    this.#onLayoutChange?.()
  }

  #renderHistory() {
    this.$status_history_container.innerHTML = this.#status_history.length
      ? this.#status_history.map(message => `<div class="status">${message}</div>`).join('')
      : '<p class="log-empty">Dice rolls, purchases and trades appear here.</p>'
  }

  #saveHistory() {
    this.#status_history = this.#status_history.slice(0, 100)
    try { sessionStorage.setItem(this.#storageKey, JSON.stringify(this.#status_history)) } catch {}
    this.#renderHistory()
    this.$status_history_container.scrollTop = 0
  }

  closeBigAlert() {
    clearTimeout(this.#alert_timer); this.$alert.classList.remove('show', 'animate')
  }

  bigAlert(message, no_status) {
    const $alert_parchment = this.$alert.querySelector('.parchment')
    const $alert_text = this.$alert.querySelector('.text')
    this.$alert.classList.add('show')
    $alert_parchment.innerHTML = $alert_text.innerHTML = message
    clearTimeout(this.#alert_timer)
    this.#alert_timer = setTimeout(_ => this.closeBigAlert(), this.#alert_time * 1000)
    no_status || this.setStatus(message)
  }

  setStatus(message = '...') {
    const msg = message.replace(/<br\/?>/g, '. ')
    this.$status_bar.innerHTML = msg
    this.#status_history.unshift(msg)
    this.#saveHistory()
    this.#onStatusUpdate(msg)
  }

  appendStatus(message = '...') {
    if (!this.#status_history.length) return this.setStatus(message)
    this.$status_bar.innerHTML += message.replace(/<br\/?>/g, '. ')
    this.#status_history[0] = this.$status_bar.innerHTML
    this.#saveHistory()
    this.#onStatusUpdate(this.$status_bar.innerHTML)
  }

  alertStrategy(t) { this.bigAlert(MSG.STRATEGIZE.all(t)) }
  alertFullScreen() {
    const _tmp = this.#alert_time
    this.#alert_time = 7
    this.bigAlert(MSG.FULL_SCREEN.all(), true)
    this.#alert_time = _tmp
  }
  alertInitialSetup(p, turn) {
    const msg = turn < 2 ? MSG.INITIAL_BUILD : MSG.INITIAL_BUILD_2
    if (this.#isMe(p)) this.bigAlert(msg.self())
    else this.setStatus(msg.other(p))
  }
  alertRollTurn(p) {
    const message = this.#isMe(p) ? MSG.ROLL_TURN.self() : MSG.ROLL_TURN.other(p)
    if (this.#status_history[0] === message.replace(/<br\/?>/g, '. ')) return
    if (this.#isMe(p)) {
      if (this._has_shown_roll_alert) { this.setStatus(MSG.ROLL_TURN.self()) }
      else { this._has_shown_roll_alert = true; this.bigAlert(MSG.ROLL_TURN.self()) }
    }
    else { this.setStatus(MSG.ROLL_TURN.other(p)) }
  }
  alertDiceValue(p, d1, d2, rob_res) { this.setStatus(MSG.DICE_VALUE.all(d1, d2, this.#isNotMe(p), rob_res)) }
  alertBuild(p, piece) { this.setStatus(MSG.BUILDING.all(piece, this.#isNotMe(p))) }
  alertResTaken(res) { this.appendStatus(MSG.RES_TAKEN.all(res)) }
  alertDevCardTaken(p, card) { this.setStatus(MSG.DEVELOPMENT_CARD_BUY.all(this.#isNotMe(p), card)) }
  alertRobberDrop(drop_count) {
    if (drop_count) this.bigAlert(MSG.ROBBER.self(drop_count))
    else this.appendStatus(MSG.ROBBER.other())
  }
  alertRobberDropDone() { this.setStatus(MSG.ROBBER.other()) }
  alertRobberMove(p) {
    if (this.#isMe(p)) this.bigAlert(MSG.ROBBER_MOVE.self())
    else this.setStatus(MSG.ROBBER_MOVE.other(p))
  }
  alertRobberMoveDone(p, tile, num) { this.setStatus(MSG.ROBBER_MOVED_TILE.all(tile, num, this.#isNotMe(p))) }
  alertStolenInfo(p, res) { this.appendStatus(MSG.PLAYER_STOLE_RES.all(this.#isNotMe(p), res)) }
  alertTradedInfo(p1, p2, given, taken) {
    this.setStatus(MSG.PLAYER_TRADE_INFO.all({
      p1: this.#isNotMe(p1), p2: this.#isNotMe(p2), board: !p2
    }, given, taken))
  }
  alertKnightUsed() { this.appendStatus(MSG.KNIGHT_USED_APPEND.all()) }
  alertRoadBuildingUsed(p) { this.setStatus(MSG.ROAD_BUILDING_USED.all(this.#isNotMe(p))) }
  alertMonopolyUsed(p, res, total, self) { this.setStatus(MSG.MONOPOLY_USED.all(this.#isNotMe(p), res, total, self)) }
  alertYearOfPlentyUsed(p, res_obj) { this.setStatus(MSG.YEAR_OF_PLENTY_USED.all(this.#isNotMe(p), res_obj)) }
  alertLargestArmy(p, count) { this.setStatus(MSG.LARGEST_ARMY.all(this.#isNotMe(p), count)) }
  alertLongestRoad(p, len) { this.setStatus(MSG.LONGEST_ROAD.all(this.#isNotMe(p), len)) }
  alertPlayerQuit(p, end) { this.bigAlert(MSG.PLAYER_QUIT.all(p, end)) }
  alertGameEnd(p, context) {
    this.setStatus(MSG.END_STATUS.all(this.#isNotMe(p), context.vps))
    this.renderEndGameAlert(this.#isNotMe(p), context)
  }

  renderEndGameAlert(p, { pid, S, C, dVp, largest_army, longest_road }) {
    this.$alert.querySelector('.parchment').innerHTML = this.$alert.querySelector('.text').innerHTML = `
      <div class="game-ended p${pid}">
        <div class="title-emoji">🏆</div>
        <div class="player-name">🎖 ${getName(p)} Won 🎖</div>
        <small>
          ${S ? `<div class="pts S"><b>${S} VP:</b> ${S} Settlement</div>` : ''}
          ${C ? `<div class="pts C"><b>${C * 2} VP:</b> ${C} City</div>` : ''}
          ${dVp ? `<div class="pts dVp" data-type="dVp"><b>${dVp} VP:</b> ${dVp} Development Card</div>` : ''}
          ${largest_army ? `<div class="pts army" data-type="lArmy"><b>2 VP:</b> Largest Army with ${largest_army} Knights</div>` : ''}
          ${longest_road ? `<div class="pts road" data-type="lRoad"><b>2 VP:</b> Longest Road with ${longest_road} roads</div>` : ''}
        </small>
        <div class="bg"></div>
      </div>
    `
    this.$alert.classList.add('show')
    setTimeout(_ => this.$alert.classList.add('animate'), 200)
    this.$alert.querySelectorAll('.dVp, .army, .road').forEach($_ => $_.addEventListener('click', e => {
      this.#showCard(e.target.dataset.type || e.target.parentElement.dataset.type)
    }))
  }

  #isMe(p) { return p?.id === this.#player.id }
  #isNotMe(p) { return p?.id !== this.#player.id && p }
}
