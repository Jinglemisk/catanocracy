import Game from "./game.js"
import PlaytestUI from "./playtest.js"

// Mustache can retain an older page shell until the process restarts. Load the
// current HUD styling without restarting in-memory games for a UI update.
if (!document.querySelector('link[href="/css/index/game-hud.css"]')) {
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href = '/css/index/game-hud.css'
  await new Promise(resolve => {
    stylesheet.onload = stylesheet.onerror = resolve
    document.head.append(stylesheet)
  })
}

const socket = io()
const game = new Game(window.game_obj, window.player_obj, window.opponents_obj, socket)

window.game = game
if (game.config.hotseat) new PlaytestUI(game, socket)
