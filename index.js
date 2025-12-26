const setupLeaveRejoin = require('./leaveRejoin')

const mineflayer = require('mineflayer')
const { Movements } = require('mineflayer-pathfinder')
const { pathfinder } = require('mineflayer-pathfinder')
const { GoalBlock } = require('mineflayer-pathfinder').goals

const config = require('./settings.json')

const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Bot has arrived')
})

app.listen(8000, () => {
  console.log('Server started')
})

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  })

  bot.loadPlugin(pathfinder)

  // ---- Timer/interval cleanup helpers ----
  const timers = {
    intervals: new Set(),
    timeouts: new Set(),
  }

  function setSafeInterval(fn, ms) {
    const id = setInterval(fn, ms)
    timers.intervals.add(id)
    return id
  }

  function setSafeTimeout(fn, ms) {
    const id = setTimeout(fn, ms)
    timers.timeouts.add(id)
    return id
  }

  function clearAllTimers() {
    for (const id of timers.intervals) clearInterval(id)
    for (const id of timers.timeouts) clearTimeout(id)
    timers.intervals.clear()
    timers.timeouts.clear()
  }

  // Make these available to other modules (optional but helpful)
  bot._setSafeInterval = setSafeInterval
  bot._setSafeTimeout = setSafeTimeout
  bot._clearAllTimers = clearAllTimers

  // ---- Start leave/rejoin + random jump module ----
  // IMPORTANT: leaveRejoin.js should also clear its own timeouts on end/kicked
  setupLeaveRejoin(bot)

  const mcData = require('minecraft-data')(bot.version)
  const defaultMove = new Movements(bot, mcData)
  bot.settings.colorsEnabled = false

  let pendingPromise = Promise.resolve()

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`)
      console.log(`[Auth] Sent /register command.`)

      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`)

        if (message.includes('successfully registered')) {
          console.log('[INFO] Registration confirmed.')
          resolve()
        } else if (message.includes('already registered')) {
          console.log('[INFO] Bot was already registered.')
          resolve()
        } else if (message.includes('Invalid command')) {
          reject(`Registration failed: Invalid command. Message: "${message}"`)
        } else {
          reject(`Registration failed: unexpected message "${message}".`)
        }
      })
    })
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`)
      console.log(`[Auth] Sent /login command.`)

      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`)

        if (message.includes('successfully logged in')) {
          console.log('[INFO] Login successful.')
          resolve()
        } else if (message.includes('Invalid password')) {
          reject(`Login failed: Invalid password. Message: "${message}"`)
        } else if (message.includes('not registered')) {
          reject(`Login failed: Not registered. Message: "${message}"`)
        } else {
          reject(`Login failed: unexpected message "${message}".`)
        }
      })
    })
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m')

    // Auto-auth
    if (config.utils?.['auto-auth']?.enabled) {
      console.log('[INFO] Started auto-auth module')
      const password = config.utils['auto-auth'].password

      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error))
    }

    // Chat messages
    if (config.utils?.['chat-messages']?.enabled) {
      console.log('[INFO] Started chat-messages module')
      const messages = config.utils['chat-messages']['messages'] || []

      if (config.utils['chat-messages'].repeat) {
        const delay = Number(config.utils['chat-messages']['repeat-delay'] || 60)
        let i = 0

        setSafeInterval(() => {
          if (!bot.player) return
          if (!messages.length) return

          bot.chat(`${messages[i]}`)
          i = (i + 1) % messages.length
        }, delay * 1000)
      } else {
        messages.forEach((msg) => bot.chat(msg))
      }
    }

    // Move to a position
    const pos = config.position
    if (pos?.enabled) {
      console.log(
        `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
      )
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z))
    }

    // Anti-afk (IMPORTANT: DON'T force jump forever here, leaveRejoin handles jumping randomly)
    if (config.utils?.['anti-afk']?.enabled) {
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true)
      }
    }
  })

  bot.on('goal_reached', () => {
    console.log(
      `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
    )
  })

  bot.on('death', () => {
    console.log(
      `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}\x1b[0m`
    )
  })

  // ---- Disconnect handling ----
  function scheduleReconnect() {
    if (!config.utils?.['auto-reconnect']) return

    const delay = Number(config.utils?.['auto-recconect-delay'] ?? 5000)
    setSafeTimeout(() => {
      createBot()
    }, delay)
  }

  bot.on('end', () => {
    clearAllTimers()
    scheduleReconnect()
  })

  bot.on('kicked', (reason) => {
    console.log(
      '\x1b[33m',
      `[AfkBot] Bot was kicked from the server. Reason:\n${reason}`,
      '\x1b[0m'
    )
  })

  bot.on('error', (err) => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
  })
}

createBot()
