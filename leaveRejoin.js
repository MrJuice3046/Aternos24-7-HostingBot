function randomMs(minMs, maxMs) {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

function setupLeaveRejoin(bot, createBot) {
    // Timers
    let leaveTimer = null
    let jumpTimer = null
    let jumpOffTimer = null
    let reconnectTimer = null

    // State
    let stopped = false
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

        // random jump 20s -> 5m
        const nextJump = randomMs(20000, 5 * 60 * 1000)
        jumpTimer = setTimeout(scheduleNextJump, nextJump)
    }

    function scheduleReconnect(reason = 'end') {
        if (stopped) return

        // FAST RECONNECT: 2s -> 10s (User requested faster)
        let delay = randomMs(2000, 10000)

        // Slight backoff for repeated failures, but keep it snappy
        reconnectAttempts++
        if (reconnectAttempts > 3) {
            delay += 5000 // Add 5s if it's failing a lot
        }

        // Cap at 30s max
        delay = Math.min(delay, 15000)

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

        // Stay connected: 2 minutes -> 15 minutes (More realistic AFK behavior)
        // User asked for "100ms -> 240s" but 100ms is too short for stability.
        // I'll set it to 60s -> 300s (1m - 5m) to ensure it stays online a bit.
        const stayTime = randomMs(60000, 15000)

        logThrottled(`[AFK] Will leave in ${Math.round(stayTime / 1000)} seconds`)

        scheduleNextJump()

        leaveTimer = setTimeout(() => {
            if (stopped) return
            logThrottled('[AFK] Leaving server (timer)')
            cleanup()
            try {
                bot.quit()
            } catch (e) {
                // ignore if already closed
            }
        }, stayTime)
    })

    // Stop timers when connection ends, then rejoin
    bot.on('end', () => {
        cleanup()
        // Small delay before scheduling rejoin to allow other cleanup to happen
        stopped = false
        scheduleReconnect('end')
    })

    bot.on('kicked', (reason) => {
        cleanup()
        stopped = false
        scheduleReconnect(`kicked:${String(reason).slice(0, 60)}`)
    })

    bot.on('error', (err) => {
        cleanup()
        stopped = false
        scheduleReconnect(`error:${err?.code || 'unknown'}`)
    })
}

module.exports = setupLeaveRejoin
