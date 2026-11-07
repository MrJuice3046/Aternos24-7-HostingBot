'use strict';

const zlib = require('node:zlib');
const { FullPacketParser } = require('protodef');

if (!zlib.__minecraftAfkInflateFallback) {
  const unzipSync = zlib.unzipSync;
  zlib.unzipSync = function unzipWithFallback(buffer, options) {
    try {
      return unzipSync.call(this, buffer, options);
    } catch (error) {
      return zlib.inflateSync(buffer, options);
    }
  };
  zlib.__minecraftAfkInflateFallback = true;
}

function readPacketId(buffer) {
  let value = 0;
  let shift = 0;
  for (let index = 0; index < Math.min(buffer.length, 5); index += 1) {
    const byte = buffer[index];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value >>> 0;
    shift += 7;
  }
  return null;
}

if (!FullPacketParser.prototype.__minecraftAfkStrictFrames) {
  const parsePacketBuffer = FullPacketParser.prototype.parsePacketBuffer;

  FullPacketParser.prototype._transform = function transform(chunk, enc, callback) {
    try {
      const packet = parsePacketBuffer.call(this, chunk);
      this.push(packet);
    } catch (error) {
      // The protocol Splitter emits complete length-delimited frames. Dropping
      // a failed frame silently desynchronizes the login/configuration stream.
      const packetId = readPacketId(chunk);
      const context = `parser=${this.mainType || 'unknown'}, packetId=${packetId ?? 'unknown'}, ` +
        `frameBytes=${chunk.length}, prefix=${chunk.subarray(0, 8).toString('hex') || '(empty)'}`;
      const protocolError = error instanceof Error ? error : new Error(String(error));
      protocolError.protocolFrame = {
        parser: this.mainType || 'unknown',
        packetId,
        frameBytes: chunk.length,
        prefixHex: chunk.subarray(0, 8).toString('hex')
      };
      const debugFrameHex = process.env.MINECRAFT_PROTOCOL_DEBUG_FRAMES === '1' && chunk.length <= 512
        ? chunk.toString('hex')
        : null;
      if (debugFrameHex) {
        protocolError.protocolFrame.frameHex = debugFrameHex;
      }
      const debugContext = debugFrameHex ? `${context}, frameHex=${debugFrameHex}` : context;
      protocolError.message = `${protocolError.message} [${debugContext}]`;
      if (!this.noErrorLogging) {
        console.error(`[Protocol] Rejecting malformed frame: ${debugContext}: ${protocolError.message}`);
      }
      return callback(protocolError);
    }
    callback();
  };

  FullPacketParser.prototype.__minecraftAfkStrictFrames = true;
}
