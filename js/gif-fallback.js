"use strict";

// Decode each GIF image block with the browser, then composite its animation frame.
function createGifFallback(bytes) {
  const word = offset => bytes[offset] | (bytes[offset + 1] << 8);
  const width = word(6), height = word(8);
  if (!width || !height || width * height > 24000000) throw new Error("지원하는 GIF 크기를 초과했습니다.");
  let offset = 13;
  const table = flags => {
    const length = 3 * (2 << (flags & 7));
    if (offset + length > bytes.length) throw new Error("GIF 색상표가 잘렸습니다.");
    const data = bytes.subarray(offset, offset + length);
    offset += length;
    return data;
  };
  const global = bytes[10] & 128 ? table(bytes[10]) : null;
  const frames = [];
  let repetitionCount = 0;
  let control = {};
  function blocks() {
    const start = offset;
    while (offset < bytes.length) {
      const length = bytes[offset++];
      if (!length) return bytes.subarray(start, offset);
      offset += length;
    }
    throw new Error("GIF 데이터가 잘렸습니다.");
  }
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 59) break;
    if (marker === 33) {
      const label = bytes[offset++];
      const data = blocks();
      if (label === 249 && data[0] === 4) {
        control = { flags: data[1], delay: (data[2] | (data[3] << 8)) * 10000, transparent: data[4] };
      }
      if (label === 255 && data[0] === 11 && data[12] === 3 && data[13] === 1 &&
          ["NETSCAPE2.0", "ANIMEXTS1.0"].includes(String.fromCharCode(...data.subarray(1, 12)))) {
        repetitionCount = (data[14] | (data[15] << 8)) || Infinity;
      }
      continue;
    }
    if (marker !== 44 || offset + 9 > bytes.length) throw new Error("GIF 프레임을 읽을 수 없습니다.");
    const x = word(offset), y = word(offset + 2), w = word(offset + 4), h = word(offset + 6);
    const flags = bytes[offset + 8];
    offset += 9;
    const palette = flags & 128 ? table(flags) : global;
    if (!palette || !w || !h || w * h > 24000000) throw new Error("GIF 프레임 정보가 올바르지 않습니다.");
    const lzw = bytes[offset++];
    frames.push({ x, y, w, h, palette, lzw, pixels: blocks(), flags: 0, ...control, imageFlags: flags });
    control = {};
  }
  if (!frames.length) throw new Error("읽을 수 있는 GIF 프레임이 없습니다.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let next = 0;
  let previous = null;
  let restore = null;

  function loadPatch(frame) {
    const { w, h, palette, flags, transparent, imageFlags, lzw, pixels } = frame;
    const header = Uint8Array.of(71, 73, 70, 56, 57, 97, w & 255, w >> 8, h & 255, h >> 8,
      240 | (Math.log2(palette.length / 3) - 1), 0, 0);
    const gce = Uint8Array.of(33, 249, 4, flags & 1, 0, 0, transparent || 0, 0);
    const descriptor = Uint8Array.of(44, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8,
      imageFlags & 64, lzw);
    const url = URL.createObjectURL(new Blob([header, palette, gce, descriptor, pixels, Uint8Array.of(59)], { type: "image/gif" }));
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("GIF 프레임 디코딩에 실패했습니다.")); };
      image.src = url;
    });
  }

  return {
    tracks: { ready: Promise.resolve(), selectedTrack: { frameCount: frames.length, repetitionCount } },
    metadata: frames.map(frame => ({ width, height, delay: Math.max(10, (frame.delay ?? 100000) / 1000) })),
    async decode({ frameIndex }) {
      if (frameIndex < next) {
        ctx.clearRect(0, 0, width, height);
        next = 0;
        previous = restore = null;
      }
      for (; next <= frameIndex; next++) {
        if (previous && ((previous.flags >> 2) & 7) === 2) ctx.clearRect(previous.x, previous.y, previous.w, previous.h);
        if (restore) ctx.putImageData(restore, 0, 0);
        const frame = frames[next];
        restore = ((frame.flags >> 2) & 7) === 3 ? ctx.getImageData(0, 0, width, height) : null;
        ctx.drawImage(await loadPatch(frame), frame.x, frame.y);
        previous = frame;
      }
      return { image: canvas };
    },
    close() { canvas.width = canvas.height = 0; }
  };
}

