'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const minecraftData = require('minecraft-data');
const minecraftProtocol = require('minecraft-protocol');
const physics = require('prismarine-physics');
const chunk = require('prismarine-chunk');

test('native 26.3 data resolves protocol 777 and data version 5023', () => {
  const data = minecraftData('26.3');
  assert.equal(data.version.version, 777);
  assert.equal(data.version.dataVersion, 5023);
  assert.ok(minecraftProtocol.supportedVersions.includes('26.3'));
});

test('native 26.3 physics and chunk implementations load', () => {
  const data = minecraftData('26.3');
  assert.doesNotThrow(() => physics.Physics(data, { getBlock: () => null }));
  assert.doesNotThrow(() => chunk('26.3'));
});
