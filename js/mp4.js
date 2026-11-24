"use strict";

function muxAvc(samples, config, width, height) {
  const num = (value, length = 4) => {
    const bytes = new Uint8Array(length);
    for (let i = length - 1; i >= 0; i--) {
      bytes[i] = value & 255;
      value = Math.floor(value / 256);
    }
    return bytes;
  };
  const ascii = value => new TextEncoder().encode(value);
  const zeros = length => new Uint8Array(length);
  const join = (...parts) => {
    const bytes = zeros(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  };
  const size = parts => parts.reduce((total, part) => total + part.length, 0);
  const box = (name, ...parts) => join(num(size(parts) + 8), ascii(name), ...parts);
  const full = (name, flags, ...parts) => box(name, num(flags), ...parts);
  const matrix = join(...[65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].map(value => num(value)));
  const duration = samples.reduce((total, sample) => total + sample.duration, 0);
  const ftyp = box("ftyp", ascii("isom"), num(512), ascii("isomiso2avc1mp41"));
  const dataSize = size(samples.map(sample => sample.data));
  const mvhd = full("mvhd", 0, zeros(8), num(1000), num(duration), num(65536), num(256, 2),
    zeros(10), matrix, zeros(24), num(2));
  const tkhd = full("tkhd", 7, zeros(8), num(1), zeros(4), num(duration), zeros(16),
    matrix, num(width * 65536), num(height * 65536));
  const mdhd = full("mdhd", 0, zeros(8), num(1000), num(duration), num(0x55c4, 2), zeros(2));
  const hdlr = full("hdlr", 0, zeros(4), ascii("vide"), zeros(12), ascii("VideoHandler\0"));
  const vmhd = full("vmhd", 1, zeros(8));
  const dinf = box("dinf", full("dref", 0, num(1), full("url ", 1)));
  const avc1 = box("avc1", zeros(6), num(1, 2), zeros(16), num(width, 2), num(height, 2),
    num(72 * 65536), num(72 * 65536), zeros(4), num(1, 2), zeros(32), num(24, 2),
    num(65535, 2), box("avcC", config));
  const stsd = full("stsd", 0, num(1), avc1);
  const stts = full("stts", 0, num(samples.length),
    ...samples.map(sample => join(num(1), num(sample.duration))));
  const stsc = full("stsc", 0, num(1), num(1), num(samples.length), num(1));
  const stsz = full("stsz", 0, zeros(4), num(samples.length), ...samples.map(sample => num(sample.data.length)));
  const stco = full("stco", 0, num(1), num(ftyp.length + 8));
  const keys = samples.flatMap((sample, index) => sample.key ? [num(index + 1)] : []);
  const stss = full("stss", 0, num(keys.length), ...keys);
  const stbl = box("stbl", stsd, stts, stsc, stsz, stco, stss);
  const moov = box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, stbl))));
  return new Blob([ftyp, num(dataSize + 8), ascii("mdat"), ...samples.map(sample => sample.data), moov],
    { type: "video/mp4" });
}
