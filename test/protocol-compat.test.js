'use strict';

require('../lib/protocol-compat');

const test = require('node:test');
const assert = require('node:assert/strict');
const { FullPacketParser } = require('protodef');

test('malformed framed packets fail with packet ID and state context', () => {
  const parser = new FullPacketParser({
    parsePacketBuffer() {
      throw new Error('synthetic schema mismatch');
    }
  }, 'play.toClient', true);
  let pushed = false;
  parser.push = () => { pushed = true; };

  let transformError;
  parser._transform(Buffer.from([0x2a, 0x01, 0x02]), null, error => {
    transformError = error;
  });

  assert.equal(pushed, false);
  assert.match(transformError.message, /synthetic schema mismatch/);
  assert.match(transformError.message, /parser=play\.toClient/);
  assert.match(transformError.message, /packetId=42/);
  assert.match(transformError.message, /frameBytes=3/);
  assert.deepEqual(transformError.protocolFrame, {
    parser: 'play.toClient',
    packetId: 42,
    frameBytes: 3,
    prefixHex: '2a0102'
  });
});

test('full frame bytes are included only when explicitly enabled', () => {
  const previousValue = process.env.MINECRAFT_PROTOCOL_DEBUG_FRAMES;
  process.env.MINECRAFT_PROTOCOL_DEBUG_FRAMES = '1';
  try {
    const parser = new FullPacketParser({
      parsePacketBuffer() {
        throw new Error('synthetic schema mismatch');
      }
    }, 'configuration.toClient', true);
    let transformError;
    parser._transform(Buffer.from([0x0d, 0x04, 0x1e]), null, error => {
      transformError = error;
    });
    assert.equal(transformError.protocolFrame.frameHex, '0d041e');
  } finally {
    if (previousValue === undefined) delete process.env.MINECRAFT_PROTOCOL_DEBUG_FRAMES;
    else process.env.MINECRAFT_PROTOCOL_DEBUG_FRAMES = previousValue;
  }
});

test('valid framed packets continue through the parser', () => {
  const expectedPacket = { data: { ok: true }, metadata: { size: 1 } };
  const parser = new FullPacketParser({
    parsePacketBuffer: () => expectedPacket
  }, 'play.toClient', true);
  const pushed = [];
  parser.push = packet => { pushed.push(packet); };

  let transformError;
  parser._transform(Buffer.from([0x00]), null, error => {
    transformError = error;
  });

  assert.equal(transformError, undefined);
  assert.deepEqual(pushed, [expectedPacket]);
});
