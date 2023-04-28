const demuxOutput = (buffer: Buffer) => {
  var nextDataLength = null;
  let output = Buffer.from([]);

  while (buffer.length > 0) {
    var header = bufferSlice(8);
    nextDataLength = header.readUInt32BE(4);

    var content = bufferSlice(nextDataLength);
    output = Buffer.concat([output, content]);
  }

  function bufferSlice(end: number) {
    var out = buffer.slice(0, end);
    buffer = Buffer.from(buffer.slice(end, buffer.length));
    return out;
  }

  return output;
}
export {
  demuxOutput
}