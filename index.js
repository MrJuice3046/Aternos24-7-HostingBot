'use strict';

const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const http = require('http');
const https = require('https');
const mc = require('minecraft-protocol');
const fs = require('fs');
const path = require('path');

// ============================================================
// EXPRESS SERVER (Dashboard + Settings API)
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  wasThrottled: false
};

let bot = null;
let botConnectTime = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;
let intentionalDisconnect = false;
let lastDeathTime = 0;

let runtimeConfig = {};

function getNested(obj, path) {
  return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
}

function isModuleEnabled(path) {
  if (runtimeConfig[path] !== undefined) return runtimeConfig[path];
  return getNested(config, path);
}

// ============================================================
// DASHBOARD
// ============================================================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.name} Dashboard</title>
  <style>
    :root { --bg: #0f1117; --card: #1a1d27; --accent: #6366f1; --text: #e2e8f0; --text-dim: #94a3b8; --border: #2d3143; --green: #22c55e; --red: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; }
    .sidebar { width: 260px; background: var(--card); padding: 2rem 1.5rem; border-right: 1px solid var(--border); position: fixed; height: 100vh; z-index: 10; }
    .sidebar h2 { font-size: 1.4rem; margin-bottom: 2rem; background: linear-gradient(135deg, var(--accent), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .sidebar nav a { display: flex; align-items: center; gap: 0.8rem; padding: 0.8rem 1rem; border-radius: 0.6rem; color: var(--text-dim); text-decoration: none; margin-bottom: 0.3rem; transition: all 0.2s; }
    .sidebar nav a:hover, .sidebar nav a.active { background: #252836; color: var(--text); }
    .main { flex: 1; margin-left: 260px; padding: 2rem; }
    .status-bar { background: var(--card); border-radius: 1rem; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 0.5rem; }
    .online-dot { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .offline-dot { background: var(--red); box-shadow: 0 0 8px var(--red); }
    .card { background: var(--card); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
    .card h3 { color: var(--text-dim); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; }
    .btn { background: var(--accent); color: white; border: none; padding: 0.7rem 1.4rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; transition: background 0.2s; }
    .btn:hover { background: #818cf8; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: #252836; }
    .btn-danger { background: var(--red); }
    .btn-success { background: var(--green); }
    input { background: #0f1117; border: 1px solid var(--border); color: var(--text); padding: 0.7rem; border-radius: 0.5rem; width: 100%; font-size: 0.95rem; }
    .input-group { display: flex; gap: 0.5rem; }
    .input-group input { flex: 1; }
    .coords-display { font-family: 'Fira Code', monospace; font-size: 1.2rem; color: #818cf8; }
    @media (max-width: 768px) { .sidebar { display: none; } .main { margin-left: 0; } }
  </style>
</head>
<body>
  <aside class="sidebar">
    <h2>🤖 AFK Bot</h2>
    <nav>
      <a href="/" class="active">📊 Dashboard</a>
      <a href="/settings">⚙️ Settings</a>
    </nav>
  </aside>
  <main class="main">
    <div class="status-bar">
      <div>
        <span id="status-dot" class="status-dot offline-dot"></span>
        <strong id="status-text">Offline</strong>
        <span style="margin-left: 1rem; color: var(--text-dim);" id="ping-text">Ping: -- ms</span>
      </div>
      <div style="color: var(--text-dim);">
        🕒 Connected: <strong id="timer">0h 0m 0s</strong>
      </div>
      <div class="coords-display" id="coords">📍 ---</div>
    </div>
    <div class="card">
      <h3>🎯 Quick Navigation</h3>
      <div class="input-group">
        <input type="number" id="navX" placeholder="X">
        <input type="number" id="navY" placeholder="Y">
        <input type="number" id="navZ" placeholder="Z">
        <button class="btn" onclick="navigate()">Go</button>
      </div>
    </div>
    <div class="card">
      <h3>💬 Chat & Command</h3>
      <div class="input-group">
        <input type="text" id="chatMsg" placeholder="Message..." style="flex:2;">
        <button class="btn" onclick="sendChat()">Send</button>
        <input type="text" id="cmdInput" placeholder="/command" style="flex:1;">
        <button class="btn btn-outline" onclick="sendCmd()">Run</button>
      </div>
    </div>
    <div class="card" style="display: flex; gap: 0.5rem;">
      <button class="btn btn-danger" onclick="restart()">🔄 Restart</button>
      <button class="btn btn-outline" onclick="disconnect()">⏹️ Disconnect</button>
      <button class="btn btn-success" onclick="reconnect()">🔁 Reconnect</button>
    </div>
  </main>
  <script>
    let connSince = null;
    async function refresh() {
      const r = await fetch('/health');
      const d = await r.json();
      document.getElementById('status-dot').className = 'status-dot ' + (d.status==='connected'?'online-dot':'offline-dot');
      document.getElementById('status-text').textContent = d.status==='connected'?'Online':'Offline';
      document.getElementById('ping-text').textContent = 'Ping: ' + (d.ping||'--') + ' ms';
      if(d.connectedSince) connSince = d.connectedSince; else connSince = null;
      updateTimer();
      if(d.coords) document.getElementById('coords').textContent = '📍 ' + Math.floor(d.coords.x) + ', ' + Math.floor(d.coords.y) + ', ' + Math.floor(d.coords.z);
    }
    function updateTimer() {
      if(!connSince) { document.getElementById('timer').textContent = '0h 0m 0s'; return; }
      const s = Math.floor((Date.now()-connSince)/1000);
      document.getElementById('timer').textContent = Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m '+s%60+'s';
    }
    async function navigate() {
      await fetch('/setcoords', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({x:+document.getElementById('navX').value, y:+document.getElementById('navY').value, z:+document.getElementById('navZ').value})});
    }
    async function sendChat() {
      await fetch('/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message:document.getElementById('chatMsg').value})});
    }
    async function sendCmd() {
      await fetch('/cmd', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command:document.getElementById('cmdInput').value})});
    }
    async function restart() { if(confirm('Restart?')) await fetch('/restart',{method:'POST'}); }
    async function disconnect() { await fetch('/disconnect',{method:'POST'}); }
    async function reconnect() { await fetch('/reconnect',{method:'POST'}); }
    setInterval(updateTimer, 1000);
    setInterval(refresh, 3000);
    refresh();
  </script>
</body>
</html>`);
});

// ============================================================
// SETTINGS PAGE
// ============================================================
app.get('/settings', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings - ${config.name}</title>
  <style>
    :root { --bg: #0f1117; --card: #1a1d27; --accent: #6366f1; --text: #e2e8f0; --text-dim: #94a3b8; --border: #2d3143; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; }
    .sidebar { width: 260px; background: var(--card); padding: 2rem 1.5rem; border-right: 1px solid var(--border); position: fixed; height: 100vh; z-index: 10; }
    .sidebar h2 { font-size: 1.4rem; margin-bottom: 2rem; background: linear-gradient(135deg, var(--accent), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .sidebar nav a { display: flex; align-items: center; gap: 0.8rem; padding: 0.8rem 1rem; border-radius: 0.6rem; color: var(--text-dim); text-decoration: none; margin-bottom: 0.3rem; transition: all 0.2s; }
    .sidebar nav a:hover, .sidebar nav a.active { background: #252836; color: var(--text); }
    .main { flex: 1; margin-left: 260px; padding: 2rem; }
    .card { background: var(--card); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid var(--border); }
    h3 { color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; font-size: 0.9rem; }
    label { display: block; color: var(--text-dim); font-size: 0.85rem; margin-bottom: 0.3rem; }
    input, textarea { width: 100%; background: #0f1117; border: 1px solid var(--border); color: var(--text); padding: 0.7rem; border-radius: 0.5rem; margin-bottom: 1rem; font-family: inherit; }
    textarea { resize: vertical; min-height: 80px; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
    .btn { background: var(--accent); color: white; border: none; padding: 0.8rem 2rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; font-size: 1rem; }
    .btn:hover { opacity: 0.9; }
    .flash { padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; display: none; }
    .flash-success { background: #166534; color: #bbf7d0; display: block; }
  </style>
</head>
<body>
  <aside class="sidebar">
    <h2>🤖 AFK Bot</h2>
    <nav>
      <a href="/">📊 Dashboard</a>
      <a href="/settings" class="active">⚙️ Settings</a>
    </nav>
  </aside>
  <main class="main">
    <div id="msg" class="flash flash-success">Settings saved! Bot will reconnect...</div>
    <div class="card"><h3>🔌 Server Connection</h3><div class="row"><div><label>Server IP</label><input id="serverIp" value="${config.server.ip}"></div><div><label>Port</label><input id="serverPort" type="number" value="${config.server.port}"></div><div><label>Version</label><input id="serverVersion" value="${config.server.version}"></div></div></div>
    <div class="card"><h3>👤 Bot Account</h3><div class="row"><div><label>Username</label><input id="botUsername" value="${config['bot-account'].username}"></div><div><label>Auth Type</label><input id="botAuth" value="${config['bot-account'].type}"></div></div></div>
    <div class="card"><h3>💬 Chat Messages (one per line)</h3><textarea id="chatMessages">${(config.utils['chat-messages'].messages || []).join('\n')}</textarea><label>Repeat Delay (seconds)</label><input id="chatDelay" type="number" value="${config.utils['chat-messages']['repeat-delay']}" style="width:200px;"></div>
    <div class="card"><h3>📍 Target Position</h3><div class="row"><div><label>X</label><input id="posX" type="number" value="${config.position.x}"></div><div><label>Y</label><input id="posY" type="number" value="${config.position.y}"></div><div><label>Z</label><input id="posZ" type="number" value="${config.position.z}"></div></div></div>
    <button class="btn" onclick="save()">💾 Save & Reconnect</button>
  </main>
  <script>
    async function save() {
      const data = {
        server: { ip: document.getElementById('serverIp').value, port: parseInt(document.getElementById('serverPort').value), version: document.getElementById('serverVersion').value },
        botAccount: { username: document.getElementById('botUsername').value, type: document.getElementById('botAuth').value },
        chatMessages: document.getElementById('chatMessages').value.split('\\n').filter(m=>m.trim()),
        chatDelay: parseInt(document.getElementById('chatDelay').value),
        position: { x: parseInt(document.getElementById('posX').value), y: parseInt(document.getElementById('posY').value), z: parseInt(document.getElementById('posZ').value) }
      };
      await fetch('/save-config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
      document.getElementById('msg').style.display = 'block';
      setTimeout(() => location.reload(), 3000);
    }
  </script>
</body>
</html>`);
});

// ============================================================
// API ENDPOINTS
// ============================================================
app.get('/health', (req, res) => {
  let pingVal = null;
  if (bot && bot.players && bot.username) {
    const p = bot.players[bot.username];
    if (p) pingVal = p.ping;
  }
  res.json({
    status: botState.connected ? 'connected' : 'disconnected',
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: (bot && bot.entity) ? bot.entity.position : null,
    ping: pingVal,
    connectedSince: botConnectTime
  });
});

app.get('/ping', (req, res) => res.send('pong'));

app.post('/setcoords', (req, res) => {
  if (!bot || !botState.connected) return res.status(400).json({error:'Bot offline'});
  const {x, y, z} = req.body;
  try {
    const mcData = require('minecraft-data')(bot.version);
    const move = new Movements(bot, mcData);
    move.allowFreeMotion = false;
    bot.pathfinder.setMovements(move);
    bot.pathfinder.setGoal(new GoalBlock(x, y, z));
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/chat', (req, res) => {
  if (!bot || !botState.connected) return res.status(400).json({error:'Bot offline'});
  bot.chat(req.body.message);
  res.json({success:true});
});

app.post('/cmd', (req, res) => {
  if (!bot || !botState.connected) return res.status(400).json({error:'Bot offline'});
  bot.chat('/' + req.body.command);
  res.json({success:true});
});

app.post('/restart', (req, res) => {
  res.json({success:true});
  setTimeout(() => process.exit(0), 500);
});

app.post('/disconnect', (req, res) => {
  if (bot) bot.end();
  res.json({success:true});
});

app.post('/reconnect', (req, res) => {
  if (bot) bot.end();
  intentionalDisconnect = false;
  createBot();
  res.json({success:true});
});

app.post('/toggle', (req, res) => {
  const { path, enabled } = req.body;
  if (!path) return res.status(400).json({error:'Missing path'});
  runtimeConfig[path] = enabled;
  console.log(`[Config] ${path} = ${enabled}`);
  if (bot && botState.connected) {
    bot.end();
    setTimeout(() => { if (!isReconnecting) createBot(); }, 3000);
  }
  res.json({success:true});
});

app.post('/save-config', (req, res) => {
  try {
    const newData = req.body;
    config.server.ip = newData.server.ip;
    config.server.port = newData.server.port;
    config.server.version = newData.server.version;
    config['bot-account'].username = newData.botAccount.username;
    config['bot-account'].type = newData.botAccount.type;
    config.utils['chat-messages'].messages = newData.chatMessages;
    config.utils['chat-messages']['repeat-delay'] = newData.chatDelay;
    config.position.x = newData.position.x;
    config.position.y = newData.position.y;
    config.position.z = newData.position.z;
    fs.writeFileSync(path.join(__dirname, 'settings.json'), JSON.stringify(config, null, 2));
    if (bot) bot.end();
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// ---- Server listen ----
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Dashboard ready on port ${server.address().port}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') server.listen(PORT + 1, '0.0.0.0');
  else console.error(err);
});

// ============================================================
// SELF-PING (keeps Render awake)
// ============================================================
function startSelfPing() {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (!renderUrl) return;
  setInterval(() => {
    const protocol = renderUrl.startsWith('https') ? https : http;
    protocol.get(`${renderUrl}/ping`, () => {}).on('error', () => {});
  }, 10 * 60 * 1000);
}
startSelfPing();

// ============================================================
// MEMORY MONITOR
// ============================================================
setInterval(() => {
  console.log(`[Memory] ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`);
}, 5 * 60 * 1000);

// ============================================================
// BOT LOGIC – CREATIVE MODE, NO DEATH LOOPS
// ============================================================

// --- Helpers ---
function clearBotTimeouts() {
  if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
  if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
}

function clearAllIntervals() {
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function getReconnectDelay() {
  if (botState.wasThrottled) {
    botState.wasThrottled = false;
    return 60000 + Math.floor(Math.random() * 60000);
  }
  const recentDeath = (lastDeathTime > 0 && (Date.now() - lastDeathTime) < 120000);
  const base = config.utils['auto-reconnect-delay'] || (recentDeath ? 60000 : 30000);
  const max = config.utils['max-reconnect-delay'] || 300000;
  const delay = Math.min(base * Math.pow(2, botState.reconnectAttempts), max);
  return delay + Math.floor(Math.random() * 5000);
}

function pingServer() {
  return new Promise((resolve, reject) => {
    mc.ping({
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version || false
    }, (err, res) => err ? reject(err) : resolve(res));
  });
}

function startEmptyServerMonitor() {
  console.log('[PlayerDetect] Monitoring for empty server...');
  const interval = setInterval(async () => {
    try {
      const data = await pingServer();
      if (data.players.online === 0) {
        clearInterval(interval);
        console.log('[PlayerDetect] Server empty – reconnecting now');
        intentionalDisconnect = false;
        createBot();
      }
    } catch (e) { /* ignore */ }
  }, 5000);
}

function setupKeepAliveHandler() {
  if (!bot) return;
  bot.removeAllListeners('keepalive');
  bot.on('keepalive', (payload) => {
    if (bot && bot._client) {
      bot._client.write('keepalive', { id: payload });
    }
  });
}

function createBot() {
  if (isReconnecting) return;
  isReconnecting = false;

  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch (e) {}
    bot = null;
  }

  console.log('[Bot] Attempting to connect to', config.server.ip);
  try {
    const version = config.server.version?.trim() || false;
    bot = mineflayer.createBot({
      username: config['bot-account'].username,
      password: config['bot-account'].password || undefined,
      auth: config['bot-account'].type,
      host: config.server.ip,
      port: config.server.port,
      version,
      hideErrors: false,
      keepAlive: true,
      checkTimeoutInterval: 60000
    });

    bot.loadPlugin(pathfinder);
    clearBotTimeouts();

    connectionTimeoutId = setTimeout(() => {
      if (!botState.connected) {
        console.log('[Bot] Connection timeout (2 min) – retrying');
        try { bot.removeAllListeners(); bot.end(); } catch (e) {}
        bot = null;
        scheduleReconnect();
      }
    }, 120000);

    setupKeepAliveHandler();

    let spawnHandled = false;
    bot.once('spawn', () => {
      if (spawnHandled) return;
      spawnHandled = true;
      clearBotTimeouts();
      botState.connected = true;
      botConnectTime = Date.now();
      botState.reconnectAttempts = 0;
      console.log(`[Bot] Spawned (${bot.version})`);

      // ✅ FORCE CREATIVE MODE – prevents all fall / attack deaths
      setTimeout(() => {
        if (bot && botState.connected) {
          bot.chat('/gamemode creative');
          console.log('[Bot] Creative mode set');
        }
      }, 3000);

      setupKeepAliveHandler();

      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.allowFreeMotion = false;
      defaultMove.canDig = false;
      defaultMove.liquidCost = 1000;
      defaultMove.fallDamageCost = 1000;

      setTimeout(() => {
        if (bot && botState.connected) initializeModules(bot, mcData, defaultMove);
      }, 30000);
    });

    bot.on('death', () => {
      console.log('[Bot] Died – will reconnect');
      lastDeathTime = Date.now();
      bot.end();
    });

    bot.on('kicked', (reason) => {
      const r = typeof reason === 'object' ? JSON.stringify(reason) : reason;
      console.log('[Bot] Kicked:', r);
      botState.connected = false;
      clearAllIntervals();
      if (String(r).toLowerCase().includes('throttl')) botState.wasThrottled = true;
    });

    bot.on('end', (reason) => {
      console.log('[Bot] Disconnected:', reason || 'unknown');
      botState.connected = false;
      clearAllIntervals();
      spawnHandled = false;
      if (intentionalDisconnect) {
        startEmptyServerMonitor();
        return;
      }
      scheduleReconnect();
    });

    bot.on('error', (err) => {
      console.log('[Bot] Error:', err.message);
      if (bot && botState.connected && (err.message.includes('timed out') || err.message.includes('keepalive'))) {
        console.log('[Bot] Fatal timeout – disconnecting');
        try { bot.end(); } catch (e) {}
      }
    });
  } catch (err) {
    console.log('[Bot] Creation error:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearBotTimeouts();
  if (isReconnecting) return;
  isReconnecting = true;
  botState.reconnectAttempts++;
  const delay = getReconnectDelay();
  console.log(`[Bot] Reconnecting in ${delay/1000}s (attempt #${botState.reconnectAttempts})`);
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    createBot();
  }, delay);
}

// ============================================================
// WATCHDOG
// ============================================================
setInterval(() => {
  if (!botState.connected && !isReconnecting) {
    console.log('[Watchdog] Bot offline – triggering reconnect');
    createBot();
  }
}, 30000);

// ============================================================
// MODULES (unchanged, all core features)
// ============================================================
function initializeModules(bot, mcData, defaultMove) {
  console.log('[Modules] Initializing...');
  clearAllIntervals();

  if (isModuleEnabled('utils.player-detection.enabled')) {
    bot.on('playerJoined', (player) => {
      if (player.username === bot.username) return;
      if (config.utils['player-detection']['disconnect-on-join'] !== false) {
        console.log(`[PlayerDetect] ${player.username} joined – disconnecting`);
        intentionalDisconnect = true;
        bot.end();
      }
    });
  }

  if (isModuleEnabled('utils.chat-messages.enabled')) {
    const msgs = config.utils['chat-messages'].messages;
    if (config.utils['chat-messages'].repeat) {
      let i = 0;
      addInterval(() => {
        if (bot && botState.connected) { bot.chat(msgs[i]); i = (i + 1) % msgs.length; }
      }, config.utils['chat-messages']['repeat-delay'] * 1000);
    }
  }

  if (config.position?.enabled && !isModuleEnabled('movement.circle-walk.enabled')) {
    setTimeout(() => {
      if (bot && botState.connected) {
        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
      }
    }, 40000);
  }

  if (isModuleEnabled('utils.anti-afk.enabled')) {
    addInterval(() => { try { bot.swingArm(); } catch (e) {} }, 10000 + Math.random() * 50000);
    addInterval(() => { try { bot.setQuickBarSlot(Math.floor(Math.random() * 9)); } catch (e) {} }, 30000 + Math.random() * 90000);
  }

  if (isModuleEnabled('movement.circle-walk.enabled')) startCircleWalk(bot, defaultMove);
  if (isModuleEnabled('movement.random-jump.enabled') && !isModuleEnabled('movement.circle-walk.enabled')) startRandomJump(bot);
  if (isModuleEnabled('movement.look-around.enabled')) startLookAround(bot);

  if (isModuleEnabled('modules.avoidMobs') && !isModuleEnabled('modules.combat')) avoidMobs(bot);
  if (isModuleEnabled('modules.combat')) combatModule(bot, mcData);
  if (isModuleEnabled('modules.beds')) bedModule(bot, mcData);
  if (isModuleEnabled('modules.chat')) chatModule(bot);

  console.log('[Modules] Ready');
}

function startCircleWalk(bot, defMove) {
  const rad = config.movement['circle-walk'].radius;
  let angle = 0;
  addInterval(() => {
    if (!bot || !botState.connected) return;
    const x = bot.entity.position.x + Math.cos(angle) * rad;
    const z = bot.entity.position.z + Math.sin(angle) * rad;
    bot.pathfinder.setMovements(defMove);
    bot.pathfinder.setGoal(new GoalBlock(Math.floor(x), Math.floor(bot.entity.position.y), Math.floor(z)));
    angle += Math.PI / 4;
  }, config.movement['circle-walk'].speed);
}

function startRandomJump(bot) {
  addInterval(() => {
    if (typeof bot.setControlState === 'function') {
      bot.setControlState('jump', true);
      setTimeout(() => { if (bot) bot.setControlState('jump', false); }, 300);
    }
  }, config.movement['random-jump'].interval);
}

function startLookAround(bot) {
  addInterval(() => {
    try { bot.look(Math.random() * Math.PI * 2 - Math.PI, Math.random() * Math.PI / 2 - Math.PI / 4, false); } catch (e) {}
  }, config.movement['look-around'].interval);
}

function avoidMobs(bot) {
  addInterval(() => {
    if (!bot || !botState.connected || typeof bot.setControlState !== 'function') return;
    const entities = Object.values(bot.entities).filter(e => e.type === 'mob' || (e.type === 'player' && e.username !== bot.username));
    for (const e of entities) {
      if (!e.position) continue;
      if (bot.entity.position.distanceTo(e.position) < 5) {
        bot.setControlState('back', true);
        setTimeout(() => { if (bot) bot.setControlState('back', false); }, 500);
        break;
      }
    }
  }, 2000);
}

function combatModule(bot, mcData) {
  bot.on('physicsTick', () => {
    if (!config.combat['attack-mobs']) return;
    const mobs = Object.values(bot.entities).filter(e => e.type === 'mob' && e.position && bot.entity.position.distanceTo(e.position) < 4);
    if (mobs.length) bot.attack(mobs[0]);
  });
  bot.on('health', () => {
    if (!config.combat['auto-eat'] || bot.food >= 14) return;
    const food = bot.inventory.items().find(i => i.foodPoints > 0);
    if (food) bot.equip(food, 'hand').then(() => bot.consume()).catch(() => {});
  });
}

function bedModule(bot, mcData) {
  let trying = false;
  addInterval(async () => {
    if (!config.beds['place-night'] || trying) return;
    if (bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23500) {
      const bed = bot.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 8 });
      if (bed) {
        trying = true;
        try { await bot.sleep(bed); console.log('[Bed] Sleeping'); } catch (e) {} finally { trying = false; }
      }
    }
  }, 10000);
}

function chatModule(bot) {
  bot.on('chat', (username, message) => {
    if (username === bot.username || !config.chat?.respond) return;
    if (message.toLowerCase().includes('hello')) bot.chat(`Hi ${username}!`);
    if (message.startsWith('!tp ')) {
      const target = message.split(' ')[1];
      if (target) bot.chat(`/tp ${target}`);
    }
  });
}

// ============================================================
// CRASH RECOVERY
// ============================================================
process.on('uncaughtException', (err) => {
  console.log('[FATAL] Uncaught Exception:', err.message);
  setTimeout(scheduleReconnect, 5000);
});
process.on('unhandledRejection', (reason) => {
  console.log('[FATAL] Unhandled Rejection:', reason);
});
process.on('SIGTERM', () => {
  console.log('[System] SIGTERM – exiting (Render will restart)');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[System] SIGINT – exiting');
  process.exit(0);
});

// ============================================================
// START
// ============================================================
console.log('═'.repeat(45));
console.log('  Minecraft AFK Bot – Immortal Build');
console.log('═'.repeat(45));
console.log(`Server: ${config.server.ip}:${config.server.port}`);
createBot();
