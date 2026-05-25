'use strict';

const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          :root { --bg:#0f172a;--container-bg:#111827;--card-bg:#1f2937;--accent:#2dd4bf;--text-main:#f8fafc;--text-dim:#94a3b8; }
          body { font-family:'Inter',sans-serif;background:var(--bg);color:var(--text-main);display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0; }
          .container { background:var(--container-bg);padding:3rem 2rem;border-radius:2rem;width:420px;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);border:1px solid #1f2937;text-align:center; }
          h1 { font-size:1.875rem;font-weight:700;margin-bottom:2.5rem;display:flex;align-items:center;justify-content:center;gap:.75rem;color:#f1f5f9; }
          .card { background:var(--card-bg);border-radius:1rem;padding:1.25rem 1.75rem;margin-bottom:1rem;text-align:left;border-left:4px solid var(--accent);transition:transform .2s; }
          .card:hover { transform:translateX(5px); }
          .label { font-size:.75rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem; }
          .value { font-size:1.25rem;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:.5rem; }
          .dot { width:12px;height:12px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px #4ade80;display:inline-block; }
          .dot.offline { background:#f87171;box-shadow:0 0 10px #f87171; }
          .pulse { animation:pulse-animation 2s infinite; }
          @keyframes pulse-animation { 0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(74,222,128,.7)} 70%{transform:scale(1);box-shadow:0 0 0 10px rgba(74,222,128,0)} 100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(74,222,128,0)} }
          .offline.pulse { animation:pulse-offline 2s infinite; }
          @keyframes pulse-offline { 0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(248,113,113,.7)} 70%{transform:scale(1);box-shadow:0 0 0 10px rgba(248,113,113,0)} 100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(248,113,113,0)} }
          .btn { display:inline-flex;align-items:center;justify-content:center;gap:.75rem;background:var(--accent);color:#0f172a;padding:1rem 2rem;border-radius:1rem;font-weight:700;text-decoration:none;margin-top:1.5rem;transition:all .2s;box-shadow:0 0 20px rgba(45,212,191,.4);width:100%;box-sizing:border-box; }
          .btn:hover { transform:translateY(-2px);box-shadow:0 0 30px rgba(45,212,191,.6);filter:brightness(1.1); }
          .footer { margin-top:1.5rem;font-size:.8125rem;color:#4b5563; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 ${config.name}</h1>
          <div class="card"><div class="label">Status</div><div class="value"><span id="status-dot" class="dot pulse"></span><span id="status-text">Connecting...</span></div></div>
          <div class="card"><div class="label">Uptime</div><div class="value" id="uptime-text">0h 0m 0s</div></div>
          <div class="card"><div class="label">Coordinates</div><div class="value">📍 <span id="coords-text">Searching...</span></div></div>
          <div class="card"><div class="label">Server</div><div class="value" style="font-size:1.1rem;color:#5eead4;">${config.server.ip}</div></div>
          <a href="/tutorial" class="btn">📘 View Setup Guide</a>
          <div class="footer">Auto-refreshing every 5s</div>
        </div>
        <script>
          const statusText=document.getElementById('status-text'),statusDot=document.getElementById('status-dot'),uptimeText=document.getElementById('uptime-text'),coordsText=document.getElementById('coords-text');
          function formatUptime(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h+'h '+m+'m '+sec+'s';}
          async function update(){try{const r=await fetch('/health'),data=await r.json();if(data.status==='connected'){statusText.innerText='Online & Running';statusDot.className='dot pulse';}else{statusText.innerText='Reconnecting...';statusDot.className='dot offline pulse';}uptimeText.innerText=formatUptime(data.uptime);if(data.coords){coordsText.innerText=Math.floor(data.coords.x)+', '+Math.floor(data.coords.y)+', '+Math.floor(data.coords.z);}else{coordsText.innerText='Searching Position...';}}catch(e){statusText.innerText='System Offline';statusDot.className='dot offline';}}
          setInterval(update,5000);update();
        </script>
      </body>
    </html>
  `);
});

app.get('/tutorial', (req, res) => {
  res.send(`
    <html><head><title>${config.name} - Setup Guide</title>
    <style>body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#cbd5e1;padding:40px;max-width:800px;margin:0 auto;line-height:1.6;}h1,h2{color:#2dd4bf;}h1{border-bottom:2px solid #334155;padding-bottom:10px;}.card{background:#1e293b;padding:25px;border-radius:12px;margin-bottom:20px;border:1px solid #334155;}a{color:#38bdf8;text-decoration:none;}code{background:#334155;padding:2px 6px;border-radius:4px;color:#e2e8f0;font-family:monospace;}.btn-home{display:inline-block;margin-bottom:20px;padding:8px 16px;background:#334155;color:white;border-radius:6px;text-decoration:none;}</style>
    </head><body>
    <a href="/" class="btn-home">Back to Dashboard</a>
    <h1>Setup Guide (Under 15 Minutes)</h1>
    <div class="card"><h2>Step 1: Configure Aternos</h2><ol><li>Go to <strong>Aternos</strong>.</li><li>Install <strong>Paper/Bukkit</strong> software.</li><li>Enable <strong>Cracked</strong> mode (Green Switch).</li><li>Install Plugins: <code>ViaVersion</code>, <code>ViaBackwards</code>, <code>ViaRewind</code>.</li></ol></div>
    <div class="card"><h2>Step 2: GitHub Setup</h2><ol><li>Download this code as ZIP and extract.</li><li>Edit <code>settings.json</code> with your IP/Port.</li><li>Upload all files to a new <strong>GitHub Repository</strong>.</li></ol></div>
    <div class="card"><h2>Step 3: Render (Free 24/7 Hosting)</h2><ol><li>Go to <a href="https://render.com" target="_blank">Render.com</a> and create a Web Service.</li><li>Connect your GitHub.</li><li>Build Command: <code>npm install</code></li><li>Start Command: <code>npm start</code></li><li><strong>Magic:</strong> The bot automatically pings itself to stay awake!</li></ol></div>
    <p style="text-align:center;margin-top:40px;color:#64748b;">AFK Bot Dashboard</p>
    </body></html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: botState.connected ? 'connected' : 'disconnected',
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: (bot && bot.entity) ? bot.entity.position : null,
    lastActivity: botState.lastActivity,
    reconnectAttempts: botState.reconnectAttempts,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
  });
});

app.get('/ping', (req, res) => res.send('pong'));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${server.address().port}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = PORT + 1;
    console.log(`[Server] Port ${PORT} in use - trying port ${fallbackPort}`);
    server.listen(fallbackPort, '0.0.0.0');
  } else {
    console.log(`[Server] HTTP server error: ${err.message}`);
  }
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ============================================================
// SELF-PING  — interval from settings.json: server.self-ping-interval
// ============================================================
function startSelfPing() {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (!renderUrl) {
    console.log('[KeepAlive] No RENDER_EXTERNAL_URL set - self-ping disabled (running locally)');
    return;
  }
  const interval = config.server['self-ping-interval'] || 600000;
  setInterval(() => {
    const protocol = renderUrl.startsWith('https') ? https : http;
    protocol.get(`${renderUrl}/ping`, () => {}).on('error', (err) => {
      console.log(`[KeepAlive] Self-ping failed: ${err.message}`);
    });
  }, interval);
  console.log(`[KeepAlive] Self-ping started (every ${interval / 1000}s)`);
}

startSelfPing();

// ============================================================
// MEMORY MONITORING  — interval from settings.json: server.memory-log-interval
// ============================================================
setInterval(() => {
  const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  console.log(`[Memory] Heap: ${heapMB} MB`);
}, config.server['memory-log-interval'] || 300000);

// ============================================================
// RECONNECTION & TIMEOUT MANAGEMENT
// ============================================================
let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;
let _microWalkCleanup = null;

function clearBotTimeouts() {
  if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
  if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
}

// Discord rate limit from settings.json: discord.rate-limit-ms
let lastDiscordSend = 0;

function clearAllIntervals() {
  console.log(`[Cleanup] Clearing ${activeIntervals.length} intervals`);
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
  if (_microWalkCleanup) { _microWalkCleanup(); _microWalkCleanup = null; }
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function getReconnectDelay() {
  if (botState.wasThrottled) {
    botState.wasThrottled = false;
    // Range from settings.json: utils.throttle-reconnect-min / throttle-reconnect-max
    const min = config.utils['throttle-reconnect-min'] || 60000;
    const max = config.utils['throttle-reconnect-max'] || 60000;
    const throttleDelay = min + Math.floor(Math.random() * (max + 1));
    console.log(`[Bot] Throttle detected - using extended delay: ${throttleDelay / 1000}s`);
    return throttleDelay;
  }
  const baseDelay = config.utils['auto-reconnect-delay'] || 3000;
  const maxDelay  = config.utils['max-reconnect-delay']  || 30000;
  const jitter    = config.utils['reconnect-jitter']     || 2000;
  const delay = Math.min(baseDelay * Math.pow(2, botState.reconnectAttempts), maxDelay);
  return delay + Math.floor(Math.random() * jitter);
}

function createBot() {
  if (isReconnecting) {
    console.log('[Bot] Already reconnecting, skipping...');
    return;
  }

  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch (e) {
      console.log('[Cleanup] Error ending previous bot:', e.message);
    }
    bot = null;
  }

  console.log(`[Bot] Creating bot instance...`);
  console.log(`[Bot] Connecting to ${config.server.ip}:${config.server.port}`);

  try {
    const botVersion = config.server.version && config.server.version.trim() !== ''
      ? config.server.version : false;

    bot = mineflayer.createBot({
      username: config['bot-account'].username,
      password: config['bot-account'].password || undefined,
      auth: config['bot-account'].type,
      host: config.server.ip,
      port: config.server.port,
      version: botVersion,
      hideErrors: false,
      // Heartbeat timeout from settings.json: server.check-timeout-interval
      checkTimeoutInterval: config.server['check-timeout-interval'] || 600000
    });

    bot.loadPlugin(pathfinder);

    // -------------------------------------------------------
    // RESOURCE PACK — always decline custom pack requests
    // -------------------------------------------------------
    bot.on('resource_pack_send', (url) => {
      console.log(`[ResourcePack] Declining pack request: ${url}`);
      try { bot.acceptResourcePack(false); } catch (e) {
        console.log('[ResourcePack] Could not send decline response:', e.message);
      }
    });

    // Connection timeout from settings.json: server.connection-timeout
    clearBotTimeouts();
    connectionTimeoutId = setTimeout(() => {
      if (!botState.connected) {
        console.log('[Bot] Connection timeout - no spawn received');
        try { bot.removeAllListeners(); bot.end(); } catch (e) { /* ignore */ }
        bot = null;
        scheduleReconnect();
      }
    }, config.server['connection-timeout'] || 20000);

    let spawnHandled = false;

    bot.once('spawn', () => {
      if (spawnHandled) return;
      spawnHandled = true;

      clearBotTimeouts();
      botState.connected = true;
      botState.lastActivity = Date.now();
      botState.reconnectAttempts = 0;
      isReconnecting = false;

      console.log(`[Bot] [+] Successfully spawned on server! (Version: ${bot.version})`);
      if (config.discord && config.discord.events && config.discord.events.connect) {
        sendDiscordWebhook(`[+] **Connected** to \`${config.server.ip}\``, 0x4ade80);
      }

      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.allowFreeMotion = false;
      defaultMove.canDig = false;
      defaultMove.liquidCost = 1000;
      defaultMove.fallDamageCost = 1000;

      initializeModules(bot, mcData, defaultMove);

      // Creative mode delay from settings.json: server.creative-mode-delay
      setTimeout(() => {
        if (bot && botState.connected && config.server['try-creative']) {
          bot.chat('/gamemode creative');
          console.log('[INFO] Attempted to set creative mode (requires OP)');
        }
      }, config.server['creative-mode-delay'] || 3000);

      bot.on('messagestr', (message) => {
        if (
          message.includes('commands.gamemode.success.self') ||
          message.includes('Set own game mode to Creative Mode')
        ) { console.log('[INFO] Bot is now in Creative Mode.'); }
      });
    });

    // -------------------------------------------------------
    // AUTO-RESPAWN — delay from settings.json: utils.respawn-delay
    // -------------------------------------------------------
    bot.on('death', () => {
      console.log('[Bot] Died — respawning...');
      if (config.discord && config.discord.events && config.discord.events.disconnect) {
        sendDiscordWebhook('[!] **Bot died** — respawning...', 0xfbbf24);
      }
      setTimeout(() => {
        if (bot && botState.connected) {
          try { bot.respawn(); console.log('[Bot] Respawn sent.'); }
          catch (e) { console.log('[Bot] Respawn error:', e.message); }
        }
      }, config.utils['respawn-delay'] || 1000);
    });

    bot.on('kicked', (reason) => {
      const kickReason = typeof reason === 'object' ? JSON.stringify(reason) : reason;
      console.log(`[Bot] Kicked: ${kickReason}`);
      botState.connected = false;
      botState.errors.push({ type: 'kicked', reason: kickReason, time: Date.now() });
      clearAllIntervals();

      const reasonStr = String(kickReason).toLowerCase();
      if (reasonStr.includes('throttl') || reasonStr.includes('wait before reconnect') || reasonStr.includes('too fast')) {
        console.log('[Bot] Throttle kick detected - will use extended reconnect delay');
        botState.wasThrottled = true;
      }
      if (config.discord && config.discord.events && config.discord.events.disconnect) {
        sendDiscordWebhook(`[!] **Kicked**: ${kickReason}`, 0xff0000);
      }
    });

    bot.on('end', (reason) => {
      console.log(`[Bot] Disconnected: ${reason || 'Unknown reason'}`);
      botState.connected = false;
      clearAllIntervals();
      spawnHandled = false;

      if (config.discord && config.discord.events && config.discord.events.disconnect) {
        sendDiscordWebhook(`[-] **Disconnected**: ${reason || 'Unknown'}`, 0xf87171);
      }
      scheduleReconnect();
    });

    bot.on('error', (err) => {
      console.log(`[Bot] Error: ${err.message || ''}`);
      botState.errors.push({ type: 'error', message: err.message || '', time: Date.now() });
    });

  } catch (err) {
    console.log(`[Bot] Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearBotTimeouts();
  if (isReconnecting) {
    console.log('[Bot] Reconnect already scheduled, skipping duplicate.');
    return;
  }
  isReconnecting = true;
  botState.reconnectAttempts++;
  const delay = getReconnectDelay();
  console.log(`[Bot] Reconnecting in ${delay / 1000}s (attempt #${botState.reconnectAttempts})`);
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, delay);
}

// ============================================================
// MODULE INITIALIZATION
// ============================================================
function initializeModules(bot, mcData, defaultMove) {
  console.log('[Modules] Initializing all modules...');

  // ---------- AUTO AUTH ----------
  if (config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
    const password = config.utils['auto-auth'].password;
    // Failsafe delay from settings.json: utils.auto-auth.failsafe-delay
    const failsafeDelay = config.utils['auto-auth']['failsafe-delay'] || 10000;
    let authHandled = false;

    const tryAuth = (type) => {
      if (authHandled || !bot || !botState.connected) return;
      authHandled = true;
      if (type === 'register') {
        bot.chat(`/register ${password} ${password}`);
        console.log('[Auth] Detected register prompt - sent /register');
      } else {
        bot.chat(`/login ${password}`);
        console.log('[Auth] Detected login prompt - sent /login');
      }
    };

    bot.on('messagestr', (message) => {
      if (authHandled) return;
      const msg = message.toLowerCase();
      if (msg.includes('/register') || msg.includes('register ') || msg.includes('지정된 비밀번호')) {
        tryAuth('register');
      } else if (msg.includes('/login') || msg.includes('login ') || msg.includes('로그인')) {
        tryAuth('login');
      }
    });

    setTimeout(() => {
      if (!authHandled && bot && botState.connected) {
        console.log(`[Auth] No prompt after ${failsafeDelay}ms, sending /login as failsafe`);
        bot.chat(`/login ${password}`);
        authHandled = true;
      }
    }, failsafeDelay);
  }

  // ---------- CHAT MESSAGES ----------
  if (config.utils['chat-messages'] && config.utils['chat-messages'].enabled) {
    const messages = config.utils['chat-messages'].messages;
    if (config.utils['chat-messages'].repeat) {
      let i = 0;
      addInterval(() => {
        if (bot && botState.connected) {
          bot.chat(messages[i]);
          botState.lastActivity = Date.now();
          i = (i + 1) % messages.length;
        }
      }, config.utils['chat-messages']['repeat-delay'] * 1000);
    } else {
      messages.forEach((msg, idx) => {
        setTimeout(() => { if (bot && botState.connected) bot.chat(msg); }, idx * 1000);
      });
    }
  }

  // ---------- MOVE TO POSITION ----------
  if (config.position && config.position.enabled &&
      !(config.movement && config.movement['circle-walk'] && config.movement['circle-walk'].enabled)) {
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    console.log('[Position] Navigating to configured position...');
  }

  // ---------- ANTI-AFK ----------
  if (config.utils['anti-afk'] && config.utils['anti-afk'].enabled) {
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try { bot.swingArm(); } catch (e) {}
    }, 10000 + Math.floor(Math.random() * 50000));

    addInterval(() => {
      if (!bot || !botState.connected) return;
      try { bot.setQuickBarSlot(Math.floor(Math.random() * 9)); } catch (e) {}
    }, 30000 + Math.floor(Math.random() * 90000));

    addInterval(() => {
      if (!bot || !botState.connected || typeof bot.setControlState !== 'function') return;
      if (Math.random() > 0.9) {
        let count = 2 + Math.floor(Math.random() * 4);
        const doTeabag = () => {
          if (count <= 0 || !bot || typeof bot.setControlState !== 'function') return;
          try {
            bot.setControlState('sneak', true);
            setTimeout(() => {
              if (bot && typeof bot.setControlState === 'function') bot.setControlState('sneak', false);
              count--;
              setTimeout(doTeabag, 150);
            }, 150);
          } catch (e) {}
        };
        doTeabag();
      }
    }, 120000 + Math.floor(Math.random() * 180000));

    if (!(config.movement && config.movement['circle-walk'] && config.movement['circle-walk'].enabled)) {
      startImprovedMicroWalk(bot);
    }

    if (config.utils['anti-afk'].sneak) {
      try {
        if (typeof bot.setControlState === 'function') bot.setControlState('sneak', true);
      } catch (e) {}
    }
  }

  // ---------- MOVEMENT MODULES ----------
  if (config.movement && config.movement.enabled !== false) {
    if (config.movement['circle-walk'] && config.movement['circle-walk'].enabled) {
      startCircleWalk(bot, defaultMove);
    }
    if (config.movement['random-jump'] && config.movement['random-jump'].enabled &&
        !(config.movement['circle-walk'] && config.movement['circle-walk'].enabled)) {
      startRandomJump(bot);
    }
    if (config.movement['look-around'] && config.movement['look-around'].enabled) {
      startLookAround(bot);
    }
  }

  // ---------- CUSTOM MODULES ----------
  if (config.modules.avoidMobs && !config.modules.combat) avoidMobs(bot);
  if (config.modules.combat)   combatModule(bot, mcData);
  if (config.modules.beds)     bedModule(bot, mcData);
  if (config.modules.chat)     chatModule(bot);

  console.log('[Modules] All modules initialized!');
}

// ============================================================
// MOVEMENT HELPERS
// ============================================================

// Improved micro-walk — intervals from settings.json:
//   utils.anti-afk.walk-interval  (base delay between steps, ms)
//   utils.anti-afk.walk-jitter    (random extra delay added, ms)
function startImprovedMicroWalk(bot) {
  const MOVES = [
    { key: 'forward', weight: 5 },
    { key: 'back',    weight: 2 },
    { key: 'left',    weight: 1 },
    { key: 'right',   weight: 1 },
  ];
  const TOTAL_WEIGHT = MOVES.reduce((s, m) => s + m.weight, 0);

  function pickMove() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const m of MOVES) { r -= m.weight; if (r <= 0) return m.key; }
    return 'forward';
  }

  // Read from config; fall back to sensible defaults
  const BASE_INTERVAL = config.utils['anti-afk']['walk-interval'] || 90000;
  const JITTER        = config.utils['anti-afk']['walk-jitter']   || 180000;

  let walkTimeoutId = null;

  function scheduleNextWalk() {
    if (walkTimeoutId) clearTimeout(walkTimeoutId);
    const delay = BASE_INTERVAL + Math.floor(Math.random() * JITTER);
    walkTimeoutId = setTimeout(doWalk, delay);
  }

  function doWalk() {
    if (!bot || !botState.connected || typeof bot.setControlState !== 'function') {
      scheduleNextWalk();
      return;
    }
    try {
      bot.look(Math.random() * Math.PI * 2 - Math.PI, (Math.random() - 0.5) * (Math.PI / 4), true);
      const key      = pickMove();
      const duration = 400 + Math.floor(Math.random() * 1400);

      bot.setControlState(key, true);
      botState.lastActivity = Date.now();

      if (key === 'forward' && Math.random() < 0.3) {
        setTimeout(() => {
          if (!bot || typeof bot.setControlState !== 'function') return;
          try {
            bot.setControlState('jump', true);
            setTimeout(() => {
              try { if (bot && typeof bot.setControlState === 'function') bot.setControlState('jump', false); } catch (_) {}
            }, 250);
          } catch (_) {}
        }, Math.floor(duration * 0.4));
      }

      setTimeout(() => {
        try { if (bot && typeof bot.setControlState === 'function') bot.setControlState(key, false); } catch (_) {}
        scheduleNextWalk();
      }, duration);

    } catch (e) {
      console.log('[MicroWalk] Error:', e.message);
      scheduleNextWalk();
    }
  }

  _microWalkCleanup = () => {
    if (walkTimeoutId) { clearTimeout(walkTimeoutId); walkTimeoutId = null; }
  };

  scheduleNextWalk();
}

function startCircleWalk(bot, defaultMove) {
  const radius = config.movement['circle-walk'].radius;
  let angle = 0;
  let lastPathTime = 0;

  addInterval(() => {
    if (!bot || !botState.connected) return;
    const now = Date.now();
    if (now - lastPathTime < 2000) return;
    lastPathTime = now;
    try {
      const x = bot.entity.position.x + Math.cos(angle) * radius;
      const z = bot.entity.position.z + Math.sin(angle) * radius;
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(Math.floor(x), Math.floor(bot.entity.position.y), Math.floor(z)));
      angle += Math.PI / 4;
      botState.lastActivity = Date.now();
    } catch (e) { console.log('[CircleWalk] Error:', e.message); }
  }, config.movement['circle-walk'].speed);
}

function startRandomJump(bot) {
  addInterval(() => {
    if (!bot || !botState.connected || typeof bot.setControlState !== 'function') return;
    try {
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot && typeof bot.setControlState === 'function') bot.setControlState('jump', false);
      }, 300);
      botState.lastActivity = Date.now();
    } catch (e) { console.log('[RandomJump] Error:', e.message); }
  }, config.movement['random-jump'].interval);
}

function startLookAround(bot) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try {
      bot.look((Math.random() * Math.PI * 2) - Math.PI, (Math.random() * Math.PI / 2) - Math.PI / 4, false);
      botState.lastActivity = Date.now();
    } catch (e) { console.log('[LookAround] Error:', e.message); }
  }, config.movement['look-around'].interval);
}

// ============================================================
// CUSTOM MODULES
// ============================================================

// Avoid mobs — safe distance from settings.json: combat.safe-distance
function avoidMobs(bot) {
  const safeDistance = config.combat['safe-distance'] || 5;
  addInterval(() => {
    if (!bot || !botState.connected || typeof bot.setControlState !== 'function') return;
    try {
      const entities = Object.values(bot.entities).filter(e =>
        e.type === 'mob' || (e.type === 'player' && e.username !== bot.username)
      );
      for (const e of entities) {
        if (!e.position) continue;
        if (bot.entity.position.distanceTo(e.position) < safeDistance) {
          bot.setControlState('back', true);
          setTimeout(() => {
            if (bot && typeof bot.setControlState === 'function') bot.setControlState('back', false);
          }, 500);
          break;
        }
      }
    } catch (e) { console.log('[AvoidMobs] Error:', e.message); }
  }, 2000);
}

// Combat module
// attack-range    from settings.json: combat.attack-range
// target-lock-ms  from settings.json: combat.target-lock-ms
// eat-at-hunger   from settings.json: combat.eat-at-hunger
function combatModule(bot, mcData) {
  const attackRange   = config.combat['attack-range']   || 4;
  const targetLockMs  = config.combat['target-lock-ms'] || 3000;
  const eatAtHunger   = config.combat['eat-at-hunger']  || 14;

  let lastAttackTime = 0;
  let lockedTarget = null;
  let lockedTargetExpiry = 0;

  bot.on('physicsTick', () => {
    if (!bot || !botState.connected || !config.combat['attack-mobs']) return;
    const now = Date.now();
    if (now - lastAttackTime < 620) return;

    try {
      if (lockedTarget && now < lockedTargetExpiry && bot.entities[lockedTarget.id] && lockedTarget.position) {
        if (bot.entity.position.distanceTo(lockedTarget.position) < attackRange) {
          bot.attack(lockedTarget);
          lastAttackTime = now;
          return;
        } else { lockedTarget = null; }
      }

      const mobs = Object.values(bot.entities).filter(e =>
        e.type === 'mob' && e.position &&
        bot.entity.position.distanceTo(e.position) < attackRange
      );
      if (mobs.length > 0) {
        lockedTarget = mobs[0];
        lockedTargetExpiry = now + targetLockMs;
        bot.attack(lockedTarget);
        lastAttackTime = now;
      }
    } catch (e) { console.log('[Combat] Error:', e.message); }
  });

  bot.on('health', () => {
    if (!config.combat['auto-eat']) return;
    try {
      if (bot.food < eatAtHunger) {
        const food = bot.inventory.items().find(i => i.foodPoints && i.foodPoints > 0);
        if (food) {
          bot.equip(food, 'hand')
            .then(() => bot.consume())
            .catch(e => console.log('[AutoEat] Error:', e.message));
        }
      }
    } catch (e) { console.log('[AutoEat] Error:', e.message); }
  });
}

// Bed module
// check-interval  from settings.json: beds.check-interval
// search-radius   from settings.json: beds.search-radius
function bedModule(bot, mcData) {
  const checkInterval = config.beds['check-interval'] || 10000;
  const searchRadius  = config.beds['search-radius']  || 8;
  let isTryingToSleep = false;

  addInterval(async () => {
    if (!bot || !botState.connected || !config.beds['place-night']) return;
    try {
      const isNight = bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23500;
      if (isNight && !isTryingToSleep) {
        const bedBlock = bot.findBlock({
          matching: block => block.name.includes('bed'),
          maxDistance: searchRadius
        });
        if (bedBlock) {
          isTryingToSleep = true;
          try { await bot.sleep(bedBlock); console.log('[Bed] Sleeping...'); }
          catch (e) { /* night not deep enough or monsters nearby */ }
          finally { isTryingToSleep = false; }
        }
      }
    } catch (e) { isTryingToSleep = false; console.log('[Bed] Error:', e.message); }
  }, checkInterval);
}

// Chat module
function chatModule(bot) {
  bot.on('chat', (username, message) => {
    if (!bot || username === bot.username) return;
    try {
      if (config.discord && config.discord.enabled && config.discord.events && config.discord.events.chat) {
        sendDiscordWebhook(`💬 **${username}**: ${message}`, 0x7289da);
      }
      if (config.chat && config.chat.respond) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) bot.chat(`Hello, ${username}!`);
        if (message.startsWith('!tp ')) {
          const target = message.split(' ')[1];
          if (target) bot.chat(`/tp ${target}`);
        }
      }
    } catch (e) { console.log('[Chat] Error:', e.message); }
  });
}

// ============================================================
// CONSOLE COMMANDS
// ============================================================
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!bot || !botState.connected) { console.log('[Console] Bot not connected'); return; }
  const trimmed = line.trim();
  if (trimmed.startsWith('say '))       bot.chat(trimmed.slice(4));
  else if (trimmed.startsWith('cmd '))  bot.chat('/' + trimmed.slice(4));
  else if (trimmed === 'status')
    console.log(`Connected: ${botState.connected}, Uptime: ${formatUptime(Math.floor((Date.now() - botState.startTime) / 1000))}`);
  else bot.chat(trimmed);
});

// ============================================================
// DISCORD WEBHOOK
// rate-limit-ms from settings.json: discord.rate-limit-ms
// ============================================================
function sendDiscordWebhook(content, color = 0x0099ff) {
  if (!config.discord || !config.discord.enabled || !config.discord.webhookUrl ||
      config.discord.webhookUrl.includes('YOUR_DISCORD')) return;

  const rateLimitMs = config.discord['rate-limit-ms'] || 5000;
  const now = Date.now();
  if (now - lastDiscordSend < rateLimitMs) {
    console.log('[Discord] Rate limited - skipping webhook');
    return;
  }
  lastDiscordSend = now;

  const protocol = config.discord.webhookUrl.startsWith('https') ? https : http;
  const urlParts  = new URL(config.discord.webhookUrl);
  const payload   = JSON.stringify({
    username: config.name,
    embeds: [{ description: content, color, timestamp: new Date().toISOString(), footer: { text: 'AFK Bot' } }]
  });

  const req = protocol.request({
    hostname: urlParts.hostname,
    port: 443,
    path: urlParts.pathname + urlParts.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload, 'utf8') }
  }, () => {});
  req.on('error', (e) => console.log(`[Discord] Webhook error: ${e.message}`));
  req.write(payload);
  req.end();
}

// ============================================================
// CRASH RECOVERY
// error-cap / error-keep from settings.json: server.error-cap / server.error-keep
// ============================================================
process.on('uncaughtException', (err) => {
  const msg = err.message || 'Unknown';
  console.log(`[FATAL] Uncaught Exception: ${msg}`);
  botState.errors.push({ type: 'uncaught', message: msg, time: Date.now() });

  const errorCap  = config.server['error-cap']  || 100;
  const errorKeep = config.server['error-keep'] || 50;
  if (botState.errors.length > errorCap) botState.errors = botState.errors.slice(-errorKeep);

  const isNetworkError = ['PartialReadError','ECONNRESET','EPIPE','ETIMEDOUT','timed out','write after end','This socket has been ended']
    .some(s => msg.includes(s));
  if (isNetworkError) console.log('[FATAL] Known network/protocol error - recovering gracefully...');

  clearAllIntervals();
  botState.connected = false;

  if (isReconnecting) {
    console.log('[FATAL] isReconnecting was stuck - resetting before crash recovery');
    isReconnecting = false;
    if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
  }

  setTimeout(() => scheduleReconnect(), isNetworkError ? 5000 : 10000);
});

process.on('unhandledRejection', (reason) => {
  console.log(`[FATAL] Unhandled Rejection: ${reason}`);
  botState.errors.push({ type: 'rejection', message: String(reason), time: Date.now() });
});

process.on('SIGTERM', () => console.log('[System] SIGTERM received — ignoring, bot will stay alive.'));
process.on('SIGINT',  () => console.log('[System] SIGINT received — ignoring, bot will stay alive.'));

// ============================================================
// START
// ============================================================
console.log('='.repeat(50));
console.log('  Minecraft AFK Bot v2.7 - Fully Config-Driven');
console.log('='.repeat(50));
console.log(`Server:         ${config.server.ip}:${config.server.port}`);
console.log(`Version:        ${config.server.version || 'auto-detect'}`);
console.log(`Conn timeout:   ${config.server['connection-timeout'] || 20000}ms`);
console.log(`Respawn delay:  ${config.utils['respawn-delay'] || 1000}ms`);
console.log(`Walk interval:  ${config.utils['anti-afk']['walk-interval'] || 90000}ms`);
console.log(`Attack range:   ${config.combat['attack-range'] || 4} blocks`);
console.log(`Auto-Reconnect: ${config.utils['auto-reconnect'] ? 'Enabled' : 'Disabled'}`);
console.log('='.repeat(50));

createBot();
