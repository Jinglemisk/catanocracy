import * as CONST from "../const.js"
import { resToText } from "../const_messages.js"
const $ = document.querySelector.bind(document)
const oKeys = Object.keys

export default class PlayerUI {
  #ui; #onDiceClick; #onPieceClick; #onBuyDevCardClick; #onTradeClick; #onExitTrade;
  #onEndTurnClick; #onCardClick; #getPossibleLocations; #toggleBoardBlur; #onDevCardActivate
  #canPlayDevCard
  player; has_timer; timer; auto_roll; hand

  $timer; $dice; $build_road; $build_settlement; $build_city; $buy_dev_card; $trade_btn; $end_turn
  $el = $('#game > .current-player')
  $hand = this.$el.querySelector('.hand')
  $action_bar = this.$el.querySelector('.actions')
  $card_preview = $('#game > .card-preview-zone')

  constructor(player, has_timer, auto_roll, { onDiceClick, onPieceClick, onBuyDevCardClick,
    onTradeClick, onExitTrade, onEndTurnClick, onCardClick, getPossibleLocations,
    toggleBoardBlur, onDevCardActivate, canPlayDevCard }) {
    this.player = player
    this.has_timer = has_timer
    this.auto_roll = auto_roll
    this.#onDiceClick = onDiceClick
    this.#onPieceClick = onPieceClick
    this.#onBuyDevCardClick = onBuyDevCardClick
    this.#onTradeClick = onTradeClick
    this.#onExitTrade = onExitTrade
    this.#onEndTurnClick = onEndTurnClick
    this.#onCardClick = onCardClick
    this.#onDevCardActivate = onDevCardActivate
    this.#canPlayDevCard = canPlayDevCard
    this.#getPossibleLocations = getPossibleLocations
    this.#toggleBoardBlur = toggleBoardBlur
    this.hand = this.#cleanHandData(this.player.closed_cards)
  }

  render() {
    this.renderActionBar()
    // this.hand.S = 3
    // this.hand.L = 7
    // this.hand.B = 2
    // this.hand.dK = 3
    // this.hand.O = 3
    // this.hand.dM = 1
    // this.hand.dR = 1
    // this.hand.dY = 1
    // this.hand.dVp = 2
    this.renderHand()
    this.#setupCardPreviewEvents()
  }

  toggleShow(bool) { this.$el.classList[bool ? 'add' : 'remove']('show') }
  toggleHandBlur(bool) { this.$hand.classList[bool ? 'add' : 'remove']('blur') }
  togglePlayerBlur(bool) { this.$el.classList[bool ? 'add' : 'remove']('blur') }

  /**
   * -----------------
   *   ACTION BAR UI
   * -----------------
   */
  //#region
  renderActionBar() {
    this.$el.classList.add('id-' + this.player.id)
    this.$action_bar.innerHTML = `
      <div class="timer disabled ${this.has_timer ? '' : 'hide'}">0:00</div>
      <button class="roll-dice disabled ${this.auto_roll ? 'hide' : ''}" title="Roll Dice (Space)">🎲🎲</button>
      <button class="build-road disabled" title="Build Road (r)" data-count="${CONST.PIECES_COUNT.R}">
        <div class="cost-tooltip">${resToText(CONST.COST.R)}</div>
      </button>
      <button class="build-settlement disabled" title="Build Settlement (s)" data-count="${CONST.PIECES_COUNT.S}">
        <div class="cost-tooltip">${resToText(CONST.COST.S)}</div>
      </button>
      <button class="build-city disabled" title="Build City (c)" data-count="${CONST.PIECES_COUNT.C}">
        <div class="cost-tooltip">${resToText(CONST.COST.C)}</div>
      </button>
      <button class="dev-card disabled" title="Buy a development card (d)" aria-label="Buy a development card" data-count="-">
        <div class="cost-tooltip">${resToText(CONST.COST.DEV_C)}</div>
        <img src="/images/dc-back.png" alt=""/>
        <span class="buy-card-label">Buy card<small class="deck-count"></small></span>
      </button>
      <button class="trade disabled" title="Trade (t/\`)">Trade</button>
      <button class="end-turn disabled" title="End Turn (e/Space)">End Turn</button>
    `
    this.#setRefs()
    this.#setupActionEvents()
  }

  #setRefs() {
    this.$timer = this.$action_bar.querySelector('.timer')
    this.$dice = this.$action_bar.querySelector('.roll-dice')
    this.$build_road = this.$action_bar.querySelector('.build-road')
    this.$build_settlement = this.$action_bar.querySelector('.build-settlement')
    this.$build_city = this.$action_bar.querySelector('.build-city')
    this.$buy_dev_card = this.$action_bar.querySelector('.dev-card')
    this.$trade_btn = this.$action_bar.querySelector('.trade')
    this.$end_turn = this.$action_bar.querySelector('.end-turn')
  }

  #$keyToEl(key) {
    return ({
      R: this.$build_road, S: this.$build_settlement,
      C: this.$build_city, DEV_C: this.$buy_dev_card,
    })[key]
  }

  #setupActionEvents() {
    // Dice Click
    this.$dice.addEventListener('click', e => {
      if (e.target.classList.contains('disabled')) return
      this.#onDiceClick()
      e.target.classList.add('disabled')
    })
    // Road, Settlement & City Click
    const getEventCb = piece => e => {
      const classList = this.#$keyToEl(piece).classList
      if (classList.contains('disabled')) return
      if (this.#$keyToEl(piece).dataset.count === '0') return
      this.#onPieceClick(piece, classList.contains('active'))
      classList.toggle('active')
    }
    this.$build_road.addEventListener('click', getEventCb('R'))
    this.$build_settlement.addEventListener('click', getEventCb('S'))
    this.$build_city.addEventListener('click', getEventCb('C'))
    // Buy Development Card
    this.$buy_dev_card.addEventListener('click', e => {
      if (e.currentTarget.classList.contains('disabled')) return
      if (e.currentTarget.dataset.count === '0') return
      this.#onBuyDevCardClick()
    })
    // Trade
    this.$trade_btn.addEventListener('click', e => {
      if (this.$trade_btn.classList.contains('disabled')) return
      this.#onTradeClick()
    })
    // End Turn
    this.$end_turn.addEventListener('click', e => {
      if (e.target.classList.contains('disabled')) return
      this.#onEndTurnClick()
    })
    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.closest('button, input, select, textarea') && ['Space', 'Enter'].includes(e.code)) return
      switch (e.code) {
        case 'KeyR': getEventCb('R')(); break
        case 'KeyS': getEventCb('S')(); break
        case 'KeyC': getEventCb('C')(); break
        case 'KeyD':
          !this.$buy_dev_card.classList.contains('disabled') && this.#onBuyDevCardClick()
          break
        case 'KeyE':
          !this.$end_turn.classList.contains('disabled') && this.#onEndTurnClick()
          break
        case 'KeyT':
          if (this.$trade_btn.classList.contains('disabled')) { break }
          this.#onTradeClick()
          break
        case 'Space':
          e.target === document.body && e.preventDefault()
          if (!this.$dice.classList.contains('disabled')) {
            this.#onDiceClick()
            e.target.classList.add('disabled')
          } else if (!this.$end_turn.classList.contains('disabled')) {
            this.#onEndTurnClick()
          }
          break
        case 'Backquote':
          if (this.isAnyActionActive()) {
            this.removeActiveActions()
            this.#onPieceClick('', true)
          }
          this.#onExitTrade()
          break
      }
    })
  }

  canIBuy(type) {
    const costs = CONST.COST[type]
    return oKeys(costs).reduce((mem, res_key) => {
      const has_resource = this.hand[res_key] >= costs[res_key]
      this.toggleAction(this.#$keyToEl(type).querySelector('.cost-tooltip .res-icon.'+res_key), has_resource)
      return mem && has_resource
    }, true)
  }

  checkAndToggleActions(toggle) {
    this.refreshDevelopmentCards()
    this.removeActiveActions()
    if (toggle) {
      this.toggleAction(this.$end_turn, true)
      this.toggleAction(this.$trade_btn, true)
      oKeys(CONST.COST).forEach(key => {
        const can_act = this.canIBuy(key)
          && (key == 'DEV_C' || this.#getPossibleLocations(key).length)
        this.toggleAction(this.#$keyToEl(key), can_act)
      })
    } else {
      for (const $el of this.$action_bar.children) {
        this.toggleAction($el)
      }
    }
  }

  isAnyActionActive() {
    let active = false
    for (const $el of this.$action_bar.children) {
      if ($el.classList.contains('active')) { active = true; break }
    }
    return active
  }

  removeActiveActions() {
    for (const $el of this.$action_bar.children) {
      $el.classList.remove('active')
    }
  }

  resetTimer(time_in_seconds, isCurrentPlayer) {
    this.timer && clearInterval(this.timer)
    this.toggleAction(this.$timer, isCurrentPlayer)
    time_in_seconds--
    this.timer = setInterval(_ => {
      const seconds = time_in_seconds % 60
      const minutes = Math.floor(time_in_seconds / 60)
      const time_text = minutes + ':' + ('0' + seconds).slice(-2)
      this.$timer.innerHTML = time_text
      --time_in_seconds < 0 && clearInterval(this.timer)
    }, 1000)
  }

  toggleDice(active) { this.toggleAction(this.$dice, active); this.refreshDevelopmentCards() }
  toggleAction($el, toggle) {
    $el?.classList[toggle ? 'remove' : 'add']('disabled')
  }

  updatePiecesCount() {
    this.$build_road.dataset.count = CONST.PIECES_COUNT.R - this.player.pieces.R.length
    this.$build_settlement.dataset.count = CONST.PIECES_COUNT.S - this.player.pieces.S.length
    this.$build_city.dataset.count = CONST.PIECES_COUNT.C - this.player.pieces.C.length
  }

  setDevCardCount(n) {
    this.$buy_dev_card.dataset.count = n
    this.$buy_dev_card.querySelector('.deck-count').textContent = `${n} left in deck`
  }
  //#endregion

  /**
   * ------------
   *   HAND UI
   * ------------
   */
  //#region
  renderHand() {
    const hand_groups = Object.entries(this.hand).filter(([type]) => CONST.RESOURCES[type])
    const group_size = hand_groups.length
    this.$hand.style.setProperty('--resource-groups', Math.max(1, group_size))
    const CURVE_TRANSLATE = [
      [0], [0,0], [10,0,20], [20,0,0,30], [30,5,0,9,40],
      [40,10,0,0,18,50], [50,15,3,0,6,27,60], [55,20,6,0,0,12,36,65],
      [55,20,6,0,-5,0,12,36,65], [55,20,6,0,-5,-5,0,12,36,65],
    ][group_size - 1]

    const resource_cards = hand_groups.map(([type, count], i) => {
      const group_rotation = group_size > 1 ? -15 + (30 / (group_size - 1)) * i : 0
      const group_translate = CURVE_TRANSLATE[i]
      let group_margin = group_size < 4
        ? 50 : (group_size > 6 ? (group_size > 8 ? -50 : -30) : -10)
      return `
        <div
          class="card-group ${type}" data-type="${type}" data-count="${count}"
          ${type === 'dK' ? ' title="Knight (k)" ' : ''}
          style="margin-right:${group_margin}px;
            transform:rotate(${group_rotation / 2}deg) translateY(${group_translate / 4}px);"
        >
        <div class="card-count ${count < 2 ? 'hide' : ''}">${count}</div>
        ${[...Array(count)].map((_, j) => {
        if (count > 7 && j < count - 7) return '' // Max 7 cards rendered
        const c_rot = 15 * (count - j - 1) / (count - j)
        const c_mv = 15 * (count - j - 2) / (count - j)
        return `
            <div class="card ${type}" data-type="${type}"
              style="transform:rotate(${c_rot}deg) translate(${c_mv}px, 0px);"
            ></div>
          `
      }).join('')}
        </div>
      `
    }).join('')
    this.$hand.innerHTML = `
      <div class="resource-hand" aria-label="Your resources">
        <span class="hand-section-label">Resources</span>
        <div class="resource-cards">${resource_cards || '<span class="empty-resources">No resources in hand</span>'}</div>
      </div>
      <section class="development-hand" aria-label="Your development cards"></section>
    `
    this.#setupHandEvents()
    this.refreshDevelopmentCards()
  }

  refreshDevelopmentCards() {
    const $rack = this.$hand.querySelector('.development-hand')
    if (!$rack) return
    const cards = Object.entries(CONST.DEVELOPMENT_CARDS).flatMap(([type, name]) => {
      const count = this.player.closed_cards[type] || 0
      const bought = this.player.turn_bought_dc?.[type] || 0
      return Array.from({ length: count }, (_, index) => {
        const isNew = index >= count - bought
        const isAction = type !== 'dVp'
        const playable = isAction && !isNew && !!this.#canPlayDevCard(type)
        const status = !isAction ? 'Victory point'
          : isNew ? 'New this turn' : playable ? 'Ready to play' : 'Not playable now'
        return { type, name, playable, status, isNew }
      })
    })
    $rack.style.setProperty('--card-count', Math.max(1, cards.length))
    $rack.innerHTML = `
      <div class="hand-section-label development-hand-title">Dev cards · ${cards.length}</div>
      ${cards.length ? '<div class="development-card-list">' + cards.map(({ type, name, playable, status, isNew }) => `
        <button class="development-card" data-type="${type}" data-playable="${playable}"
          data-new="${isNew}" title="${name} — ${status}" aria-label="${name} — ${status}">
          <span class="development-card-art" aria-hidden="true"></span>
          <span class="development-card-details" aria-hidden="true">
            <span class="development-card-name">${name}</span>
            <small>${status}</small>
          </span>
        </button>`).join('') + '</div>' : '<p class="development-hand-empty">None in hand</p>'}
    `
    $rack.querySelectorAll('.development-card').forEach($card => $card.addEventListener('click', () => {
      const type = $card.dataset.type
      const isAction = type !== 'dVp'
      const playable = $card.dataset.playable === 'true' && this.#canPlayDevCard(type)
      this.showCardPreview(type, isAction, playable)
    }))
  }

  #setupHandEvents() {
    this.$hand.querySelectorAll('.card, .card-count').forEach($el => $el.addEventListener('click', e => {
      const $card_group = e.target.parentElement
      const type = $card_group.dataset.type
      const is_active = $card_group.classList.contains('active')
      const is_dc = CONST.DEVELOPMENT_CARDS[type] && type !== 'dVp'
      if (is_dc || !is_active) {
        this.showCardPreview(type, is_dc, is_dc && this.#canPlayDevCard(type))
      }
      else { this.#onCardClick(type) }
    }))
  }

  clickCard(type) {
    const selector = `.development-card[data-type="${type}"]`
    const card = CONST.DEVELOPMENT_CARDS[type]
      ? this.$hand.querySelector(`${selector}[data-playable="true"]`) || this.$hand.querySelector(selector)
      : this.$hand.querySelector('.card.' + type)
    card?.click()
  }

  #setupCardPreviewEvents() {
    this.$card_preview.addEventListener('click', e => {
      if (e.target.classList.contains('activate')) {
        if (e.target.classList.contains('hide')) { return }
        const type = this.$card_preview.querySelector('.card').dataset.type
        if (!CONST.DEVELOPMENT_CARDS[type] || type === 'dVp') { return }
        this.#onDevCardActivate(type)
      }
      if (['card', 'card-front', 'card-back'].includes(e.target.className)) { return }
      this.closeCardPreview(true)
    })
    document.addEventListener('keydown', e => {
      e.code === 'Backquote' && this.closeCardPreview()
      e.code === 'KeyK' && this.clickCard('dK')
    })
  }

  showCardPreview(type, show_info, show_activate) {
    this.#toggleBoardBlur(true); this.togglePlayerBlur(true)
    this.$card_preview.classList.remove('hide', 'activated')
    this.$card_preview.querySelector('.card').dataset.type = type
    this.$card_preview.querySelector('.activate').classList.toggle('hide', !show_activate)
    this.$card_preview.querySelector('.info').classList.toggle('hide', !show_info)
  }

  closeCardPreview(activated) {
    this.#toggleBoardBlur(false); this.togglePlayerBlur(false)
    activated && this.$card_preview.classList.add('activated')
    this.$card_preview.classList.add('hide')
    this.$card_preview.querySelector('.activate').classList.add('hide')
    this.$card_preview.querySelector('.info').classList.add('hide')
  }

  #cleanHandData(cards_obj) {
    return Object.fromEntries(Object.entries(cards_obj).filter(([_, v]) => v))
  }

  updateHand(player, cards) {
    this.hand = this.#cleanHandData(player.closed_cards)
    this.renderHand()
    oKeys(CONST.COST).forEach(key => this.canIBuy(key))
  }

  activateResourceCards() {
    oKeys(CONST.DEVELOPMENT_CARDS).forEach(k => delete this.hand[k])
    this.renderHand()
    const res_selector = oKeys(CONST.RESOURCES).map(k => `.card-group[data-type="${k}"]`).join(',')
    this.$hand.querySelectorAll(res_selector).forEach($el => $el.classList.add('active'))
  }

  /** During Robber Drop */
  toggleHandResource(type, add) {
    if (add) {
      const count = +this.$hand.querySelector(`.card-group[data-type="${type}"] .card-count`).innerHTML
      this.$hand.querySelector(`.card-group[data-type="${type}"] .card-count`).innerHTML = count + 1
      this.$hand.querySelector(`.card-group[data-type="${type}"]`).classList.remove('disabled')
      const hidden_list = this.$hand.querySelectorAll(`.card-group[data-type="${type}"] .card.hide`)
      if (hidden_list.length) hidden_list[hidden_list.length - 1].classList.remove('hide')
    } else {
      const count = +this.$hand.querySelector(`.card-group[data-type="${type}"] .card-count`).innerHTML
      if (!count) return
      this.$hand.querySelector(`.card-group[data-type="${type}"] .card:not(.hide)`)?.classList.add('hide')
      this.$hand.querySelector(`.card-group[data-type="${type}"] .card-count`).innerHTML = count - 1
      if (count === 1) this.$hand.querySelector(`.card-group[data-type="${type}"]`).classList.add('disabled')
    }
    return 1
  }
  //#endregion
}
