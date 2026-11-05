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

if (!FullPacketParser.prototype.__minecraftAfkSafeFrames) {
  const parsePacketBuffer = FullPacketParser.prototype.parsePacketBuffer;

  FullPacketParser.prototype._transform = function transform(chunk, enc, callback) {
    try {
      const packet = parsePacketBuffer.call(this, chunk);
      this.push(packet);
    } catch (error) {
      // A 26.3 proxy can send a packet from a newer schema during login or
      // world initialization. Discard that complete frame without poisoning
      // the next frame or terminating the connection.
      if (!this.noErrorLogging) {
        console.warn(`[Protocol] Ignoring malformed native packet: ${error.message}`);
      }
    }
    callback();
  };

  FullPacketParser.prototype.__minecraftAfkSafeFrames = true;
}
