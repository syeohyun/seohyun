"use strict";
const byId = id => document.getElementById(id);
const fileInput = byId("file");
const fields = byId("fields");
const settings = byId("settings");
const tools = byId("tools");
const formats = {
  Resize: ["↔", "Resized"], Crop: ["⌗", "Cropped"], Downsizing: ["↓", "Reduced"],
  "Format Convert": ["⇄", "Converted"], Rotate: ["↻", "Rotated"], Optimize: ["◇", "Optimized"],
  Reverse: ["⇤", "Reversed"], Speed: ["»", "Speed"], Cut: ["✂", "Cut"]
};
let source, output, active, busy = false;

function message(text = "", error = false) {
  const status = byId("message");
  status.textContent = text;
  status.hidden = !text;
  status.classList.toggle("error", error);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll("button").forEach(button => button.disabled = value);
}

function showMedia(target, url, type) {
  const item = document.createElement(type === "video/mp4" ? "video" : "img");
  item.src = url;
  if (item.tagName === "VIDEO") {
    item.controls = true;
    item.playsInline = true;
  } else {
    item.alt = target === "sourcePreview" ? "원본 GIF 미리보기" : "편집 결과 미리보기";
  }
  byId(target).replaceChildren(item);
}

function showMeta(target, { width, height, count, duration, blob }) {
  const entries = [["크기", `${width} × ${height}`], ["프레임", count],
    ["길이", `${(duration / 1000).toFixed(2)}초`],
    ["파일 용량", `${(blob.size / 1024).toFixed(1)} KB`]];
  byId(target).replaceChildren(...entries.map(([key, value]) => {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const desc = document.createElement("dd");
    term.textContent = key;
    desc.textContent = value;
    group.append(term, desc);
    return group;
  }));
}

async function openGif(files, handle = null) {
  if (busy || !files.length) return;
  if (files.length !== 1) return message("GIF 파일을 한 번에 하나만 선택해 주세요.", true);
  const blob = files[0];
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (!["GIF87a", "GIF89a"].includes(signature)) return message("편집할 수 있는 형식은 GIF입니다. GIF 파일을 선택해 주세요.", true);
  let decoder;
  setBusy(true);
  message("GIF 정보를 읽는 중…");
  try {
    decoder = typeof ImageDecoder !== "undefined" && await ImageDecoder.isTypeSupported("image/gif")
      ? new ImageDecoder({ type: "image/gif", data: bytes })
      : createGifFallback(bytes);
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const frames = [];
    let width, height, duration = 0;
    for (let i = 0; i < track.frameCount; i++) {
      if (decoder.metadata) {
        const info = decoder.metadata[i];
        width = info.width;
        height = info.height;
        frames.push({ index: i, delay: info.delay });
        duration += info.delay;
        continue;
      }
      const { image } = await decoder.decode({ frameIndex: i });
      width = image.displayWidth;
      height = image.displayHeight;
      const delay = image.duration == null ? 100 : Math.max(10, image.duration / 1000);
      image.close?.();
      frames.push({ index: i, delay });
      duration += delay;
    }
    if (!frames.length) throw new Error("읽을 수 있는 GIF 프레임이 없습니다.");
    if (source) {
      source.decoder.close();
      URL.revokeObjectURL(source.url);
    }
    if (output) URL.revokeObjectURL(output.url);
    output = null;
    source = { blob, bytes, decoder, handle, frames, width, height, duration, count: frames.length,
      repeat: track.repetitionCount === Infinity ? 0 : (track.repetitionCount || -1),
      url: URL.createObjectURL(blob) };
    byId("filename").textContent = blob.name;
    showMedia("sourcePreview", source.url, "image/gif");
    showMeta("sourceMeta", source);
    byId("drop").hidden = byId("result").hidden = true;
    byId("workspace").hidden = false;
    byId("original").open = true;
    selectTool();
    message();
  } catch (error) {
    decoder?.close();
    message(error.message || "이 GIF를 읽을 수 없습니다.", true);
  } finally {
    setBusy(false);
  }
}

function selectTool(name) {
  active = name;
  tools.hidden = Boolean(name);
  settings.hidden = !name;
  if (!name) return;
  byId("toolTitle").textContent = name;
  const { width, height, duration, count } = source;
  const panels = {
    Resize: `${slider("width", "X축 · 가로", width, Math.max(1, Math.round(width * .05)), width * 3, 1, "px")}
      <button type="button" id="lock" aria-pressed="true">🔒 비율 유지</button>
      ${slider("height", "Y축 · 세로", height, Math.max(1, Math.round(height * .05)), height * 3, 1, "px")}`,
    Crop: `<label>출력 비율<select name="ratio"><option>1:1</option><option>4:3</option><option>16:9</option><option>9:16</option></select></label>
      <label>채우기 방식<select name="fill"><option value="cover">확대해서 채우기</option><option value="pad">단색 여백으로 채우기</option></select></label>
      <label>여백 색상<input name="color" type="color" value="#ffffff"></label>`,
    Downsizing: `<label class="check"><input type="checkbox" name="scale" checked>가로·세로 크기를 60%로 축소</label>
      <label class="check"><input type="checkbox" name="skip">프레임을 2개 중 1개씩 제거</label>
      <label class="check"><input type="checkbox" name="resolution">해상도를 낮춰 디테일과 색상 수 줄이기</label>`,
    "Format Convert": `<label>출력 형식<select name="format"><option value="mp4">MP4 동영상</option><option value="jpg">JPG 이미지 (첫 프레임)</option></select></label>`,
    Rotate: `<label>회전 또는 뒤집기<select name="mode"><option value="90">시계 방향 90°</option><option value="180">180°</option><option value="270">시계 방향 270°</option><option value="h">좌우 뒤집기</option><option value="v">상하 뒤집기</option></select></label>`,
    Optimize: "<p>화면과 재생 시간은 그대로 유지하고 GIF 주석과 불필요한 블록 구분을 정리합니다.</p>",
    Reverse: "<p>마지막 프레임부터 역순으로 재생합니다.</p>",
    Speed: slider("speed", "재생 속도", 1, .25, 4, .05, "×"),
    Cut: `<label>시작 (초)<input name="start" type="number" min="0" max="${duration / 1000}" value="0" step=".001" required></label>
      <label>끝 (초)<input name="end" type="number" min="0" max="${duration / 1000}" value="${duration / 1000}" step=".001" required></label>
      <p>전체 ${count}프레임 · ${(duration / 1000).toFixed(2)}초</p>`
  };
  fields.innerHTML = panels[name];
  fields.querySelectorAll("input[type=range]").forEach(input => input.addEventListener("input", () => {
    if (name === "Resize" && byId("lock").getAttribute("aria-pressed") === "true") syncSize(input);
    updateSliders();
  }));
  byId("lock")?.addEventListener("click", event => {
    const control = event.currentTarget;
    const locked = control.getAttribute("aria-pressed") !== "true";
    control.setAttribute("aria-pressed", locked);
    control.textContent = locked ? "🔒 비율 유지" : "🔓 비율 따로 조절";
    if (locked) syncSize(settings.elements.width);
    updateSliders();
  });
}

function slider(key, label, value, min, max, step, unit) {
  return `<label><span>${label} · <output id="value-${key}">${value}${unit}</output></span>
    <input type="range" name="${key}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"></label>`;
}

function updateSliders() {
  fields.querySelectorAll("input[type=range]").forEach(input => {
    byId(`value-${input.name}`).value = input.value + input.dataset.unit;
  });
}

function syncSize(changed) {
  const { width, height } = source;
  const other = changed.name === "width" ? settings.elements.height : settings.elements.width;
  const ratio = changed.name === "width" ? height / width : width / height;
  other.value = Math.round(changed.valueAsNumber * ratio);
}

function planEdit(name, values) {
  let { width, height, frames } = source;
  let colors = 256, lowerResolution = false;
  let cropMode, background, rotation;
  switch (name) {
    case "Resize":
      width = Number(values.get("width"));
      height = Number(values.get("height"));
      break;
    case "Crop": {
      const [x, y] = values.get("ratio").split(":").map(Number);
      cropMode = values.get("fill");
      background = values.get("color");
      const fit = cropMode === "pad" ? Math.ceil : Math.floor;
      const scale = (cropMode === "pad" ? Math.max : Math.min)(width / x, height / y);
      const units = Math.max(1, fit(scale));
      width = units * x;
      height = units * y;
      break;
    }
    case "Downsizing":
      if (!["scale", "skip", "resolution"].some(key => values.has(key))) throw new Error("적용할 방식을 한 가지 이상 선택해 주세요.");
      if (values.has("scale")) {
        width = Math.max(1, Math.round(width * .6));
        height = Math.max(1, Math.round(height * .6));
      }
      if (values.has("skip")) frames = frames.filter((_, i) => i % 2 === 0).map((frame, i) =>
        ({ ...frame, delay: frame.delay + (source.frames[i * 2 + 1]?.delay ?? 0) }));
      lowerResolution = values.has("resolution");
      if (lowerResolution) colors = 64;
      break;
    case "Rotate":
      rotation = values.get("mode");
      if (["90", "270"].includes(rotation)) [width, height] = [height, width];
      break;
    case "Reverse":
      frames = [...frames].reverse();
      break;
    case "Speed": {
      const multiplier = Number(values.get("speed"));
      frames = frames.map(frame => ({ ...frame, delay: frame.delay / multiplier }));
      break;
    }
    case "Cut": {
      const start = Number(values.get("start")) * 1000;
      const end = Number(values.get("end")) * 1000;
      if (!(end > start)) throw new Error("끝 시간은 시작 시간보다 커야 합니다.");
      let position = 0;
      frames = frames.flatMap(frame => {
        const delay = Math.min(end, position + frame.delay) - Math.max(start, position);
        position += frame.delay;
        return delay > 0 ? [{ ...frame, delay }] : [];
      });
      if (!frames.length) throw new Error("선택한 구간에 프레임이 없습니다.");
      break;
    }
  }
  if (width > 8192 || height > 8192 || width * height > 24000000) {
    throw new Error("출력 크기가 너무 큽니다. 한 변 8,192px 및 총 2,400만 픽셀 이하로 선택해 주세요.");
  }
  return { width, height, frames, colors, cropMode, background, rotation, lowerResolution };
}

async function paint(context, frame, plan) {
  const { image } = await source.decoder.decode({ frameIndex: frame.index });
  const { width, height, cropMode, background, rotation } = plan;
  try {
    context.clearRect(0, 0, width, height);
    context.save();
    if (cropMode) {
      if (cropMode === "pad") {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      const scale = (cropMode === "pad" ? Math.min : Math.max)(width / source.width, height / source.height);
      const w = source.width * scale, h = source.height * scale;
      context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    } else if (rotation) {
      context.translate(width / 2, height / 2);
      if (rotation === "h") context.scale(-1, 1);
      else if (rotation === "v") context.scale(1, -1);
      else context.rotate(Number(rotation) * Math.PI / 180);
      context.drawImage(image, -source.width / 2, -source.height / 2, source.width, source.height);
    } else {
      context.drawImage(image, 0, 0, width, height);
    }
  } finally {
    context.restore();
    image.close?.();
  }
}

function optimizeGif(bytes) {
  const parts = [];
  let position = 13 + ((bytes[10] & 128) ? 3 * (2 << (bytes[10] & 7)) : 0);
  parts.push(bytes.slice(0, position));
  while (position < bytes.length) {
    const start = position;
    const marker = bytes[position++];
    if (marker === 0x3b) {
      parts.push(Uint8Array.of(marker));
      return new Blob(parts, { type: "image/gif" });
    }
    const extension = marker === 0x21;
    const label = extension ? bytes[position++] : 0;
    if (marker === 0x2c) {
      const flags = bytes[position + 8];
      position += 10 + ((flags & 128) ? 3 * (2 << (flags & 7)) : 0);
    } else if (!extension) {
      throw new Error("GIF 블록을 읽을 수 없습니다.");
    }
    const header = bytes.slice(start, position);
    const blocks = [];
    while (position < bytes.length) {
      const size = bytes[position++];
      if (!size) break;
      if (position + size > bytes.length) throw new Error("GIF 데이터가 잘렸습니다.");
      blocks.push(bytes.subarray(position, position + size));
      position += size;
    }
    if (label === 0xfe) continue;
    if (extension) {
      parts.push(bytes.slice(start, position));
      continue;
    }
    parts.push(header);
    const payload = new Uint8Array(blocks.reduce((total, block) => total + block.length, 0));
    let offset = 0;
    for (const block of blocks) {
      payload.set(block, offset);
      offset += block.length;
    }
    for (let i = 0; i < payload.length; i += 255) {
      const block = payload.subarray(i, i + 255);
      parts.push(Uint8Array.of(block.length), block);
    }
    parts.push(Uint8Array.of(0));
  }
  throw new Error("GIF 종료 블록을 찾을 수 없습니다.");
}

async function encodeGif(context, plan) {
  const { GIFEncoder, quantize, applyPalette } = window;
  const gif = GIFEncoder();
  const { width, height, frames, colors } = plan;
  let elapsed = 0, written = 0, writtenFrames = 0;
  let reduced;
  if (plan.lowerResolution) {
    reduced = document.createElement("canvas");
    reduced.width = Math.max(1, Math.round(width / 2));
    reduced.height = Math.max(1, Math.round(height / 2));
  }
  for (const [index, frame] of frames.entries()) {
    await paint(context, frame, plan);
    if (reduced) {
      const small = reduced.getContext("2d");
      small.clearRect(0, 0, reduced.width, reduced.height);
      small.drawImage(context.canvas, 0, 0, reduced.width, reduced.height);
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = false;
      context.drawImage(reduced, 0, 0, width, height);
      context.imageSmoothingEnabled = true;
    }
    const rgba = context.getImageData(0, 0, width, height).data;
    const visible = quantize(rgba, colors - 1, {
      format: "rgba4444", oneBitAlpha: true, clearAlpha: true
    }).filter(color => color[3] !== 0);
    const palette = [[0, 0, 0, 0], ...visible];
    const indexed = applyPalette(rgba, palette, "rgba4444");
    for (let pixel = 0; pixel < indexed.length; pixel++) {
      if (rgba[pixel * 4 + 3] <= 127) indexed[pixel] = 0;
    }
    elapsed += frame.delay;
    const delay = Math.max(10, Math.round((elapsed - written) / 10) * 10);
    for (let remaining = delay; remaining > 0; remaining -= 655350) {
      writtenFrames++;
      gif.writeFrame(indexed, width, height, {
        palette, delay: Math.min(remaining, 655350), repeat: source.repeat,
        transparent: true, transparentIndex: 0, dispose: 2
      });
    }
    written += delay;
    if (index % 6 === 0) {
      message(`GIF를 만드는 중… ${index + 1} / ${frames.length}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  gif.finish();
  plan.duration = written;
  plan.count = writtenFrames;
  return new Blob([gif.bytes()], { type: "image/gif" });
}

async function encodeMp4(plan) {
  plan.width += plan.width % 2;
  plan.height += plan.height % 2;
  if ("VideoEncoder" in window) {
    try {
      return await encodeNativeMp4(plan);
    } catch (error) {
      console.warn("Local MP4 encoding unavailable", error);
    }
  }
  return encodeFfmpegMp4();
}

async function encodeNativeMp4(plan) {
  const { width, height, frames } = plan;
  const config = { codec: "avc1.420033", width, height, bitrate: 2400000,
    framerate: 30, latencyMode: "realtime", avc: { format: "avc" } };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) {
    throw new Error("이 브라우저에서 H.264 인코딩을 사용할 수 없습니다.");
  }
  const samples = [];
  const durations = new Map();
  let avcConfig, failure;
  const encoder = new VideoEncoder({
    error(error) { failure = error; },
    output(chunk, metadata) {
      if (metadata.decoderConfig?.description) avcConfig = new Uint8Array(metadata.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === "key", duration: durations.get(chunk.timestamp), timestamp: chunk.timestamp });
    }
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  let timestamp = 0;
  try {
    encoder.configure(config);
    message("MP4로 변환하는 중…");
    for (const [index, frame] of frames.entries()) {
      if (failure) throw failure;
      await paint(context, frame, plan);
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      const delay = Math.max(1, Math.round(frame.delay));
      durations.set(timestamp, delay);
      const videoFrame = new VideoFrame(canvas, { timestamp, duration: delay * 1000 });
      try {
        encoder.encode(videoFrame, { keyFrame: true });
      } finally {
        videoFrame.close();
      }
      timestamp += delay * 1000;
      if (index % 8 === 7) await encoder.flush();
    }
    await encoder.flush();
    if (failure) throw failure;
    if (!avcConfig || samples.length !== frames.length) throw new Error("MP4 프레임을 모두 기록하지 못했습니다.");
    samples.sort((a, b) => a.timestamp - b.timestamp);
    return muxAvc(samples, avcConfig, width, height);
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}

async function encodeFfmpegMp4() {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("../vendor/ffmpeg/classes.js"), import("../vendor/util/index.js")
  ]);
  const ffmpeg = new FFmpeg();
  const base = "https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd";
  const urls = [];
  try {
    message("MP4 변환 모듈을 불러오는 중…");
    urls.push(await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"));
    urls.push(await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"));
    await ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1] });
    message("MP4로 변환하는 중…");
    await ffmpeg.writeFile("source.gif", source.bytes);
    const code = await ffmpeg.exec(["-i", "source.gif", "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "result.mp4"]);
    if (code !== 0) throw new Error("MP4 변환에 실패했습니다.");
    return new Blob([await ffmpeg.readFile("result.mp4")], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
    urls.forEach(url => URL.revokeObjectURL(url));
  }
}

async function runEdit(event) {
  event.preventDefault();
  if (busy || !source || !active) return;
  setBusy(true);
  message("편집하는 중…");
  try {
    const values = new FormData(settings);
    const format = values.get("format") || "gif";
    const plan = planEdit(active, values);
    let blob;
    if (active === "Optimize") {
      blob = optimizeGif(source.bytes);
    } else if (format === "mp4") {
      blob = await encodeMp4(plan);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = plan.width;
      canvas.height = plan.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (format === "jpg") {
        await paint(ctx, plan.frames[0], plan);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .93));
        if (!blob) throw new Error("JPG 파일을 만들 수 없습니다.");
        plan.frames = [{ delay: 0 }];
      } else {
        blob = await encodeGif(ctx, plan);
      }
    }
    if (output) URL.revokeObjectURL(output.url);
    const prefix = formats[active][1];
    const stem = source.blob.name.replace(/\.gif$/i, "");
    const duration = plan.duration ?? plan.frames.reduce((sum, f) => sum + f.delay, 0);
    output = { blob, format, url: URL.createObjectURL(blob),
      download: `${prefix}_${format === "gif" ? source.blob.name : `${stem}.${format}`}`,
      suggested: `${stem}_ed.${format}` };
    byId("resultTitle").textContent = `${prefix} ${format.toUpperCase()}`;
    showMedia("resultPreview", output.url, blob.type);
    showMeta("resultMeta", { ...plan, blob, duration, count: plan.count ?? plan.frames.length });
    byId("original").open = false;
    byId("result").hidden = false;
    const difference = source.blob.size - blob.size;
    const percent = (Math.abs(difference) * 100 / source.blob.size).toFixed(1);
    byId("sizeChange").textContent = difference === 0 ? "입력 파일과 용량이 같습니다." :
      `입력 파일 대비 ${percent}% ${difference > 0 ? "감소" : "증가"}`;
    byId("continueEdit").hidden = format !== "gif";
    message(active === "Optimize" ? (difference > 0 ? `원본보다 ${difference.toLocaleString()}바이트 줄였습니다.` :
      "제거할 주석이나 정리할 데이터 블록이 없어 용량이 그대로입니다.") :
      active === "Downsizing" ? (difference > 0 ?
        `원본보다 ${difference.toLocaleString()}바이트 줄였습니다.` :
        "선택한 방식은 적용됐지만 원본보다 파일이 작아지지 않았습니다. 다른 조합을 시도해 보세요.") :
      "편집이 완료되었습니다.");
  } catch (error) {
    message(error.message || "편집 중 오류가 발생했습니다.", true);
  } finally {
    setBusy(false);
  }
}

function download(name) {
  const link = document.createElement("a");
  link.href = output.url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function saveAs(event) {
  event.preventDefault();
  if (!output) return;
  const name = byId("saveName").value.trim();
  if (!name || /[\\/:*?"<>|]/.test(name)) {
    const input = byId("saveName");
    input.setCustomValidity("파일명에 사용할 수 없는 문자를 제거해 주세요.");
    input.reportValidity();
    return;
  }
  const extension = `.${output.format}`;
  const suggestedName = name.toLowerCase().endsWith(extension) ? name : name + extension;
  try {
    if ("showSaveFilePicker" in window) {
      const handle = await window.showSaveFilePicker({ suggestedName, id: "gif-editor-export", startIn: source.handle || "downloads",
        types: [{ description: output.format.toUpperCase(), accept: { [output.blob.type]: [extension] } }] });
      const file = await handle.createWritable();
      await file.write(output.blob);
      await file.close();
    } else {
      download(suggestedName);
    }
    byId("saveDialog").close();
  } catch (error) {
    if (error.name === "AbortError") return;
    if (error.name === "SecurityError" || error.name === "NotAllowedError") {
      download(suggestedName);
      byId("saveDialog").close();
      return;
    }
    byId("saveHint").textContent = error.message || "파일을 저장할 수 없습니다.";
  }
}

Object.entries(formats).forEach(([name, [icon]]) => {
  const button = document.createElement("button");
  const mark = document.createElement("b");
  mark.textContent = icon;
  mark.setAttribute("aria-hidden", "true");
  button.append(mark, name);
  button.addEventListener("click", () => selectTool(name));
  tools.append(button);
});
byId("pick").onclick = byId("replace").onclick = async () => {
  if ("showOpenFilePicker" in window && location.protocol !== "file:") {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false, types: [{ description: "GIF", accept: { "image/gif": [".gif"] } }]
      });
      await openGif([await handle.getFile()], handle);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  fileInput.click();
};
fileInput.onchange = () => {
  openGif(fileInput.files);
  fileInput.value = "";
};
const drop = byId("drop");
drop.ondragover = event => { event.preventDefault(); drop.classList.add("drag"); };
drop.ondragleave = () => drop.classList.remove("drag");
drop.ondrop = async event => {
  event.preventDefault();
  drop.classList.remove("drag");
  const files = Array.from(event.dataTransfer.files);
  const handlePromise = files.length === 1 ? event.dataTransfer.items[0]?.getAsFileSystemHandle?.() : null;
  const handle = await Promise.resolve(handlePromise).catch(() => null);
  await openGif(files, handle?.kind === "file" ? handle : null);
};
byId("sample").onclick = () => {
  const { GIFEncoder } = window;
  const gif = GIFEncoder();
  const width = 144, height = 88;
  const colors = [[13, 48, 32], [255, 220, 120], [91, 164, 104]];
  for (let frame = 0; frame < 12; frame++) {
    const pixels = new Uint8Array(width * height);
    const centerX = 72 + Math.cos(frame * Math.PI / 6) * 43;
    const centerY = 44 + Math.sin(frame * Math.PI / 6) * 19;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 < 144) pixels[y * width + x] = 1;
        else if (x % 12 === 0 && y % 12 === 0) pixels[y * width + x] = 2;
      }
    }
    gif.writeFrame(pixels, width, height, { palette: colors, delay: 85, repeat: 0 });
  }
  gif.finish();
  return openGif([new File([gif.bytes()], "sample.gif", { type: "image/gif" })]);
};
byId("continueEdit").onclick = async () => {
  if (busy || output?.format !== "gif") return;
  const { name } = source.blob;
  await openGif([new File([output.blob], name, { type: "image/gif" })], source.handle);
};
byId("back").onclick = () => selectTool();
settings.onsubmit = runEdit;
byId("download").onclick = () => download(output.download);
byId("save").onclick = () => {
  byId("saveName").value = output.suggested;
  byId("saveName").setCustomValidity("");
  byId("saveHint").textContent = "저장 대화상자에서 폴더를 선택할 수 있습니다.";
  byId("saveDialog").showModal();
};
byId("saveName").oninput = event => event.target.setCustomValidity("");
byId("cancelSave").onclick = () => byId("saveDialog").close();
byId("saveForm").onsubmit = saveAs;





