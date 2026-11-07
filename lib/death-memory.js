'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Remembers where and (best-effort) how the bot died so it can answer
// honestly about past deaths and avoid repeating the same mistake:
// it retreats early from threats that killed it before and flags
// remembered death spots as risky during tasks.

function createDeathMemory({
  bot,
  now = Date.now,
  maxDeaths = 20,
  storagePath = path.join(process.cwd(), 'data', 'death-memory.json')
} = {}) {
  let deaths = [];
  let lastDamage = null;
  try {
    const saved = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    if (Array.isArray(saved)) deaths = saved.filter(item => item && typeof item === 'object').slice(-maxDeaths);
  } catch (_) {}

  function persist() {
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.writeFileSync(storagePath, `${JSON.stringify(deaths, null, 2)}\n`, { mode: 0o600 });
    } catch (_) {}
  }

  function noteDamage(source) {
    const name = source?.username || source?.name || source?.displayName;
    if (!name) return;
    lastDamage = { name: String(name).replace(/^minecraft:/, ''), at: now() };
  }

  function nearestThreatName(position, radius = 10) {
    if (!position || typeof position.distanceTo !== 'function') return null;
    let best = null;
    let bestDistance = Infinity;
    for (const entity of Object.values(bot?.entities || {})) {
      if (!entity || entity.type !== 'mob' || !entity.position) continue;
      const distance = position.distanceTo(entity.position);
      if (Number.isFinite(distance) && distance < bestDistance && distance <= radius) {
        bestDistance = distance;
        best = entity;
      }
    }
    if (!best) return null;
    return String(best.name || best.displayName || 'mob').replace(/^minecraft:/, '') || null;
  }

  function recordDeath() {
    const position = bot?.entity?.position
      ? {
          x: Math.floor(bot.entity.position.x),
          y: Math.floor(bot.entity.position.y),
          z: Math.floor(bot.entity.position.z)
        }
      : null;
    const record = {
      at: now(),
      position,
      threat: (lastDamage && now() - lastDamage.at <= 10000 ? lastDamage.name : null)
        || nearestThreatName(bot?.entity?.position)
        || 'unknown cause'
    };
    lastDamage = null;
    deaths.push(record);
    if (deaths.length > maxDeaths) deaths.shift();
    persist();
    return record;
  }

  function distanceToDeathSpot(position) {
    if (!position) return Infinity;
    let best = Infinity;
    for (const death of deaths) {
      if (!death.position) continue;
      const dx = position.x - death.position.x;
      const dy = position.y - death.position.y;
      const dz = position.z - death.position.z;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return best;
  }

  function isRiskySpot(position, radius = 12) {
    return distanceToDeathSpot(position) <= radius;
  }

  function shouldAvoidSpot(position, radius = 5) {
    return distanceToDeathSpot(position) <= radius;
  }

  function knownKiller(threatName) {
    const name = String(threatName || '').replace(/^minecraft:/, '');
    if (!name) return false;
    return deaths.some(death => death.threat === name);
  }

  function knownKillerNear(radius = 8) {
    if (!bot?.entity?.position || typeof bot.entity.position.distanceTo !== 'function') return null;
    for (const entity of Object.values(bot.entities || {})) {
      if (!entity || entity.type !== 'mob' || !entity.position) continue;
      const name = String(entity.name || '').replace(/^minecraft:/, '');
      if (!name || !knownKiller(name)) continue;
      if (bot.entity.position.distanceTo(entity.position) <= radius) {
        return { entity, name };
      }
    }
    return null;
  }

  function shouldRetreat(threatName, health) {
    return Number.isFinite(health) && health <= 10 && knownKiller(threatName);
  }

  function summary() {
    if (!deaths.length) return 'I have not died yet, and I plan to keep it that way.';
    const last = deaths[deaths.length - 1];
    const where = last.position
      ? ` at ${last.position.x}, ${last.position.y}, ${last.position.z}`
      : '';
    const cause = last.threat === 'unknown cause'
      ? ' I could not tell what caused it (unknown cause).'
      : ` A ${last.threat} was close by.`;
    const lesson = last.threat === 'unknown cause'
      ? ' I am more careful near that spot now.'
      : ` I retreat early from ${last.threat}s now and avoid that spot.`;
    return `I have died ${deaths.length} time(s); the last one was${where}.${cause}${lesson}`;
  }

  function snapshot() {
    return {
      count: deaths.length,
      last: deaths[deaths.length - 1] || null,
      threats: [...new Set(deaths.map(death => death.threat).filter(name => name !== 'unknown cause'))]
    };
  }

  return { recordDeath, noteDamage, isRiskySpot, shouldAvoidSpot, knownKiller, knownKillerNear, shouldRetreat, summary, snapshot };
}

module.exports = { createDeathMemory };
