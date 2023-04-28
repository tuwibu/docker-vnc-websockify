"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.demuxOutput = void 0;
const demuxOutput = (buffer) => {
    var nextDataLength = null;
    let output = Buffer.from([]);
    while (buffer.length > 0) {
        var header = bufferSlice(8);
        nextDataLength = header.readUInt32BE(4);
        var content = bufferSlice(nextDataLength);
        output = Buffer.concat([output, content]);
    }
    function bufferSlice(end) {
        var out = buffer.slice(0, end);
        buffer = Buffer.from(buffer.slice(end, buffer.length));
        return out;
    }
    return output;
};
exports.demuxOutput = demuxOutput;
