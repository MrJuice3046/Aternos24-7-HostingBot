'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const minecraftData = require('minecraft-data');
const minecraftProtocol = require('minecraft-protocol');
const { createDeserializer } = require('minecraft-protocol/src/transforms/serializer');
const physics = require('prismarine-physics');
const chunk = require('prismarine-chunk');

test('native 26.3 data resolves protocol 777 and data version 5023', () => {
  const data = minecraftData('26.3');
  assert.equal(data.version.version, 777);
  assert.equal(data.version.dataVersion, 5023);
  assert.ok(minecraftProtocol.supportedVersions.includes('26.3'));
});

test('protocol 777 decodes the captured configuration feature-flags frame', () => {
  const frame = Buffer.from(
    '0d041e6d696e6563726166743a72656473746f6e655f6578706572696d656e7473116d696e6563726166743a76616e696c6c61196d696e6563726166743a74726164655f726562616c616e63651f6d696e6563726166743a6d696e65636172745f696d70726f76656d656e7473',
    'hex'
  );
  const packet = createDeserializer({ state: 'configuration', isServer: false, version: '26.3' })
    .parsePacketBuffer(frame);

  assert.equal(packet.data.name, 'feature_flags');
  assert.deepEqual(packet.data.params.features, [
    'minecraft:redstone_experiments',
    'minecraft:vanilla',
    'minecraft:trade_rebalance',
    'minecraft:minecart_improvements'
  ]);
  assert.equal(packet.metadata.size, frame.length);
});

test('protocol 777 maps post_effects at configuration ID 10 and play ID 83', () => {
  const configurationFrame = Buffer.from([0x0a, 0x00]);
  const configurationPacket = createDeserializer({ state: 'configuration', isServer: false, version: '26.3' })
    .parsePacketBuffer(configurationFrame);
  assert.equal(configurationPacket.data.name, 'post_effects');
  assert.deepEqual(configurationPacket.data.params.postEffects, []);

  const playFrame = Buffer.concat([Buffer.from([0x53, 0x01, 0x0e]), Buffer.from('minecraft:blur')]);
  const playPacket = createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    .parsePacketBuffer(playFrame);
  assert.equal(playPacket.data.name, 'post_effects');
  assert.deepEqual(playPacket.data.params.postEffects, ['minecraft:blur']);
});

test('protocol 777 decodes transient blocks, player abilities, and swing animations at official IDs', () => {
  const deserialize = frame => createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    .parsePacketBuffer(frame).data;

  const transientBlock = deserialize(Buffer.from([0x25, ...Array(8).fill(0), 0x00]));
  assert.equal(transientBlock.name, 'add_transient_block');
  assert.deepEqual(transientBlock.params, { pos: { x: 0, y: 0, z: 0 }, blockState: 0 });

  const abilities = deserialize(Buffer.from([0x41, 0x00, 0x3d, 0x4c, 0xcc, 0xcd, 0x3d, 0xcc, 0xcc, 0xcd]));
  assert.equal(abilities.name, 'abilities');
  assert.equal(abilities.params.flags, 0);
  assert.ok(Math.abs(abilities.params.flyingSpeed - 0.05) < 1e-6);
  assert.ok(Math.abs(abilities.params.walkingSpeed - 0.1) < 1e-6);

  const swing = deserialize(Buffer.from([0x7b, 0x01, 0x00, 0x01, 0x06]));
  assert.equal(swing.name, 'swing_animation');
  assert.deepEqual(swing.params, { entityId: 1, hand: 0, animation: 1, duration: 6 });
});

test('native 26.3 physics and chunk implementations load', () => {
  const data = minecraftData('26.3');
  assert.doesNotThrow(() => physics.Physics(data, { getBlock: () => null }));
  assert.doesNotThrow(() => chunk('26.3'));
});

test('26.3 decodes the verified item component IDs and payload codecs', () => {
  const deserializer = createDeserializer({ state: 'play', isServer: false, version: '26.3' });
  const decode = bytes => deserializer.proto.parsePacketBuffer('SlotComponent', Buffer.from(bytes)).data;

  assert.deepEqual(decode([40, 1, 6]), {
    type: 'attack_animation',
    data: { type: 'whack', duration: 6 }
  });
  assert.deepEqual(decode([41, 2, 9]), {
    type: 'interact_animation',
    data: { type: 'stab', duration: 9 }
  });
  assert.deepEqual(decode([43, 7]), { type: 'block_transformer', data: 7 });
  assert.deepEqual(decode([44, 12]), { type: 'villager_food', data: { nutrition: 12 } });
  assert.deepEqual(decode([80, 1, 1, 0, 0]), {
    type: 'sulfur_cube_content',
    data: { itemId: 1, itemCount: 1, addedComponentCount: 0, removedComponentCount: 0, components: [], removeComponents: [] }
  });
  assert.deepEqual(decode([84, 1, 0, 0, 0, 4]), {
    type: 'compostable',
    data: { layers: { isConstant: true, value: 4 } }
  });
  assert.deepEqual(decode([85, 1, 0, 0, 0, 200, 1, 0x3f, 0x80, 0, 0]), {
    type: 'cooking_fuel',
    data: {
      burn_time: { isConstant: true, value: 200 },
      speed_multiplier: { isConstant: true, value: 1 }
    }
  });
  assert.deepEqual(decode([86, 1, 0, 0, 0, 5, 1, 0x3f, 0x80, 0, 0]), {
    type: 'brewing_fuel',
    data: {
      uses: { isConstant: true, value: 5 },
      speed_multiplier: { isConstant: true, value: 1 }
    }
  });

  const mobVisibility = decode([
    87, 0, 17, ...Buffer.from('minecraft:hostile'), 0x40, 0, 0, 0
  ]);
  assert.deepEqual(mobVisibility, {
    type: 'mob_visibility',
    data: { targetingEntityTypes: { name: 'minecraft:hostile' }, visibility: 2 }
  });
  assert.deepEqual(decode([117, 9]), { type: 'provides_pottery_pattern', data: 9 });
});
