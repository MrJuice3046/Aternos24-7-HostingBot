function randomMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

function setupLeaveRejoin(bot, createBot) {
  // Timers
  let leaveTimer = null
  let jumpTimer = null
  let jumpOffTimer = null

  // State
  let stopped = false
  let reconnectTimer = null
  let reconnectAttempts = 0
  let lastLogAt = 0

  function logThrottled(msg, minGapMs = 2000) {
    const now = Date.now()
    if (now - lastLogAt >= minGapMs) {
      lastLogAt = now
      console.log(msg)
    }
  }

  function cleanup() {
    stopped = true
    if (leaveTimer) clearTimeout(leaveTimer)
    if (jumpTimer) clearTimeout(jumpTimer)
    if (jumpOffTimer) clearTimeout(jumpOffTimer)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    leaveTimer = jumpTimer = jumpOffTimer = reconnectTimer = null
  }

  function scheduleNextJump() {
    if (stopped || !bot.entity) return

    bot.setControlState('jump', true)
    jumpOffTimer = setTimeout(() => {
      bot.setControlState('jump', false)
    }, 300)

    // next jump 20s -> 5m
    const nextJump = randomMs(20_000, 5 * 60 * 1000)
    jumpTimer = setTimeout(scheduleNextJump, nextJump)
  }

  function scheduleReconnect(reason = 'end') {
    if (stopped) return

    // Backoff so you don't hammer reconnects (helps Render + server)
    // Base random: 100ms -> 240s
    let delay = randomMs(100, 240_000)

    // If it's failing repeatedly, add extra backoff (max ~5 min)
    reconnectAttempts = Math.min(reconnectAttempts + 1, 8)
    const extra = Math.min(reconnectAttempts * 3000, 60_000) // +3s per attempt, capped
    delay = Math.min(delay + extra, 300_000)

    logThrottled(`[AFK] Rejoin scheduled in ${Math.round(delay / 1000)}s (reason: ${reason}, attempt: ${reconnectAttempts})`)

    reconnectTimer = setTimeout(() => {
      if (stopped) return
      try {
        if (typeof createBot === 'function') createBot()
      } catch (e) {
        console.log('[AFK] createBot error:', e?.message || e)
        scheduleReconnect('createBot-error')
      }
    }, delay)
  }

  bot.once('spawn', () => {
    // reset attempt counter on successful connect
    reconnectAttempts = 0

    // clear any old timers
    cleanup()
    stopped = false

    // stay connected 100ms -> 240s (YOUR REQUEST)
    const stayTime = randomMs(100, 240_000)
    logThrottled(`[AFK] Will leave in ${Math.round(stayTime / 1000)} seconds`)

    scheduleNextJump()

    leaveTimer = setTimeout(() => {
      if (stopped) return
      logThrottled('[AFK] Leaving server (timer)')
      cleanup()
      bot.quit()
    }, stayTime)
  })

  // Stop timers when connection ends, then rejoin with backoff
  bot.on('end', () => {
    cleanup()
    scheduleReconnect('end')
  })

  bot.on('kicked', (reason) => {
    cleanup()
    scheduleReconnect(`kicked:${String(reason).slice(0, 60)}`)
  })

  bot.on('error', (err) => {
    cleanup()
    scheduleReconnect(`error:${err?.code || err?.message || 'unknown'}`)
  })

  return cleanup
}

module.exports = setupLeaveRejoin
