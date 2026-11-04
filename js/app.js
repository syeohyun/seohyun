const { GIFEncoder, quantize, applyPalette } = window;

const MAX_FRAMES = 360;
const FORMATS = [
  { ext: "mp4", label: "MP4", hint: "바로 변환", native: true },
  { ext: "webm", label: "WEBM", hint: "바로 변환", native: true },
  { ext: "mov", label: "MOV", hint: "바로 변환", native: true },
  { ext: "m4v", label: "M4V", hint: "바로 변환", native: true },
  { ext: "ogv", label: "OGV", hint: "바로 변환", native: true },
  { ext: "ogg", label: "OGG", hint: "바로 변환", native: true },
  { ext: "mkv", label: "MKV", hint: "MP4로 변환", native: false },
  { ext: "avi", label: "AVI", hint: "MP4로 변환", native: false },
  { ext: "wmv", label: "WMV", hint: "MP4로 변환", native: false },
  { ext: "asf", label: "ASF", hint: "MP4로 변환", native: false },
  { ext: "flv", label: "FLV", hint: "MP4로 변환", native: false },
  { ext: "f4v", label: "F4V", hint: "MP4로 변환", native: false },
  { ext: "mpg", label: "MPG", hint: "MP4로 변환", native: false },
  { ext: "mpeg", label: "MPEG", hint: "MP4로 변환", native: false },
  { ext: "m2v", label: "M2V", hint: "MP4로 변환", native: false },
  { ext: "ts", label: "TS", hint: "MP4로 변환", native: false },
  { ext: "mts", label: "MTS", hint: "MP4로 변환", native: false },
  { ext: "m2ts", label: "M2TS", hint: "MP4로 변환", native: false },
  { ext: "3gp", label: "3GP", hint: "MP4로 변환", native: false },
  { ext: "3g2", label: "3G2", hint: "MP4로 변환", native: false },
  { ext: "vob", label: "VOB", hint: "MP4로 변환", native: false },
  { ext: "rm", label: "RM", hint: "MP4로 변환", native: false },
  { ext: "rmvb", label: "RMVB", hint: "MP4로 변환", native: false },
  { ext: "divx", label: "DIVX", hint: "MP4로 변환", native: false },
  { ext: "mxf", label: "MXF", hint: "MP4로 변환", native: false }
];

const byId = (id) => document.getElementById(id);

const els = {
  dropzone: byId("dropzone"),
  pickBtn: byId("pickBtn"),
  fileInput: byId("fileInput"),
  fileBanner: byId("fileBanner"),
  warnBox: byId("warnBox"),
  warnTitle: byId("warnTitle"),
  warnText: byId("warnText"),
  warnPickBtn: byId("warnPickBtn"),
  transcodeBtn: byId("transcodeBtn"),
  mp4DownloadBtn: byId("mp4DownloadBtn"),
  infoLayout: byId("infoLayout"),
  settingsPanel: byId("settingsPanel"),
  infoGrid: byId("infoGrid"),
  preview: byId("preview"),
  editBtn: byId("editBtn"),
  capture: byId("capture"),
  widthInput: byId("widthInput"),
  widthValue: byId("widthValue"),
  heightInput: byId("heightInput"),
  lockRatio: byId("lockRatio"),
  fpsInput: byId("fpsInput"),
  fpsValue: byId("fpsValue"),
  startInput: byId("startInput"),
  endInput: byId("endInput"),
  trimTrack: byId("trimTrack"),
  trimSelected: byId("trimSelected"),
  trimStart: byId("trimStart"),
  trimEnd: byId("trimEnd"),
  trimStartLabel: byId("trimStartLabel"),
  trimEndLabel: byId("trimEndLabel"),
  trimLenLabel: byId("trimLenLabel"),
  playRangeBtn: byId("playRangeBtn"),
  cropModes: byId("cropModes"),
  cropCanvas: byId("cropCanvas"),
  cropHint: byId("cropHint"),
  estimate: byId("estimate"),
  clipNote: byId("clipNote"),
  convertBtn: byId("convertBtn"),
  cancelBtn: byId("cancelBtn"),
  progressFill: byId("progressFill"),
  progressLabel: byId("progressLabel"),
  downloadBtn: byId("downloadBtn"),
  statusText: byId("statusText"),
  framePanel: byId("framePanel"),
  liveFrame: byId("liveFrame"),
  thumbs: byId("thumbs"),
  resultPanel: byId("resultPanel"),
  resultImg: byId("resultImg"),
  resultName: byId("resultName"),
  archiveGrid: byId("archiveGrid"),
  launchNote: byId("launchNote"),
  toast: byId("toast")
};

const state = {
  file: null,
  sourceUrl: "",
  duration: 0,
  videoWidth: 0,
  videoHeight: 0,
  sourceFps: null,
  aspect: 1,
  cropMode: "full",
  cropX: 0.5,
  cropY: 0.5,
  gifBlob: null,
  gifName: "",
  mp4File: null,
  converting: false,
  cancel: false,
  archiveUrls: []
};

let dbPromise = null;
let ffmpegTools = null;
let toastTimer = 0;

function toast(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 4200);
}

function extOf(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function stripExt(name) {
  return String(name || "video").replace(/\.[^/.]+$/, "") || "video";
}

function gifFileName(name) {
  return `${stripExt(name)}.gif`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return "-";
  const whole = Math.max(0, seconds);
  const m = Math.floor(whole / 60);
  const s = Math.floor(whole % 60);
  const cs = Math.floor((whole % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function even(value) {
  return Math.max(2, Math.round(Number(value) / 2) * 2);
}

function setProgress(percent, message) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  els.progressFill.style.width = `${clamped}%`;
  els.progressLabel.textContent = `${clamped}%`;
  if (message) els.statusText.textContent = message;
}

function setConverting(on) {
  state.converting = on;
  document.body.classList.toggle("converting", on);
  els.convertBtn.disabled = on;
  els.cancelBtn.hidden = !on;
  els.fileInput.disabled = on;
  els.pickBtn.classList.toggle("is-off", on);
  els.warnPickBtn.classList.toggle("is-off", on);
  els.transcodeBtn.disabled = on;
}

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("kmou-gif-archive", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("gifs")) {
          db.createObjectStore("gifs", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function archiveAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("gifs", "readonly").objectStore("gifs").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function archivePut(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("gifs", "readwrite").objectStore("gifs").put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function archiveDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("gifs", "readwrite").objectStore("gifs").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function renderArchive() {
  state.archiveUrls.forEach((url) => URL.revokeObjectURL(url));
  state.archiveUrls = [];
  let items = [];
  try {
    items = await archiveAll();
  } catch (error) {
    els.archiveGrid.innerHTML = `<p class="empty-archive">보관함을 열지 못했습니다.</p>`;
    return;
  }
  items.sort((a, b) => b.created - a.created);
  els.archiveGrid.innerHTML = "";
  if (!items.length) {
    els.archiveGrid.innerHTML = `<p class="empty-archive">아직 보관한 GIF가 없습니다. 변환이 끝나면 이곳에 쌓입니다.</p>`;
    return;
  }
  items.forEach((item) => {
    const url = URL.createObjectURL(item.blob);
    state.archiveUrls.push(url);
    const card = document.createElement("article");
    card.className = "archive-card";
    const when = new Date(item.created);
    const stamp = `${when.getFullYear()}.${when.getMonth() + 1}.${when.getDate()} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
    card.innerHTML = `
      <img src="${url}" alt="${escapeHtml(item.name)} 미리보기">
      <h3>${escapeHtml(item.name)}</h3>
      <p>${item.width}×${item.height} · ${item.fps}fps · ${formatBytes(item.bytes)}<br>${stamp}</p>
      <div class="card-actions">
        <button type="button" class="save">다운로드</button>
        <button type="button" class="del">삭제</button>
      </div>`;
    card.querySelector(".save").addEventListener("click", () => downloadBlob(item.blob, item.name));
    card.querySelector(".del").addEventListener("click", async () => {
      await archiveDelete(item.id);
      toast(`${item.name} 을 보관함에서 뺐습니다.`);
      renderArchive();
    });
    els.archiveGrid.appendChild(card);
  });
}

function infoRow(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function renderInfo() {
  const file = state.file;
  if (!file) return;
  const ext = extOf(file.name).toUpperCase() || "알 수 없음";
  els.infoGrid.innerHTML = [
    infoRow("파일명", file.name),
    infoRow("형식", ext),
    infoRow("용량", formatBytes(file.size)),
    infoRow("형식 표기", file.type || "브라우저가 형식을 적지 않음"),
    infoRow("길이", state.duration ? formatClock(state.duration) : "-"),
    infoRow("해상도", state.videoWidth ? `${state.videoWidth} × ${state.videoHeight}` : "-"),
    infoRow("원본 FPS", state.sourceFps ? `${state.sourceFps}` : "파일에서 확인하지 못함"),
    infoRow("GIF 이름", gifFileName(file.name))
  ].join("");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cropRatio() {
  if (state.cropMode === "1:1") return 1;
  if (state.cropMode === "9:16") return 9 / 16;
  if (state.cropMode === "16:9") return 16 / 9;
  return state.videoWidth && state.videoHeight ? state.videoWidth / state.videoHeight : 1;
}

function cropLabel() {
  if (state.cropMode === "1:1") return "정사각형 1:1";
  if (state.cropMode === "9:16") return "릴스 9:16";
  if (state.cropMode === "16:9") return "가로 16:9";
  return "전체";
}

function cropSourceRect() {
  const vw = state.videoWidth || 1;
  const vh = state.videoHeight || 1;
  if (state.cropMode === "full") return { sx: 0, sy: 0, sw: vw, sh: vh };
  const target = cropRatio();
  const source = vw / vh;
  let sw;
  let sh;
  if (source > target) {
    sh = vh;
    sw = vh * target;
  } else {
    sw = vw;
    sh = vw / target;
  }
  const maxX = Math.max(0, vw - sw);
  const maxY = Math.max(0, vh - sh);
  return {
    sx: maxX * clamp(state.cropX, 0, 1),
    sy: maxY * clamp(state.cropY, 0, 1),
    sw,
    sh
  };
}

function selectedRange() {
  const fps = Math.min(30, Math.max(1, Number(els.fpsInput.value) || 1));
  const start = Math.max(0, Number(els.startInput.value) || 0);
  const endLimit = state.duration || 0;
  let end = Number(els.endInput.value);
  if (!Number.isFinite(end)) end = endLimit;
  end = Math.min(endLimit, Math.max(start, end));
  return { fps, start, end };
}

function outputSize() {
  let width = even(els.widthInput.value);
  let height = even(els.heightInput.value);
  const ratio = els.lockRatio.checked ? cropRatio() : 0;
  if (ratio) {
    height = even(width / ratio);
    if (height > 960) {
      height = 960;
      width = even(height * ratio);
    }
  }
  return { width: Math.max(2, width), height: Math.max(2, height) };
}

function updateEstimate() {
  const { fps, start, end } = selectedRange();
  const { width, height } = outputSize();
  els.fpsValue.textContent = `${fps}fps`;
  els.widthValue.textContent = `${width}px`;
  if (els.lockRatio.checked) els.heightInput.value = String(height);
  const frames = Math.max(0, Math.ceil((end - start) * fps - 1e-6));
  const over = frames > MAX_FRAMES;
  els.estimate.textContent = frames
    ? `예상 ${frames}프레임 · ${start.toFixed(1)}초~${end.toFixed(1)}초 · ${fps}fps · ${width}×${height} · ${cropLabel()}`
    : "구간을 정하면 프레임 수를 계산합니다.";
  els.estimate.style.color = over ? "#ffb4a2" : "#fff1b0";
  els.convertBtn.disabled = state.converting || frames < 1 || over;
  if (over) {
    els.clipNote.textContent = `한 번에 최대 ${MAX_FRAMES}프레임까지 만들 수 있습니다. 끝 시간을 줄이거나 FPS를 낮추세요.`;
  }
}

function applyClipDefaults() {
  const sourceFps = state.sourceFps && state.sourceFps > 0 ? state.sourceFps : 30;
  const fps = Math.min(30, Math.max(1, Math.round(sourceFps)));
  els.fpsInput.value = String(fps);
  state.cropMode = "full";
  state.cropX = 0.5;
  state.cropY = 0.5;
  els.lockRatio.checked = true;
  els.heightInput.readOnly = true;
  els.startInput.value = "0";
  els.startInput.max = String(state.duration || 0);
  els.endInput.max = String(state.duration || 0);
  let end = state.duration || 0;
  const maxSeconds = MAX_FRAMES / fps;
  if (end > maxSeconds) {
    end = Math.floor(maxSeconds * 10) / 10;
    els.clipNote.textContent = `영상이 길어 앞에서 ${end}초를 기본으로 골랐습니다. FPS를 낮추면 더 길게 담을 수 있습니다.`;
  } else {
    els.clipNote.textContent = "프레임은 최대 30fps로 잘라 GIF 애니메이션을 만듭니다.";
  }
  els.endInput.value = String(Math.max(0.1, end));
  const width = state.cropMode === "9:16" ? 360 : 480;
  els.widthInput.value = String(Math.min(width, state.videoWidth || width));
  paintTrim();
  markCropButtons();
  drawCrop();
  updateEstimate();
}

function resetResult() {
  state.gifBlob = null;
  state.gifName = "";
  els.downloadBtn.disabled = true;
  els.resultPanel.hidden = true;
  els.resultImg.removeAttribute("src");
  els.framePanel.hidden = true;
  els.thumbs.innerHTML = "";
  setProgress(0, "영상을 올리면 프레임을 잘라 GIF로 만듭니다.");
}

async function sniffMp4Fps(file) {
  const ext = extOf(file.name);
  if (!["mp4", "m4v", "mov", "3gp", "3g2"].includes(ext)) return null;
  const size = Math.min(file.size, 12 * 1024 * 1024);
  const buffer = await file.slice(0, size).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  function walk(start, end, visit) {
    let cursor = start;
    while (cursor + 8 <= end) {
      let boxSize = view.getUint32(cursor);
      let header = 8;
      if (boxSize === 0) boxSize = end - cursor;
      if (boxSize === 1 && cursor + 16 <= end) {
        const high = view.getUint32(cursor + 8);
        const low = view.getUint32(cursor + 12);
        boxSize = high * 4294967296 + low;
        header = 16;
      }
      if (boxSize < header || cursor + boxSize > end + 32) break;
      const type = String.fromCharCode(bytes[cursor + 4], bytes[cursor + 5], bytes[cursor + 6], bytes[cursor + 7]);
      const boxEnd = Math.min(end, cursor + boxSize);
      visit(type, cursor, header, boxEnd);
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
        walk(cursor + header, boxEnd, visit);
      }
      cursor += boxSize;
    }
  }

  const tracks = [];
  walk(0, bytes.length, (type, cursor, header) => {
    if (type === "trak") tracks.push({ handler: "", timescale: null, delta: null });
    const track = tracks[tracks.length - 1];
    if (!track) return;
    if (type === "hdlr" && cursor + header + 12 <= bytes.length) {
      track.handler = String.fromCharCode(
        bytes[cursor + header + 8],
        bytes[cursor + header + 9],
        bytes[cursor + header + 10],
        bytes[cursor + header + 11]
      );
    }
    if (type === "mdhd") {
      const version = bytes[cursor + header];
      const timescaleAt = version === 1 ? cursor + header + 20 : cursor + header + 12;
      if (timescaleAt + 4 <= bytes.length) track.timescale = view.getUint32(timescaleAt);
    }
    if (type === "stts" && cursor + header + 16 <= bytes.length) {
      const count = view.getUint32(cursor + header + 4);
      if (count > 0) track.delta = view.getUint32(cursor + header + 12);
    }
  });

  const video = tracks.find((track) => track.handler === "vide" && track.timescale && track.delta);
  if (!video) return null;
  const fps = video.timescale / video.delta;
  if (fps >= 1 && fps <= 240) return Math.round(fps * 100) / 100;
  return null;
}

function readDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity) return video.duration;
  try {
    if (video.seekable && video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
  } catch (error) {
    /* 길이를 아직 모를 수 있습니다. */
  }
  return 0;
}

function showUploaded(file) {
  els.infoLayout.hidden = false;
  els.settingsPanel.hidden = true;
  els.editBtn.hidden = false;
  els.fileBanner.hidden = false;
  els.fileBanner.textContent = `${file.name} 이 올라왔습니다. 편집하기를 눌러 구간과 화면을 고르세요.`;
  els.editBtn.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openEditor() {
  if (!state.file) return;
  els.infoLayout.hidden = false;
  els.settingsPanel.hidden = false;
  els.settingsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadPlayable(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = els.preview;
    els.infoLayout.hidden = false;
    let settled = false;
    const timer = setTimeout(() => finish(new Error("timeout")), 12000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.onloadeddata = null;
      if (error) {
        URL.revokeObjectURL(url);
        video.removeAttribute("src");
        reject(error);
        return;
      }
      resolve(url);
    }

    video.onerror = () => finish(new Error("decode"));
    video.onloadedmetadata = () => {
      if (video.videoWidth <= 0) return;
      if (readDuration(video) > 0) {
        finish(null);
        return;
      }
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        if (video.videoWidth > 0) finish(null);
      };
      video.addEventListener("seeked", onSeeked);
      try {
        video.currentTime = 1e101;
      } catch (error) {
        finish(null);
      }
    };
    video.src = url;
    video.load();
  });
}

async function usePlayableFile(file, url) {
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.file = file;
  state.sourceUrl = url;
  state.duration = readDuration(els.preview);
  state.videoWidth = els.preview.videoWidth;
  state.videoHeight = els.preview.videoHeight;
  state.aspect = state.videoWidth / state.videoHeight || 1;
  state.sourceFps = await sniffMp4Fps(file).catch(() => null);
  if (state.duration > 0) els.preview.currentTime = Math.min(0.05, state.duration);
  els.heightInput.readOnly = true;
  els.editBtn.hidden = false;
  els.warnBox.hidden = true;
  if (els.settingsPanel.hidden) {
    els.fileBanner.hidden = false;
    els.fileBanner.textContent = `${file.name} 이 올라왔습니다. 편집하기를 눌러 구간과 화면을 고르세요.`;
  }
  renderInfo();
  applyClipDefaults();
  setProgress(0, `${file.name} 을 올렸습니다. 구간과 화면을 고른 뒤 GIF로 만드세요.`);
}

function showUnreadable(file, canTranscode) {
  state.duration = 0;
  state.videoWidth = 0;
  state.videoHeight = 0;
  state.sourceFps = null;
  els.infoLayout.hidden = false;
  els.settingsPanel.hidden = true;
  els.editBtn.hidden = !canTranscode;
  els.preview.removeAttribute("src");
  els.warnBox.hidden = false;
  els.transcodeBtn.hidden = !canTranscode;
  const supported = FORMATS.map((format) => format.label).join(", ");
  if (canTranscode) {
    els.warnTitle.textContent = "이 형식은 브라우저에서 바로 열리지 않습니다";
    els.warnText.textContent = `${file.name} 은 GIF로 바로 자르기 어렵습니다. ${supported} 가운데 재생되는 파일을 다시 고르거나, 아래 버튼으로 MP4로 바꾼 다음 GIF를 만드세요.`;
  } else {
    els.warnTitle.textContent = "동영상 파일이 아닙니다";
    els.warnText.textContent = `이 앱은 동영상만 GIF로 만듭니다. 변환할 수 있는 형식: ${supported}`;
  }
  renderInfo();
  els.fileBanner.hidden = false;
  els.fileBanner.textContent = canTranscode
    ? "형식 안내: 지원 목록의 다른 동영상을 고르거나 MP4로 바꾸세요."
    : "형식 안내: 동영상 파일을 다시 선택하세요.";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

async function acceptFile(file) {
  if (!file || state.converting) return;
  resetResult();
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = "";
  els.preview.removeAttribute("src");
  els.capture.removeAttribute("src");
  state.mp4File = null;
  els.mp4DownloadBtn.hidden = true;
  const ext = extOf(file.name);
  const known = FORMATS.some((format) => format.ext === ext);
  const looksVideo = known || (file.type || "").startsWith("video/");
  els.fileBanner.hidden = false;
  els.fileBanner.textContent = `${file.name} · ${formatBytes(file.size)}`;
  renderInfoPlaceholder(file);
  if (looksVideo) showUploaded(file);
  else els.editBtn.hidden = true;
  toast(`${file.name} 을 불러오는 중`);

  if (!looksVideo) {
    showUnreadable(file, false);
    toast("변환할 수 있는 동영상 형식을 선택하세요.");
    return;
  }

  setProgress(4, "영상 정보를 읽고 있습니다.");
  try {
    const url = await loadPlayable(file);
    await usePlayableFile(file, url);
  } catch (error) {
    showUnreadable(file, true);
    toast("영상은 올라왔습니다. 편집하기를 눌러 구간을 고르거나, 재생이 안 되면 MP4로 바꾸세요.");
  }
}

function renderInfoPlaceholder(file) {
  state.file = file;
  els.infoLayout.hidden = false;
  els.preview.removeAttribute("src");
  renderInfo();
}

function takeSingleFile(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (files.length > 1) {
    toast("한 번에 하나의 동영상만 선택할 수 있습니다.");
    return;
  }
  acceptFile(files[0]);
}

function seekTo(video, time) {
  return new Promise((resolve) => {
    const target = Math.min(Math.max(time, 0), Math.max(0, (video.duration || time) - 0.04));
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 1200);
    video.addEventListener("seeked", done);
    try {
      video.currentTime = target;
    } catch (error) {
      done();
    }
  });
}

function paintThumb(source, width, height) {
  const thumb = document.createElement("canvas");
  const ratio = height / width;
  thumb.width = 96;
  thumb.height = Math.max(2, Math.round(96 * ratio));
  thumb.getContext("2d").drawImage(source, 0, 0, thumb.width, thumb.height);
  els.thumbs.appendChild(thumb);
  els.thumbs.scrollLeft = els.thumbs.scrollWidth;
}

async function convertGif() {
  if (state.converting || !state.file) return;
  const { fps, start, end } = selectedRange();
  const frameCount = Math.ceil((end - start) * fps - 1e-6);
  if (frameCount < 1) {
    toast("변환할 구간이 너무 짧습니다.");
    return;
  }
  if (frameCount > MAX_FRAMES) {
    toast(`프레임이 ${MAX_FRAMES}장을 넘습니다. 구간이나 FPS를 줄이세요.`);
    return;
  }
  const { width, height } = outputSize();
  state.cancel = false;
  setConverting(true);
  els.downloadBtn.disabled = true;
  els.framePanel.hidden = false;
  els.resultPanel.hidden = true;
  els.thumbs.innerHTML = "";
  els.liveFrame.width = width;
  els.liveFrame.height = height;

  const video = els.preview;
  const live = els.liveFrame.getContext("2d", { willReadFrequently: true });
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);

  try {
    video.muted = true;
    try {
      await video.play();
      video.pause();
    } catch (error) {
      /* 소리 없이 프레임만 읽습니다. */
    }

    for (let index = 0; index < frameCount; index += 1) {
      if (state.cancel) throw new Error("cancelled");
      const time = Math.min(end - 0.04, start + index / fps);
      await seekTo(video, time);
      const crop = cropSourceRect();
      live.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
      const image = live.getImageData(0, 0, width, height);
      const rgba = new Uint8Array(image.data);
      const palette = quantize(rgba, 96);
      const indexed = applyPalette(rgba, palette);
      gif.writeFrame(indexed, width, height, { palette, delay, dispose: 1 });
      paintThumb(els.liveFrame, width, height);
      const percent = ((index + 1) / frameCount) * 100;
      setProgress(percent, `타잔이 ${index + 1}/${frameCount}번째 프레임을 뚝딱 붙이는 중`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: "image/gif" });
    const name = gifFileName(state.file.name);
    state.gifBlob = blob;
    state.gifName = name;
    els.downloadBtn.disabled = false;
    els.resultPanel.hidden = false;
    els.resultImg.src = URL.createObjectURL(blob);
    els.resultName.textContent = `${name} · ${width}×${height} · ${fps}fps · ${formatBytes(blob.size)}`;
    setProgress(100, "뚝딱 완성! 오른쪽 다운로드 버튼으로 받을 수 있습니다.");
    document.body.classList.remove("converting");

    await archivePut({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      blob,
      created: Date.now(),
      width,
      height,
      fps,
      bytes: blob.size
    });
    await renderArchive();
    toast(`${name} 을 만들었고 보관함에도 넣었습니다.`);
  } catch (error) {
    if (error && error.message === "cancelled") {
      setProgress(0, "변환을 취소했습니다.");
      toast("변환을 취소했습니다.");
    } else {
      console.error(error);
      setProgress(0, "GIF를 만들지 못했습니다. 구간을 줄여 다시 시도하세요.");
      toast("변환에 실패했습니다. 다른 구간이나 MP4 변환 후 다시 시도하세요.");
    }
  } finally {
    setConverting(false);
  }
}

async function loadFfmpeg(onDownload) {
  if (!window.crossOriginIsolated) {
    throw new Error("MP4로 바꾸는 기능은 start.bat으로 연 페이지에서 사용할 수 있습니다.");
  }
  if (ffmpegTools?.ffmpeg?.loaded) return ffmpegTools;
  const { FFmpeg } = await import("../vendor/ffmpeg/classes.js");
  const util = await import("../vendor/util/index.js");
  const ffmpeg = new FFmpeg();
  const base = "https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd";
  setProgress(2, "변환 엔진을 준비하고 있습니다. 처음에는 시간이 걸립니다.");
  const coreURL = await util.toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript", true, (event) => {
    if (event.total > 0) onDownload?.(event.received / event.total);
  });
  const wasmURL = await util.toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", true, (event) => {
    if (event.total > 0) {
      setProgress(5 + event.received / event.total * 25, "변환 엔진을 내려받는 중");
    }
  });
  await ffmpeg.load({ coreURL, wasmURL });
  ffmpegTools = { ffmpeg, fetchFile: util.fetchFile };
  return ffmpegTools;
}

async function transcodeCurrent() {
  const file = state.file;
  if (!file || state.converting) return;
  setConverting(true);
  try {
    const { ffmpeg, fetchFile } = await loadFfmpeg();
    const ext = (extOf(file.name) || "bin").replace(/[^a-z0-9]/g, "") || "bin";
    const inputName = `source.${ext}`;
    setProgress(32, "파일을 변환 엔진에 올리고 있습니다.");
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const plans = [
      { out: "ready.mp4", type: "video/mp4", args: ["-i", inputName, "-an", "-c:v", "mpeg4", "-q:v", "6", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "ready.mp4"] },
      { out: "ready.mp4", type: "video/mp4", args: ["-i", inputName, "-an", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "ready.mp4"] },
      { out: "ready.webm", type: "video/webm", args: ["-i", inputName, "-an", "-c:v", "libvpx", "-deadline", "realtime", "-b:v", "1M", "ready.webm"] }
    ];
    let playable = null;
    let lastError = null;
    for (const plan of plans) {
      try {
        setProgress(40, "지원되는 동영상으로 바꾸는 중");
        ffmpeg.on("progress", ({ progress }) => {
          const value = Math.max(0, Math.min(1, Number(progress) || 0));
          setProgress(40 + value * 50, "지원되는 동영상으로 바꾸는 중");
        });
        await ffmpeg.exec(plan.args);
        const data = await ffmpeg.readFile(plan.out);
        if (data && data.length > 1500) {
          const base = stripExt(file.name);
          const nextName = plan.out.endsWith(".webm") ? `${base}.webm` : `${base}.mp4`;
          playable = new File([data], nextName, { type: plan.type });
          try { await ffmpeg.deleteFile(plan.out); } catch (error) { /* 이미 없을 수 있습니다. */ }
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
    try { await ffmpeg.deleteFile(inputName); } catch (error) { /* 정리 실패는 무시합니다. */ }
    if (!playable) throw lastError || new Error("변환 엔진이 이 파일을 열지 못했습니다.");

    state.mp4File = playable;
    els.mp4DownloadBtn.hidden = false;
    setProgress(92, "바꾼 영상을 확인하고 있습니다.");
    const url = await loadPlayable(playable);
    await usePlayableFile(playable, url);
    toast("지원 형식으로 바꿨습니다. 이제 GIF로 만들 수 있습니다.");
  } catch (error) {
    console.error(error);
    const message = error && error.message ? error.message : "형식을 바꾸지 못했습니다.";
    toast(message);
    els.warnText.textContent = `${message} 목록에 있는 다른 동영상 파일을 선택하세요.`;
    setProgress(0, "형식 변환에 실패했습니다.");
  } finally {
    setConverting(false);
  }
}

let dragDepth = 0;

function bindDrag() {
  window.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer) return;
    dragDepth += 1;
    document.body.classList.add("file-dragging");
  });
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    document.documentElement.style.setProperty("--drag-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--drag-y", `${event.clientY}px`);
    const inside = event.target === els.dropzone || els.dropzone.contains(event.target);
    els.dropzone.classList.toggle("hot", inside);
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.body.classList.remove("file-dragging");
      els.dropzone.classList.remove("hot");
    }
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("file-dragging");
    els.dropzone.classList.remove("hot");
    takeSingleFile(event.dataTransfer?.files);
  });
}

function paintTrim() {
  const duration = state.duration || 0;
  const { start, end } = selectedRange();
  const span = duration > 0 ? duration : 1;
  const left = (start / span) * 100;
  const width = Math.max(0, ((end - start) / span) * 100);
  els.trimSelected.style.left = `${left}%`;
  els.trimSelected.style.width = `${width}%`;
  els.trimStart.style.left = `${left}%`;
  els.trimEnd.style.left = `${left + width}%`;
  els.trimStartLabel.textContent = formatClock(start);
  els.trimEndLabel.textContent = formatClock(end);
  els.trimLenLabel.textContent = `선택 ${(end - start).toFixed(1)}초`;
}

function setRange(start, end, seek) {
  const duration = state.duration || 0;
  const gap = 0.1;
  let nextStart = clamp(start, 0, Math.max(0, duration - gap));
  let nextEnd = clamp(end, nextStart + gap, duration || nextStart + gap);
  if (duration && nextEnd > duration) nextEnd = duration;
  els.startInput.value = nextStart.toFixed(2);
  els.endInput.value = nextEnd.toFixed(2);
  paintTrim();
  updateEstimate();
  if (seek && els.preview.src) {
    const time = seek === "end" ? Math.max(nextStart, nextEnd - 0.05) : nextStart;
    els.preview.currentTime = clamp(time, 0, Math.max(0, duration - 0.01));
  }
  drawCrop();
}

function frameLayout(canvas) {
  const vw = state.videoWidth || 1;
  const vh = state.videoHeight || 1;
  const viewW = canvas.clientWidth || canvas.width;
  const viewH = canvas.clientHeight || canvas.height;
  const scale = Math.min(viewW / vw, viewH / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return {
    scale,
    dx: (viewW - dw) / 2,
    dy: (viewH - dh) / 2,
    dw,
    dh,
    viewW,
    viewH
  };
}

function drawCrop() {
  const canvas = els.cropCanvas;
  if (!canvas) return;
  if (state.videoWidth && state.videoHeight) {
    canvas.style.aspectRatio = `${state.videoWidth} / ${state.videoHeight}`;
    canvas.classList.toggle("portrait", state.videoHeight > state.videoWidth);
  }
  const dpr = window.devicePixelRatio || 1;
  const viewW = Math.max(1, Math.round(canvas.clientWidth));
  const viewH = Math.max(1, Math.round(canvas.clientHeight));
  const bitmapW = Math.max(2, Math.round(viewW * dpr));
  const bitmapH = Math.max(2, Math.round(viewH * dpr));
  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW;
    canvas.height = bitmapH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#06110a";
  ctx.fillRect(0, 0, viewW, viewH);
  const video = els.preview;
  const layout = frameLayout(canvas);
  if (video && video.readyState >= 2 && state.videoWidth) {
    ctx.drawImage(video, layout.dx, layout.dy, layout.dw, layout.dh);
  }
  const crop = cropSourceRect();
  const x = layout.dx + crop.sx * layout.scale;
  const y = layout.dy + crop.sy * layout.scale;
  const w = crop.sw * layout.scale;
  const h = crop.sh * layout.scale;
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.rect(layout.dx, layout.dy, layout.dw, layout.dh);
  ctx.rect(x, y, w, h);
  ctx.fill("evenodd");
  ctx.strokeStyle = "#f0c14d";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3));
}

function markCropButtons() {
  els.cropModes.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.crop === state.cropMode);
  });
  els.cropHint.textContent = state.cropMode === "full"
    ? "전체 화면을 사용합니다. 비율을 고르면 노란 틀을 끌어 원하는 곳만 남길 수 있습니다."
    : `${cropLabel()} 틀을 끌어 남길 위치를 고르세요.`;
}

function applyCropMode(mode) {
  state.cropMode = mode;
  state.cropX = 0.5;
  state.cropY = 0.5;
  els.lockRatio.checked = true;
  els.heightInput.readOnly = true;
  markCropButtons();
  updateEstimate();
  drawCrop();
}

function bindTrimHandle(handle, edge) {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const move = (ev) => {
      const rect = els.trimTrack.getBoundingClientRect();
      const ratio = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      const time = ratio * (state.duration || 0);
      const current = selectedRange();
      if (edge === "start") setRange(time, current.end, "start");
      else setRange(current.start, time, "end");
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(event);
  });
}

function playSelection() {
  const { start, end } = selectedRange();
  const video = els.preview;
  if (!video.src) return;
  const stop = () => {
    if (video.currentTime >= end - 0.03) {
      video.pause();
      video.removeEventListener("timeupdate", stop);
    }
  };
  video.addEventListener("timeupdate", stop);
  video.currentTime = start;
  video.play().catch(() => {});
}

function bindCropDrag() {
  const canvas = els.cropCanvas;
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (state.cropMode === "full") return;
    const layout = frameLayout(canvas);
    const crop = cropSourceRect();
    drag = {
      px: event.clientX,
      py: event.clientY,
      x: state.cropX,
      y: state.cropY,
      scale: layout.scale,
      maxX: Math.max(0, state.videoWidth - crop.sw),
      maxY: Math.max(0, state.videoHeight - crop.sh)
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = (event.clientX - drag.px) / drag.scale;
    const dy = (event.clientY - drag.py) / drag.scale;
    if (drag.maxX > 0) state.cropX = clamp((drag.x * drag.maxX + dx) / drag.maxX, 0, 1);
    if (drag.maxY > 0) state.cropY = clamp((drag.y * drag.maxY + dy) / drag.maxY, 0, 1);
    drawCrop();
  });
  canvas.addEventListener("pointerup", () => {
    drag = null;
  });
}

function onFilePicked(event) {
  const picked = Array.from(event.target.files || []);
  event.target.value = "";
  if (!picked.length) return;
  takeSingleFile(picked);
}

function bindUi() {
  els.fileInput.addEventListener("change", onFilePicked);
  els.editBtn.addEventListener("click", openEditor);
  els.widthInput.addEventListener("input", updateEstimate);
  els.heightInput.addEventListener("input", () => {
    if (!els.lockRatio.checked && state.videoWidth) {
      state.aspect = even(els.widthInput.value) / even(els.heightInput.value);
    }
    updateEstimate();
  });
  els.lockRatio.addEventListener("change", () => {
    els.heightInput.readOnly = els.lockRatio.checked;
    if (els.lockRatio.checked && state.videoWidth) {
      state.aspect = state.videoWidth / state.videoHeight;
    }
    updateEstimate();
  });
  els.fpsInput.addEventListener("input", updateEstimate);
  els.startInput.addEventListener("input", () => {
    const current = selectedRange();
    setRange(Number(els.startInput.value) || 0, current.end, "start");
  });
  els.endInput.addEventListener("input", () => {
    const current = selectedRange();
    setRange(current.start, Number(els.endInput.value) || current.end, "end");
  });
  els.playRangeBtn.addEventListener("click", playSelection);
  els.cropModes.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    applyCropMode(button.dataset.crop);
  });
  bindTrimHandle(els.trimStart, "start");
  bindTrimHandle(els.trimEnd, "end");
  bindCropDrag();
  let lastCropDraw = 0;
  window.addEventListener("resize", () => {
    if (!els.settingsPanel.hidden) drawCrop();
  });
  els.preview.addEventListener("seeked", drawCrop);
  els.preview.addEventListener("timeupdate", () => {
    const now = performance.now();
    if (now - lastCropDraw < 90) return;
    lastCropDraw = now;
    drawCrop();
  });
  els.convertBtn.addEventListener("click", convertGif);
  els.cancelBtn.addEventListener("click", () => {
    state.cancel = true;
  });
  els.downloadBtn.addEventListener("click", () => {
    if (!state.gifBlob) return;
    downloadBlob(state.gifBlob, state.gifName);
  });
  els.transcodeBtn.addEventListener("click", transcodeCurrent);
  els.mp4DownloadBtn.addEventListener("click", () => {
    if (state.mp4File) downloadBlob(state.mp4File, state.mp4File.name);
  });
}

if (location.protocol === "file:") els.launchNote.hidden = false;
bindDrag();
bindUi();
els.heightInput.readOnly = true;
renderArchive();
