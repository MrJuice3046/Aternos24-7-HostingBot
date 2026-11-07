'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDeathMemory } = require('../lib/death-memory');

function makePosition(x, y, z) {
  return {
    x, y, z,
    distanceTo(other) {
      return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
    }
  };
}

test('death memory persists likely attackers and spots and learns to retreat from them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-death-memory-'));
  const storagePath = path.join(dir, 'deaths.json');
  try {
    let clock = 1000;
    const zombie = { id: 8, type: 'mob', name: 'zombie', position: makePosition(2, 64, 0) };
    const bot = {
      entity: { id: 1, position: makePosition(0, 64, 0) },
      entities: { 8: zombie }
    };
    const memory = createDeathMemory({ bot, storagePath, now: () => clock });
    memory.noteDamage(zombie);
    clock += 500;
    const death = memory.recordDeath();
    assert.equal(death.threat, 'zombie');
    assert.equal(memory.isRiskySpot(makePosition(3, 64, 0)), true);
    assert.equal(memory.shouldAvoidSpot(makePosition(3, 64, 0)), true);
    assert.equal(memory.shouldRetreat('zombie', 8), true);
    assert.equal(memory.knownKillerNear(8).name, 'zombie');

    const restarted = createDeathMemory({ bot, storagePath, now: () => clock });
    assert.equal(restarted.snapshot().count, 1);
    assert.match(restarted.summary(), /zombie/i);
    assert.equal(restarted.knownKiller('zombie'), true);
    assert.ok(fs.statSync(storagePath).mode & 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('death memory keeps only the configured number of records and admits uncertainty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-death-memory-'));
  const storagePath = path.join(dir, 'deaths.json');
  try {
    let clock = 1;
    const memory = createDeathMemory({
      bot: { entity: { position: makePosition(0, 64, 0) }, entities: {} },
      storagePath,
      now: () => clock++,
      maxDeaths: 2
    });
    memory.recordDeath();
    memory.recordDeath();
    memory.recordDeath();
    assert.equal(memory.snapshot().count, 2);
    assert.match(memory.summary(), /unknown cause/i);
    assert.equal(memory.knownKiller('creeper'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
