'use strict';

const { FullPacketParser } = require('protodef');

if (!FullPacketParser.prototype.__minecraftAfkBufferedParser) {
  const parsePacketBuffer = FullPacketParser.prototype.parsePacketBuffer;

  FullPacketParser.prototype._transform = function transform(chunk, enc, callback) {
    this.__minecraftAfkBufferedParser = Buffer.concat([
      this.__minecraftAfkBufferedParser || Buffer.alloc(0),
      chunk
    ]);

    while (this.__minecraftAfkBufferedParser.length > 0) {
      let packet;
      try {
        packet = parsePacketBuffer.call(this, this.__minecraftAfkBufferedParser);
      } catch (error) {
        if (error.partialReadError) return callback();
        return callback(error);
      }

      const size = packet.metadata?.size || 0;
      if (size <= 0 || size > this.__minecraftAfkBufferedParser.length) {
        return callback(new Error('Invalid protocol packet size while buffering Minecraft packets'));
      }

      this.push(packet);
      this.__minecraftAfkBufferedParser = this.__minecraftAfkBufferedParser.slice(size);
    }

    callback();
  };
}
