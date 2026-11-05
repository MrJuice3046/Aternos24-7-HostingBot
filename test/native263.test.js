'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const minecraftData = require('minecraft-data');
const minecraftProtocol = require('minecraft-protocol');
const physics = require('prismarine-physics');
const chunk = require('prismarine-chunk');

test('official 26.1 data resolves protocol 775 and data version 4786', () => {
  const data = minecraftData('26.1');
  assert.equal(data.version.version, 775);
  assert.equal(data.version.dataVersion, 4786);
  assert.ok(minecraftProtocol.supportedVersions.includes('26.1'));
});

test('official 26.1 physics and chunk implementations load', () => {
  const data = minecraftData('26.1');
  assert.doesNotThrow(() => physics.Physics(data, { getBlock: () => null }));
  assert.doesNotThrow(() => chunk('26.1'));
});
