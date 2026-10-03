/* =========================================================
   PNC WIKI Generator — export.js
   저장 엔진: 문서 일부(저장 단위) → 그림(PNG) / 여러 그림 → ZIP / 문단별 그림 → PDF

   외부 라이브러리 없이 동작한다.
   - 문서는 전부 인라인 스타일이라, 그대로 SVG(foreignObject)에 넣으면 브라우저가 똑같이 그려 준다.
   - ZIP은 압축 없이 묶기(PNG는 이미 압축된 파일), PDF는 JPEG 그림을 페이지마다 한 장씩 넣는 최소 구조.

   화면(미리보기)과 상관없이 「고정 폭 캡처용 문서」를 화면 밖에 따로 그려서 찍는다
   → PC·폰 어디서 저장해도 결과가 같다.
   ========================================================= */

const CAPTURE_WIDTH = 760; // 캡처 문서 폭 (px)
const CAPTURE_PAD = 20; // 그림 테두리 여백
const CAPTURE_SCALE = 2; // 기본 2배율
const PDF_SLICE_MAX = 18000; // PDF 한 페이지 최대 높이 (px). PDF 규격 한계 약 19,200px 아래로
const EXPRESSION_SPLIT_HEIGHT = 6000; // 감정 표현이 이보다 길면 기본/스킨별로 나눠 찍음
const PX_TO_PT = 0.75; // 1px = 0.75pt

/* ---------- 캡처 무대 (화면 밖) ---------- */

function captureStage() {
  let stage = document.getElementById("captureStage");
  if (!stage) {
    stage = document.createElement("div");
    stage.id = "captureStage";
    stage.setAttribute("aria-hidden", "true");
    stage.style.cssText = `position:fixed;left:-100000px;top:0;width:${CAPTURE_WIDTH}px;pointer-events:none;`;
    document.body.appendChild(stage);
  }
  return stage;
}

// 캡처용 문서를 무대에 그림 (mode: "png" | "pdf"). 밝기 테마 반영, 접힌 칸은 전부 펼침
function buildCaptureDoc(mode) {
  const stage = captureStage();
  stage.innerHTML = themePreviewHtml(renderDocument(state, { capture: mode }));
  stage.querySelectorAll("details").forEach((d) => {
    d.open = true;
  });
  return stage.querySelector(".pncwiki-doc");
}

function clearCaptureStage() {
  const stage = document.getElementById("captureStage");
  if (stage) stage.innerHTML = "";
}

// 저장 단위 하나를 「여백 + 문서 바탕색」 틀에 담아 무대에 올림 → 이 틀을 찍는다
function stageWrapper(nodes, docRoot) {
  const wrap = document.createElement("div");
  const bg = getComputedStyle(docRoot).backgroundColor;
  wrap.setAttribute("style", `${docRoot.getAttribute("style") || ""}box-sizing:border-box;width:${CAPTURE_WIDTH}px;padding:${CAPTURE_PAD}px;background:${bg};`);
  (Array.isArray(nodes) ? nodes : [nodes]).forEach((node) => wrap.appendChild(node.cloneNode(true)));
  // 캡처 그림에는 화면용 표시(편집 중 테두리 등)를 넣지 않음
  wrap.querySelectorAll(".pncwiki-editing").forEach((el) => el.classList.remove("pncwiki-editing"));
  const stage = captureStage();
  stage.appendChild(wrap);
  return wrap;
}

/* ---------- 이미지: 전부 그림 안에 넣을 수 있는 형태(data URL)로 ---------- */

const EXPORT_IMAGE_CACHE = new Map(); // 주소 → data URL | null(못 씀)

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function imageToDataUrl(src) {
  if (!src || src.startsWith("data:")) return src;
  if (EXPORT_IMAGE_CACHE.has(src)) return EXPORT_IMAGE_CACHE.get(src);
  let result = null;
  // 생성기 자체 아이콘(assets/…)은 지금 열린 사이트의 같은 파일을 먼저 시도 → 어디서 열어도 안정적
  const tries = src.startsWith(ASSET_BASE) ? [`./assets/${src.slice(ASSET_BASE.length)}`, src] : [src];
  for (const url of tries) {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      result = await blobToDataUrl(blob);
      break;
    } catch {
      // 다른 사이트가 허락하지 않은 이미지 (보안 규칙) → 다음 후보
    }
  }
  EXPORT_IMAGE_CACHE.set(src, result);
  return result;
}

// 틀 안 이미지를 data URL로 바꾸고, 못 쓰는 이미지는 「이미지 없음」 칸으로 대체. 반환: 대체한 개수
// missingSet을 주면 못 쓴 이미지 주소를 모아 둠 (같은 이미지는 한 번만 세려고)
async function prepareImages(wrap, missingSet = null) {
  let missing = 0;
  const imgs = [...wrap.querySelectorAll("img")];
  // 「이미지 없음」 칸 색: 문서 바탕이 어두우면 어둡게 (눈부시지 않게)
  const rgb = (getComputedStyle(wrap).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number);
  const dark = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128;
  const boxColors = dark ? "border:1px dashed #6b7080;background:#2f323a;color:#a9adb8;" : "border:1px dashed #999999;background:#e3e3e3;color:#666666;";
  for (const img of imgs) {
    const src = img.getAttribute("src");
    const data = await imageToDataUrl(src);
    if (data) {
      img.setAttribute("src", data);
      continue;
    }
    missing += 1;
    if (missingSet) missingSet.add(src);
    const rect = img.getBoundingClientRect();
    const box = document.createElement("span");
    const w = Math.max(48, Math.round(rect.width) || 120);
    const h = Math.max(32, Math.round(rect.height) || 80);
    box.setAttribute(
      "style",
      `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:${w}px;max-width:100%;height:${h}px;${boxColors}font-size:12px;`
    );
    box.textContent = "이미지 없음";
    img.replaceWith(box);
  }
  await Promise.all(
    [...wrap.querySelectorAll("img")].map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  return missing;
}

/* ---------- 그리기: 틀(HTML) → SVG → 캔버스 ---------- */

// 이 기기에서 이 크기의 캔버스를 실제로 만들 수 있는지 직접 시험 (기기 추측 대신)
function canvasFits(w, h) {
  if (w < 1 || h < 1 || w > 32767 || h > 32767) return false;
  const c = document.createElement("canvas");
  try {
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#000";
    ctx.fillRect(w - 1, h - 1, 1, 1);
    return ctx.getImageData(w - 1, h - 1, 1, 1).data[3] === 255;
  } catch {
    return false;
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

// 원하는 배율에서 시작해 이 기기가 감당하는 배율로 낮춤 (최저 1)
function fitScale(w, h, want = CAPTURE_SCALE) {
  for (const s of [want, 1.75, 1.5, 1.25, 1]) {
    if (s > want) continue;
    if (canvasFits(Math.ceil(w * s), Math.ceil(h * s))) return s;
  }
  return 1;
}

const IS_SAFARI = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("그림 만들기 실패"));
    img.src = src;
  });
}

// 틀의 y0부터 높이 h만큼을 scale 배율로 그린 캔버스
async function rasterize(wrap, scale, y0 = 0, h = null) {
  const W = wrap.offsetWidth;
  const fullH = wrap.scrollHeight;
  const H = h == null ? fullH : h;
  const xhtml = new XMLSerializer().serializeToString(wrap);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 ${y0} ${W} ${H}">` +
    `<foreignObject x="0" y="0" width="${W}" height="${fullH}">${xhtml}</foreignObject></svg>`;
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(W * scale);
  canvas.height = Math.ceil(H * scale);
  const ctx = canvas.getContext("2d");
  const bg = getComputedStyle(wrap).backgroundColor;
  const paint = () => {
    // 바탕을 먼저 칠함 (JPEG는 투명이 없어서 비면 검게 나옴)
    ctx.fillStyle = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  paint();
  if (IS_SAFARI) {
    // 사파리는 첫 그리기에서 안쪽 그림이 빠지는 경우가 있어 한 번 더
    await new Promise((r) => setTimeout(r, 120));
    paint();
  }
  return canvas;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("그림 저장 실패"))), type, quality);
  });
}

function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/* ---------- 긴 문단 나누기 (PDF): 글줄·표 칸·그림을 자르지 않는 경계 ---------- */

// 틀 안에서 자를 수 있는 높이(px) 목록. 어떤 글자 줄·그림·작은 칸도 가로지르지 않는 위치만
function safeCutPoints(wrap) {
  const top = wrap.getBoundingClientRect().top;
  const blocks = [];
  wrap.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    // 잘리면 안 되는 것: 그림, 글자만 든 칸(자식 요소가 없음), 줄 하나 크기의 덩어리
    if (el.tagName === "IMG" || !el.firstElementChild || r.height < 120) blocks.push([r.top - top, r.bottom - top]);
  });
  const cuts = new Set();
  blocks.forEach(([, b]) => cuts.add(Math.ceil(b)));
  return [...cuts]
    .filter((y) => y > 0 && !blocks.some(([t, b]) => t < y - 0.5 && b > y + 0.5))
    .sort((a, b) => a - b);
}

// 0 ~ 전체 높이를 maxH 이하 조각으로 (안전한 경계 우선, 없으면 maxH에서 자름)
function sliceRanges(totalH, cuts, maxH) {
  const ranges = [];
  let start = 0;
  while (totalH - start > maxH) {
    const limit = start + maxH;
    let best = -1;
    for (const y of cuts) {
      if (y > start + 40 && y <= limit) best = y;
      if (y > limit) break;
    }
    const end = best > 0 ? best : limit;
    ranges.push([start, end - start]);
    start = end;
  }
  ranges.push([start, totalH - start]);
  return ranges;
}

/* ---------- ZIP (압축 없이 묶기, 한글 파일명 UTF-8 표시) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return [time, day];
}

// files: [{ name, data: Uint8Array, packed?: Uint8Array }] → Blob(zip)
// packed = data를 deflate(raw)로 줄인 것 (있으면 압축 방식 8, 없으면 그대로 0)
function makeZip(files) {
  const enc = new TextEncoder();
  const [time, day] = dosTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const body = file.packed || file.data;
    const method = file.packed ? 8 : 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // 필요한 버전
    local.setUint16(6, 0x0800, true); // 파일명 UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, body);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, method, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, day, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, body.length, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + body.length;
  });
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// 브라우저 내장 압축 (없으면 null → 압축 없이 묶음)
async function deflateRaw(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/* ---------- PDF (페이지마다 JPEG 그림 한 장, 페이지 크기 = 그림 크기) ---------- */

// pages: [{ jpeg: Uint8Array, px: 그림 가로 화소, py: 세로 화소, w: 페이지 가로 pt, h: 세로 pt }]
function makePdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  const num = (n) => (Math.round(n * 100) / 100).toString();

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`));
  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    obj(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.w)} ${num(page.h)}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );
    const draw = `q ${num(page.w)} 0 0 ${num(page.h)} 0 0 cm /Im0 Do Q`;
    obj(contentId, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.px} /Height ${page.py} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
      );
      push(page.jpeg);
      push("\nendstream");
    });
  });
  const total = pageIds.length * 3 + 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id += 1) table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

/* ---------- 내려받기 ---------- */

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/* =========================================================
   저장 화면: 저장 ▾ 메뉴 · 안내 창 · 진행 표시 · 짧은 알림
   ========================================================= */

const CAPTURE_PART_LABELS = {
  "01": "프로필",
  "02": "성능",
  "03": "추천 알고리즘",
  "04": "친밀도",
  "05": "스토리",
  "06": "작중 행적",
  "07": "스킨",
  "08": "인형 관계",
  "09": "대사",
  "10": "기타",
};

// 카카오톡·인스타 등 앱 안에서 열린 브라우저 (파일 내려받기가 막히는 경우가 많음)
const IN_APP_BROWSER = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|Twitter|; wv\)/i.test(
  navigator.userAgent
);
const IN_APP_NOTE =
  '<div class="export-note">앱 안에서 열린 브라우저(카카오톡·인스타그램 등)에서는 파일 저장이 안 될 수 있어요. 안 되면 크롬이나 사파리로 열어 주세요.</div>';

let EXPORT_BUSY = false;

function escHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showToast(message) {
  document.querySelectorAll(".export-toast").forEach((el) => el.remove());
  const toast = document.createElement("div");
  toast.className = "export-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// 안내 창. actions: [{ label, kind("primary"|"danger"|""), value, onClick }] → 누른 버튼의 value (바깥 누르면 null)
function openExportDialog(title, bodyHtml, actions, { locked = false } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "export-backdrop";
  backdrop.innerHTML = `<div class="export-dialog" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
    <h2>${escHtml(title)}</h2>
    <div class="export-body">${bodyHtml}</div>
    ${actions.length ? '<div class="export-actions"></div>' : ""}
  </div>`;
  let resolve;
  const done = new Promise((r) => {
    resolve = r;
  });
  const close = (value) => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    resolve(value);
  };
  const onKey = (event) => {
    if (event.key === "Escape" && !locked) close(null);
  };
  const bar = backdrop.querySelector(".export-actions");
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `header-button ${action.kind || ""}`.trim();
    button.textContent = action.label;
    button.addEventListener("click", () => {
      if (action.onClick) action.onClick(); // 파일 고르기 창처럼 「누른 그 순간」에 해야 하는 일
      close(action.value);
    });
    bar.appendChild(button);
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop && !locked) close(null);
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);
  const first = backdrop.querySelector(".export-actions .primary") || backdrop.querySelector("button");
  if (first) first.focus();
  return { root: backdrop, body: backdrop.querySelector(".export-body"), done, close };
}

// script.js(불러오기 완료 안내)에서도 씀
function showExportNotice(title, paragraphs) {
  return openExportDialog(title, paragraphs.join(""), [{ label: "확인", kind: "primary", value: true }]).done;
}

// 진행 표시 (3/12)
function openProgress(title, total) {
  const dialog = openExportDialog(
    title,
    `<p class="export-progress-text">준비 중…</p><div class="export-progress"><span></span></div>${IN_APP_BROWSER ? IN_APP_NOTE : ""}`,
    [],
    { locked: true }
  );
  const text = dialog.body.querySelector(".export-progress-text");
  const bar = dialog.body.querySelector(".export-progress span");
  return {
    step(done, label, showCount = true) {
      text.textContent = showCount ? `${label} (${done}/${total})` : label;
      bar.style.width = `${Math.round((done / total) * 100)}%`;
    },
    close: () => dialog.close(null),
  };
}

// 다음 그리기 전에 화면이 진행 표시를 그릴 틈을 줌
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

/* ---------- 파일 이름 ---------- */

// 파일 이름 끝 이름: 못 쓰는 글자·공백 빼고 20자까지
function capName(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 20) || "이미지";
}

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  for (let i = 2; ; i += 1) {
    const next = `${name.slice(0, dot)}~${i}${name.slice(dot)}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
}

/* ---------- 결과 안내 ---------- */

function resultNotes(missingSet, lowered) {
  const notes = [];
  if (missingSet.size) {
    notes.push(
      `<div class="export-note">다른 사이트 이미지 ${missingSet.size}개는 그 사이트가 허락하지 않아 「이미지 없음」으로 넣었어요. 그 이미지를 주소 대신 <b>파일로 직접 넣으면</b> 그림에도 들어가요.</div>`
    );
  }
  if (lowered) {
    notes.push('<div class="export-note">이 기기에서는 그림이 너무 커서 일부를 조금 낮은 화질로 저장했어요.</div>');
  }
  return notes.join("");
}

function exportFailed(error) {
  console.error(error);
  showExportNotice("저장하지 못했어요", [
    "<p>그림을 만드는 중에 문제가 생겼어요. 잠시 뒤 다시 해 보거나, 다른 브라우저(크롬·사파리)에서 해 주세요.</p>",
    IN_APP_BROWSER ? IN_APP_NOTE : "",
  ]);
}

/* =========================================================
   티스토리 HTML 복사
   ========================================================= */

async function copyTistoryHtml() {
  const html = getOutputHtml();
  let ok = false;
  try {
    await navigator.clipboard.writeText(html);
    ok = true;
  } catch {
    // 옛 방식으로 한 번 더
    const area = document.createElement("textarea");
    area.value = html;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(area);
    area.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
  }
  if (ok) {
    showToast("티스토리 HTML을 복사했어요");
    return;
  }
  // 둘 다 막힌 경우: 직접 복사할 수 있게 보여 줌
  const dialog = openExportDialog(
    "직접 복사해 주세요",
    '<p>이 브라우저에서는 자동 복사가 막혀 있어요. 아래 칸을 길게 눌러(또는 Ctrl+A) 전부 선택한 뒤 복사해 주세요.</p><textarea class="export-copy-area" readonly style="width:100%;height:180px;margin-top:8px;font-size:11px;"></textarea>',
    [{ label: "닫기", kind: "primary", value: true }]
  );
  const area = dialog.body.querySelector("textarea");
  area.value = html;
  area.focus();
  area.select();
}

/* =========================================================
   작업 저장 / 불러오기 (JSON)
   ========================================================= */

function saveWorkJson() {
  downloadJson();
  const removed = toJsonSaveData().imagesRemoved;
  showToast(removed ? `작업을 저장했어요 (직접 넣은 이미지 ${removed}개는 빠져요)` : "작업을 저장했어요");
}

function askLoadJson() {
  openExportDialog(
    "불러오기",
    "<p>불러오면 지금 쓰고 있는 내용이 파일 내용으로 바뀌어요.</p>" +
      '<div class="export-note">작업 저장(JSON) 파일에는 <b>직접 넣은 이미지가 들어 있지 않아요.</b> 불러온 뒤 비어 있는 이미지 칸에 다시 넣어 주세요. (이미지 주소로 넣은 칸은 그대로예요)</div>',
    [
      { label: "취소", value: null },
      { label: "파일 고르기", kind: "primary", value: true, onClick: () => document.getElementById("loadJsonInput").click() },
    ]
  );
}

/* =========================================================
   이미지 저장 (PNG / 여러 장이면 ZIP)
   ========================================================= */

// 캡처 문서의 저장 단위 목록 (파트 순서 = 문서 순서)
function collectUnits(doc) {
  const units = [...doc.querySelectorAll("[data-capture]")].map((el) => ({
    id: el.dataset.capture,
    part: el.dataset.capPart,
    name: el.dataset.capName,
    el,
  }));
  // 파트 안 순번 (파트에 단위가 하나뿐이면 순번 없음)
  const counts = {};
  units.forEach((u) => {
    counts[u.part] = (counts[u.part] || 0) + 1;
    u.seq = counts[u.part];
  });
  units.forEach((u) => {
    u.seqTag = counts[u.part] > 1 ? `-${String(u.seq).padStart(2, "0")}` : "";
  });
  return units;
}

function unitLabel(unit) {
  const label = CAPTURE_PART_LABELS[unit.part];
  const name = unit.name.replace(/_/g, " · ");
  return name === label ? label : name.replace(new RegExp(`^${label} · `), "");
}

// 고르기 창 → 고른 단위 목록 (취소면 null)
async function pickUnits(units) {
  const parts = [];
  units.forEach((u) => {
    let group = parts.find((p) => p.part === u.part);
    if (!group) {
      group = { part: u.part, units: [] };
      parts.push(group);
    }
    group.units.push(u);
  });
  const tree = parts
    .map((group) => {
      const head = `<label><input type="checkbox" data-pick-part="${group.part}" checked /> ${group.part} ${escHtml(CAPTURE_PART_LABELS[group.part])}</label>`;
      const subs =
        group.units.length > 1
          ? `<div class="export-units">${group.units
              .map(
                (u) =>
                  `<label><input type="checkbox" data-pick-unit="${escHtml(u.id)}" data-of-part="${group.part}" checked /> ${escHtml(unitLabel(u))}</label>`
              )
              .join("")}</div>`
          : `<input type="checkbox" data-pick-unit="${escHtml(group.units[0].id)}" data-of-part="${group.part}" checked hidden />`;
      return `<div class="export-part">${head}${subs}</div>`;
    })
    .join("");
  const dialog = openExportDialog(
    "이미지 저장",
    `<div class="export-scope" role="radiogroup" aria-label="저장 범위">
      <label><input type="radio" name="exportScope" value="all" checked /> 전체</label>
      <label><input type="radio" name="exportScope" value="part" /> 부분</label>
    </div>
    <div class="export-tree" hidden>${tree}</div>
    <p class="export-count"></p>
    <div class="export-note">한 장이면 PNG 그림 파일로, <b>2장 이상이면 ZIP 파일 하나</b>로 묶어서 받아요. ZIP은 눌러서 풀면 그림이 나와요.</div>
    ${IN_APP_BROWSER ? IN_APP_NOTE : ""}`,
    [
      { label: "취소", value: null },
      { label: "저장", kind: "primary", value: "go" },
    ]
  );
  const body = dialog.body;
  const treeEl = body.querySelector(".export-tree");
  const countEl = body.querySelector(".export-count");
  const goButton = dialog.root.querySelector(".export-actions .primary");
  const scope = () => body.querySelector('input[name="exportScope"]:checked').value;
  const chosenIds = () =>
    scope() === "all" ? units.map((u) => u.id) : [...body.querySelectorAll("[data-pick-unit]:checked")].map((el) => el.dataset.pickUnit);
  const refresh = () => {
    treeEl.hidden = scope() !== "part";
    body.querySelectorAll("[data-pick-part]").forEach((box) => {
      const subs = [...body.querySelectorAll(`[data-of-part="${box.dataset.pickPart}"]`)];
      const on = subs.filter((el) => el.checked).length;
      box.checked = on === subs.length;
      box.indeterminate = on > 0 && on < subs.length;
    });
    const n = chosenIds().length;
    countEl.textContent = n === 0 ? "고른 그림이 없어요" : `${n}장 · ${n > 1 ? "ZIP 파일로 받아요" : "PNG 파일로 받아요"}`;
    goButton.disabled = n === 0;
  };
  body.addEventListener("change", (event) => {
    const partBox = event.target.closest("[data-pick-part]");
    if (partBox) {
      body.querySelectorAll(`[data-of-part="${partBox.dataset.pickPart}"]`).forEach((el) => {
        el.checked = partBox.checked;
      });
    }
    refresh();
  });
  refresh();
  const answer = await dialog.done;
  if (answer !== "go") return null;
  const ids = new Set(chosenIds());
  return units.filter((u) => ids.has(u.id));
}

// 한 틀을 PNG 파일(들)로. 너무 길어 이 기기에서 배율 1로도 못 그리면 안전한 경계에서 나눔
async function wrapToPngs(wrap, fileName, report) {
  const W = wrap.offsetWidth;
  const H = wrap.scrollHeight;
  const scale = fitScale(W, H);
  if (scale < CAPTURE_SCALE) report.lowered = true;
  if (canvasFits(Math.ceil(W * scale), Math.ceil(H * scale))) {
    const canvas = await rasterize(wrap, scale);
    const data = await blobBytes(await canvasToBlob(canvas, "image/png"));
    releaseCanvas(canvas);
    return [{ name: fileName(""), data }];
  }
  const maxH = [16000, 12000, 8000, 4000].find((h) => canvasFits(W, h)) || 2000;
  const ranges = sliceRanges(H, safeCutPoints(wrap), maxH);
  const files = [];
  for (let i = 0; i < ranges.length; i += 1) {
    const [y0, h] = ranges[i];
    const canvas = await rasterize(wrap, 1, y0, h);
    files.push({ name: fileName(`-${i + 1}`), data: await blobBytes(await canvasToBlob(canvas, "image/png")) });
    releaseCanvas(canvas);
  }
  return files;
}

async function unitToPngs(unit, doc, report) {
  const prefix = `${exportBaseName()}_${exportDateTag()}_${unit.part}${unit.seqTag}_`;
  const named = (name) => (suffix) => `${prefix}${capName(name)}${suffix}.png`;

  let wrap = stageWrapper(unit.el, doc);
  await prepareImages(wrap, report.missing);

  // 감정 표현: 기본은 한 장, 너무 길면 기본/스킨별 묶음으로 나눔
  const subs = [...unit.el.querySelectorAll("[data-capture-sub]")];
  if (unit.id === "ill-expression" && subs.length > 1 && wrap.scrollHeight > EXPRESSION_SPLIT_HEIGHT) {
    wrap.remove();
    const files = [];
    for (let i = 0; i < subs.length; i += 1) {
      const clone = unit.el.cloneNode(true);
      clone.querySelectorAll("[data-capture-sub]").forEach((el, j) => {
        if (j !== i) el.remove();
      });
      wrap = stageWrapper(clone, doc);
      await prepareImages(wrap, report.missing);
      files.push(...(await wrapToPngs(wrap, named(`${unit.name}-${subs[i].dataset.captureSub}`), report)));
      wrap.remove();
    }
    return files;
  }

  const files = await wrapToPngs(wrap, named(unit.name), report);
  wrap.remove();
  return files;
}

async function exportPng() {
  const doc = buildCaptureDoc("png");
  const units = collectUnits(doc);
  if (!units.length) {
    clearCaptureStage();
    showToast("저장할 내용이 아직 없어요");
    return;
  }
  const chosen = await pickUnits(units);
  if (!chosen) {
    clearCaptureStage();
    return;
  }

  const progress = openProgress("이미지 만드는 중", chosen.length);
  const report = { missing: new Set(), lowered: false };
  const files = [];
  try {
    for (let i = 0; i < chosen.length; i += 1) {
      progress.step(i, `${unitLabel(chosen[i])} 그리는 중`);
      await nextFrame();
      files.push(...(await unitToPngs(chosen[i], doc, report)));
    }
    progress.step(chosen.length, "파일로 묶는 중");
    await nextFrame();
    const used = new Set();
    files.forEach((f) => {
      f.name = uniqueName(f.name, used);
    });
    if (files.length === 1) {
      downloadBlob(new Blob([files[0].data], { type: "image/png" }), files[0].name);
    } else {
      downloadBlob(makeZip(files), `${exportBaseName()}_${exportDateTag()}_이미지.zip`);
    }
  } catch (error) {
    progress.close();
    clearCaptureStage();
    exportFailed(error);
    return;
  }
  progress.close();
  clearCaptureStage();
  const notes = resultNotes(report.missing, report.lowered);
  const summary = files.length === 1 ? "그림 1장을 PNG 파일로 저장했어요." : `그림 ${files.length}장을 ZIP 파일 하나로 저장했어요.`;
  if (notes) showExportNotice("이미지 저장 완료", [`<p>${summary}</p>`, notes]);
  else showToast(summary);
}

/* =========================================================
   PDF 저장 (개인 소장용: 접힌 곳 전부 펼침, 문단마다 한 페이지)
   ========================================================= */

// 이 기기에서 그릴 수 있는 (배율, 한 페이지 최대 높이)
function pdfFit(W, H) {
  for (const scale of [CAPTURE_SCALE, 1.75, 1.5, 1.25, 1]) {
    for (const maxH of [PDF_SLICE_MAX, 12000, 8000, 4000, 2000, 1200]) {
      if (canvasFits(Math.ceil(W * scale), Math.ceil(Math.min(H, maxH) * scale))) return { scale, maxH };
    }
  }
  return { scale: 1, maxH: 2000 };
}

async function exportPdf() {
  const doc = buildCaptureDoc("pdf");
  // 표지(프로필) · 목차 · 문단마다 한 덩어리
  const blocks = [...doc.children].filter((el) => el.tagName !== "STYLE" && el.offsetHeight > 0);
  const progress = openProgress("PDF 만드는 중", blocks.length);
  const report = { missing: new Set(), lowered: false };
  const pages = [];
  try {
    for (let i = 0; i < blocks.length; i += 1) {
      progress.step(i, "페이지 그리는 중");
      await nextFrame();
      const wrap = stageWrapper(blocks[i], doc);
      await prepareImages(wrap, report.missing);
      const W = wrap.offsetWidth;
      const H = wrap.scrollHeight;
      const { scale, maxH } = pdfFit(W, H);
      if (scale < CAPTURE_SCALE) report.lowered = true;
      const ranges = H > maxH ? sliceRanges(H, safeCutPoints(wrap), maxH) : [[0, H]];
      for (const [y0, h] of ranges) {
        const canvas = await rasterize(wrap, scale, y0, h);
        const jpeg = await blobBytes(await canvasToBlob(canvas, "image/jpeg", 0.95));
        pages.push({ jpeg, px: canvas.width, py: canvas.height, w: W * PX_TO_PT, h: h * PX_TO_PT });
        releaseCanvas(canvas);
      }
      wrap.remove();
    }
    progress.step(blocks.length, "PDF로 묶는 중");
    await nextFrame();
    downloadBlob(makePdf(pages), `${exportBaseName()}_${exportDateTag()}.pdf`);
  } catch (error) {
    progress.close();
    clearCaptureStage();
    exportFailed(error);
    return;
  }
  progress.close();
  clearCaptureStage();
  const notes = resultNotes(report.missing, report.lowered);
  if (notes) showExportNotice("PDF 저장 완료", [`<p>PDF(${pages.length}쪽)를 저장했어요.</p>`, notes]);
  else showToast(`PDF(${pages.length}쪽)를 저장했어요`);
}

/* =========================================================
   메뉴 연결: 초기화 / 불러오기 / 저장 ▾
   ========================================================= */

(function wireExportMenu() {
  const menu = document.getElementById("saveMenu");
  const toggle = document.getElementById("saveMenuToggle");
  if (!menu || !toggle) return;
  const setOpen = (open) => {
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  const closeAllMenus = () => {
    setOpen(false);
    const header = document.querySelector(".app-header");
    header.classList.remove("is-menu-open");
    document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!menu.classList.contains("is-open"));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#saveMenu")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  const run = async (kind) => {
    if (EXPORT_BUSY) return;
    EXPORT_BUSY = true;
    try {
      if (kind === "html") await copyTistoryHtml();
      if (kind === "json") saveWorkJson();
      if (kind === "png") await exportPng();
      if (kind === "pdf") await exportPdf();
      if (kind === "xlsx") await exportExcel();
    } catch (error) {
      exportFailed(error);
    } finally {
      EXPORT_BUSY = false;
    }
  };
  document.getElementById("saveList").addEventListener("click", (event) => {
    const item = event.target.closest("[data-export]");
    if (!item) return;
    closeAllMenus();
    run(item.dataset.export);
  });
  document.getElementById("loadJsonButton").addEventListener("click", () => {
    closeAllMenus();
    askLoadJson();
  });
})();
