/* =========================================================
   PNC WIKI Generator — excel.js
   엑셀 저장: 1장 「인형 문서」(위키 문서 모양을 셀로) + 데이터 시트 16장 + 숨긴 「_원본」

   - 문서 구조(문단 번호·노출 조건·계산값)는 renderer.js의 get… 함수를 그대로 씀 → 문서와 항상 같음
   - 배치만 엑셀용: 폭 768px를 32px 칸 24개로 나눈 격자 위에 병합으로 놓음
   - 첫 장 색은 저장할 때의 밝기 테마를 따름 (PNG·PDF와 같은 규칙). 데이터 시트는 무색
   - 기준 앱: 윈도우 엑셀. 다른 앱에서 접기·링크가 안 되면 펼친 채·글자 그대로 보이게 (내용이 숨지 않게)
   - 1단계: 이미지는 자리 표시만 (2단계에서 실제 그림)
   ========================================================= */

const XL_GRID = 24; // 격자 칸 수
const XL_GRID_PX = 32; // 격자 한 칸 폭
const XL_MARGIN_PX = 16; // 왼쪽 여백 열
const XL_FONT = { body: 10.5, small: 9, tiny: 8, h1: 17, h2: 14, h3: 12.5, h4: 11.5, name: 20 };
const XL_ROW_SPLIT_PT = 360; // 긴 글은 이 높이를 넘지 않게 행을 나눔 (엑셀 행 최대 409pt)

/* ---------- 테마 색 ---------- */

function xlTheme() {
  const key = document.documentElement.dataset.theme || "light";
  const pal = typeof PREVIEW_PALETTES !== "undefined" ? PREVIEW_PALETTES[key] : null;
  const pick = (table, hex) => {
    const h = String(hex || "").toLowerCase();
    return (pal && pal[table] && pal[table][h]) || hex;
  };
  return {
    key,
    dark: key === "dark",
    bg: (hex) => pick("bg", hex),
    fg: (hex) => pick("fg", hex),
    line: (hex) => pick("line", hex),
  };
}

/* ---------- 글 → 리치 텍스트 조각 ---------- */

// renderer가 만든 짧은 HTML(span 색·굵게·밑줄·취소선, a 링크, br) → [{ text, font }]
function htmlToRuns(html, base, T) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const runs = [];
  const walk = (node, font) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        if (child.nodeValue) runs.push({ text: child.nodeValue, font });
        return;
      }
      if (child.nodeType !== 1) return;
      if (child.tagName === "BR") {
        runs.push({ text: "\n", font });
        return;
      }
      const st = child.style;
      const next = { ...font };
      if (st && st.color) next.color = T.fg(cssColorHex(st.color));
      if (st && (st.fontWeight === "700" || st.fontWeight === "bold")) next.bold = true;
      if (st && st.textDecoration.includes("underline")) next.underline = true;
      if (st && st.textDecoration.includes("line-through")) next.strike = true;
      if (child.tagName === "A") next.color = T.fg(C.link);
      walk(child, next);
    });
  };
  walk(tpl.content, base);
  // 같은 글꼴이 이어지면 합침
  const out = [];
  runs.forEach((run) => {
    const last = out[out.length - 1];
    if (last && JSON.stringify(last.font) === JSON.stringify(run.font)) last.text += run.text;
    else out.push({ ...run });
  });
  return out;
}

function cssColorHex(value) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || "");
  if (!m) return /^#[0-9a-f]{6}$/i.test(value) ? value : "";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

function htmlToText(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html).replace(/<br\s*\/?>/gi, "\n");
  return tpl.content.textContent;
}

// 표기법 글 → 일반 글 (데이터 시트용)
function markupToText(raw, autoTerms = false) {
  return raw ? htmlToText(renderMarkup(raw, autoTerms)) : "";
}

function runsText(value) {
  if (value && typeof value === "object" && Array.isArray(value.runs)) return value.runs.map((r) => r.text).join("");
  return value == null ? "" : String(value);
}

/* ---------- 글 높이 재기 (병합 칸은 엑셀이 행 높이를 안 맞춰 줌 → 직접 계산) ---------- */

const XL_MEASURE = document.createElement("canvas").getContext("2d");

function xlFontCss(font) {
  const px = ((font && font.size) || XL_FONT.body) * (96 / 72);
  return `${font && font.bold ? "700 " : ""}${px}px "Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
}

// 한 줄(줄바꿈 없음)을 폭에 맞춰 몇 줄로 접히는지
function xlWrapCount(line, widthPx, font) {
  XL_MEASURE.font = xlFontCss(font);
  if (!line) return 1;
  const tokens = line.split(/(\s+)/);
  let lines = 1;
  let cur = 0;
  tokens.forEach((tok) => {
    if (!tok) return;
    const w = XL_MEASURE.measureText(tok).width * 1.08; // 앱마다 글꼴 폭 차이 여유
    if (/^\s+$/.test(tok)) {
      cur += w;
      return;
    }
    if (cur + w <= widthPx) {
      cur += w;
      return;
    }
    if (w <= widthPx) {
      lines += cur > 0 ? 1 : 0;
      cur = w;
      return;
    }
    // 긴 낱말: 글자 단위로
    [...tok].forEach((ch) => {
      const cw = XL_MEASURE.measureText(ch).width * 1.08;
      if (cur + cw > widthPx && cur > 0) {
        lines += 1;
        cur = 0;
      }
      cur += cw;
    });
  });
  return lines;
}

// 칸 값(글 또는 조각) → 필요한 높이(pt)
function xlTextHeight(value, widthPx, font) {
  const runs = value && typeof value === "object" && Array.isArray(value.runs) ? value.runs : [{ text: String(value == null ? "" : value), font }];
  const size = Math.max(...runs.map((r) => (r.font && r.font.size) || (font && font.size) || XL_FONT.body), (font && font.size) || 0);
  const bold = runs.some((r) => r.font && r.font.bold) || (font && font.bold);
  const text = runs.map((r) => r.text).join("");
  const usable = Math.max(20, widthPx - 10);
  const lines = text.split("\n").reduce((n, line) => n + xlWrapCount(line, usable, { size, bold }), 0);
  return lines * size * 1.42 + 6;
}

// 긴 글 → 여러 덩어리 (각 덩어리가 한 행 높이 한도 안에 들어가게). 줄 단위로 나누고, 한 줄이 너무 길면 문장 단위
function xlSplitText(text, widthPx, font) {
  const lines = String(text).split("\n");
  const chunks = [];
  let cur = [];
  const fits = (arr) => xlTextHeight(arr.join("\n"), widthPx, font) <= XL_ROW_SPLIT_PT;
  lines.forEach((line) => {
    if (fits([...cur, line])) {
      cur.push(line);
      return;
    }
    if (cur.length) chunks.push(cur.join("\n"));
    cur = [];
    if (fits([line])) {
      cur = [line];
      return;
    }
    // 한 줄이 너무 김 → 문장(또는 글자) 단위로 이어 붙이며 자름
    const pieces = line.match(/[^.!?。！？…]+[.!?。！？…]*\s*/g) || [line];
    let part = "";
    pieces.forEach((piece) => {
      if (fits([part + piece])) {
        part += piece;
        return;
      }
      if (part) chunks.push(part);
      part = "";
      if (fits([piece])) {
        part = piece;
        return;
      }
      let acc = "";
      [...piece].forEach((ch) => {
        if (!fits([acc + ch])) {
          chunks.push(acc);
          acc = "";
        }
        acc += ch;
      });
      part = acc;
    });
    if (part) cur = [part];
  });
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks.length ? chunks : [""];
}

// 조각 목록도 줄 단위로 나눔 (줄바꿈 기준, 글꼴 유지)
function xlSplitRuns(runs, widthPx, font) {
  const plain = runs.map((r) => r.text).join("");
  if (xlTextHeight({ runs }, widthPx, font) <= XL_ROW_SPLIT_PT) return [runs];
  const chunks = xlSplitText(plain, widthPx, font);
  // 글자 위치로 조각을 다시 자름
  const out = [];
  let pos = 0;
  chunks.forEach((chunk) => {
    const start = plain.indexOf(chunk, pos);
    const end = start + chunk.length;
    pos = end;
    const piece = [];
    let at = 0;
    runs.forEach((r) => {
      const a = Math.max(start, at);
      const b = Math.min(end, at + r.text.length);
      if (b > a) piece.push({ text: r.text.slice(a - at, b - at), font: r.font });
      at += r.text.length;
    });
    out.push(piece.length ? piece : [{ text: chunk, font }]);
  });
  return out;
}

/* ---------- 이미지 (2단계) ---------- */
// 만들기는 두 번: ① collect = 배치만 돌려서 필요한 이미지 주소 모으기 → 불러오기 → ② place = 실제 크기로 배치·그림 넣기
// 같은 그림·같은 크기는 파일 하나만. 아이콘 배지(어두운 바탕·둥근 모서리)·선물 상자·감정 표현 테두리·재생 표시는 그림에 직접 그려 넣음

const XL_IMG = { mode: "place", srcs: new Set(), info: new Map(), missing: new Set(), book: null };
const XL_IMG_PAD = 8; // 그림 위아래 여백 (px)
const XL_ROW_MAX_PX = 520; // 그림 행 하나 최대 높이 (px, 409pt 아래)

function xlSpecSrcs(spec) {
  return [spec.src, ...(spec.layers || [])].filter(Boolean);
}

// 표시 크기 (bounds 안에 비율 유지, 원본보다 크게 늘리지 않음). fixed = 정해진 크기 그대로 (배지)
// 쓸 수 없는 이미지면 null
function xlFit(spec, bounds, fixed = false) {
  const srcs = xlSpecSrcs(spec);
  if (!srcs.length) return null;
  if (XL_IMG.mode === "collect") {
    srcs.forEach((s) => XL_IMG.srcs.add(s));
    return fixed ? { w: bounds.w, h: bounds.h } : { w: bounds.w, h: Math.min(bounds.h, Math.round(bounds.w * 0.6)) };
  }
  const main = XL_IMG.info.get(srcs[0]);
  if (!main) {
    XL_IMG.missing.add(srcs[0]);
    return null;
  }
  if (fixed) return { w: bounds.w, h: bounds.h };
  const scale = Math.min(1, bounds.w / main.w, bounds.h / main.h);
  return { w: Math.max(1, Math.round(main.w * scale)), h: Math.max(1, Math.round(main.h * scale)) };
}

function xlRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function xlHasAlpha(img) {
  if (img.alpha != null) return img.alpha;
  try {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext("2d");
    ctx.drawImage(img.el, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let alpha = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) alpha = true;
    img.alpha = alpha;
  } catch {
    img.alpha = true;
  }
  return img.alpha;
}

function xlDataUrlBytes(url) {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// 그림 파일 만들기 (표시 크기 ×2) → 책의 그림 번호
function xlMedia(spec, w, h) {
  const key = `${JSON.stringify(spec)}|${w}x${h}`;
  if (XL_IMG.book.mediaKeys.has(key)) return XL_IMG.book.mediaKeys.get(key);
  const S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * S));
  canvas.height = Math.max(1, Math.round(h * S));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const W = canvas.width;
  const H = canvas.height;
  const radius = (spec.radius || 0) * S;
  if (spec.bg) {
    ctx.fillStyle = spec.bg;
    xlRoundRect(ctx, 0, 0, W, H, radius);
    ctx.fill();
  }
  const bw = spec.border ? spec.border.width * S : 0;
  if (spec.border) {
    ctx.lineWidth = bw;
    ctx.strokeStyle = spec.border.color;
    xlRoundRect(ctx, bw / 2, bw / 2, W - bw, H - bw, Math.max(0, radius - bw / 2));
    ctx.stroke();
  }
  const pad = (spec.pad || 0) * S + bw;
  const layers = xlSpecSrcs(spec)
    .map((src) => XL_IMG.info.get(src))
    .filter(Boolean);
  layers.forEach((img) => {
    const aw = W - pad * 2;
    const ah = H - pad * 2;
    const sc = Math.min(aw / img.w, ah / img.h);
    const dw = img.w * sc;
    const dh = img.h * sc;
    ctx.drawImage(img.el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  });
  if (spec.play) {
    const pw = Math.min(68 * S, W * 0.22);
    const ph = pw * (48 / 68);
    ctx.fillStyle = "#ff0000";
    xlRoundRect(ctx, (W - pw) / 2, (H - ph) / 2, pw, ph, ph * 0.25);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(W / 2 - pw * 0.12, H / 2 - ph * 0.22);
    ctx.lineTo(W / 2 + pw * 0.16, H / 2);
    ctx.lineTo(W / 2 - pw * 0.12, H / 2 + ph * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  const photo = !spec.bg && !spec.border && !spec.radius && layers.length === 1 && w * h > 40000 && !xlHasAlpha(layers[0]);
  const url = photo ? canvas.toDataURL("image/jpeg", 0.88) : canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return XL_IMG.book.addMedia(key, xlDataUrlBytes(url), photo ? "jpeg" : "png");
}

// 이미지 불러오기 (PNG 저장과 같은 방식: 같은 사이트 에셋 우선, 다른 사이트는 허락할 때만)
async function xlLoadImages(srcs, onStep) {
  let i = 0;
  for (const src of srcs) {
    i += 1;
    if (onStep) onStep(i);
    if (XL_IMG.info.has(src)) continue;
    let info = null;
    try {
      const data = await imageToDataUrl(src);
      if (data) {
        const el = await loadImage(data);
        const w = el.naturalWidth || el.width || 0;
        const h = el.naturalHeight || el.height || 0;
        if (w && h) info = { el, w, h };
        else if (/svg/i.test(data.slice(0, 30))) info = { el, w: 300, h: 200 }; // 크기 없는 SVG
      }
    } catch {
      info = null;
    }
    XL_IMG.info.set(src, info);
  }
}

/* =========================================================
   1장: 인형 문서
   ========================================================= */

class XlDoc {
  constructor(sheet, T) {
    this.sheet = sheet;
    this.T = T;
    this.r = 2;
    this.bg = T.bg(C.white);
  }

  // 격자 칸 번호(1~24) → 시트 열
  col(g) {
    return g + 1;
  }

  font(f = {}) {
    return { size: XL_FONT.body, color: this.T.fg(C.text), ...f };
  }

  side(color, style = "thin") {
    return { style, color: this.T.line(color) };
  }

  all(color, style = "thin") {
    const s = this.side(color, style);
    return { left: s, right: s, top: s, bottom: s };
  }

  // 한 행에 칸들 놓기. cells: [{ g1, g2, value, style, fill, font, align, border, minH }]
  // 높이: 지정(height) 또는 글 길이로 계산
  line(cells, opts = {}) {
    const r = this.r;
    let need = opts.min || 0;
    cells.forEach((cell) => {
      const style = {
        fill: cell.fill || this.bg,
        font: this.font(cell.font),
        align: { v: "center", wrap: true, ...(cell.align && cell.align.indent && !cell.align.h ? { h: "left" } : {}), ...(cell.align || {}) },
        border: cell.border,
      };
      this.sheet.mergeSet(r, this.col(cell.g1), r, this.col(cell.g2), cell.value == null ? null : cell.value, style);
      if (cell.link) this.sheet.link(r, this.col(cell.g1), cell.link);
      if (opts.height == null && cell.value != null && cell.value !== "") {
        const width = (cell.g2 - cell.g1 + 1) * XL_GRID_PX - ((cell.align && cell.align.indent) || 0) * 9;
        need = Math.max(need, xlTextHeight(cell.value, width, style.font) + (cell.pad || 0));
      }
    });
    const h = opts.height != null ? opts.height : Math.max(need, opts.min || 15);
    this.sheet.height(r, h);
    this.r += 1;
    return r;
  }

  gap(pt = 8) {
    this.sheet.height(this.r, pt);
    this.r += 1;
  }

  // 긴 글을 여러 행으로 (같은 칸 범위). 반환: [첫 행, 끝 행]
  paragraph(g1, g2, value, cellOpts = {}) {
    const font = this.font(cellOpts.font);
    const width = (g2 - g1 + 1) * XL_GRID_PX - ((cellOpts.align && cellOpts.align.indent) || 0) * 9;
    const pieces =
      value && typeof value === "object" && Array.isArray(value.runs)
        ? xlSplitRuns(value.runs, width, font).map((runs) => ({ runs }))
        : xlSplitText(String(value == null ? "" : value), width, font);
    const first = this.r;
    pieces.forEach((piece) => this.line([{ g1, g2, value: piece, ...cellOpts, pad: (cellOpts.pad || 0) + 4 }], { min: cellOpts.minH || 18 }));
    return [first, this.r - 1];
  }

  box(r1, g1, r2, g2, color, style = "thin") {
    // 빈 행(간격)에도 바탕색 칸을 먼저 만들어 둠 → 테두리만 있는 흰 칸이 생기지 않게
    for (let r = r1; r <= r2; r += 1) {
      for (let c = this.col(g1); c <= this.col(g2); c += 1) if (!this.sheet.get(r, c)) this.sheet.set(r, c, null, { fill: this.bg });
    }
    this.sheet.box(r1, this.col(g1), r2, this.col(g2), this.side(color, style));
  }

  // 여러 행에 걸친 상자 테두리를 새로 정함 (안쪽 가로선은 지우고, divider(r)가 주는 선만 위쪽에)
  frame(r1, g1, r2, g2, sides, divider = () => undefined) {
    for (let r = r1; r <= r2; r += 1) {
      for (let c = this.col(g1); c <= this.col(g2); c += 1) {
        const cell = this.sheet.get(r, c) || this.sheet.set(r, c, null, { fill: this.bg });
        const border = { ...((cell.s && cell.s.border) || {}) };
        border.top = r === r1 ? sides.top : divider(r);
        border.bottom = r === r2 ? sides.bottom : undefined;
        if (c === this.col(g1)) border.left = sides.left;
        if (c === this.col(g2)) border.right = sides.right;
        cell.s = { ...(cell.s || {}), border };
      }
    }
  }

  // 문단 제목 (▼ 번호. 제목) + 밑줄
  heading(number, title, depth, anchor, extraRuns = null) {
    const size = depth === 0 ? XL_FONT.h1 : [XL_FONT.h2, XL_FONT.h2, XL_FONT.h3, XL_FONT.h4][Math.min(depth, 3)];
    const runs = [
      { text: "▼ ", font: this.font({ size: size * 0.6, color: this.T.fg(C.subText) }) },
      { text: `${number}. `, font: this.font({ size, bold: true, color: this.T.fg(C.orange) }) },
      ...(extraRuns || [{ text: title, font: this.font({ size, bold: true }) }]),
    ];
    const r = this.line([{ g1: 1, g2: XL_GRID, value: { runs }, align: { v: "bottom" }, border: { bottom: this.side(C.rule) } }], {
      height: size * 1.7 + 6,
    });
    if (anchor) this.sheet.anchor(anchor, r);
    this.gap(depth === 0 ? 8 : 6);
    return r;
  }

  // 그림 놓기 (이미 쓴 행 r1~r2, 격자 g1~g2 안). align: center | left, valign: center | top | bottom
  placeIn(r1, r2, g1, g2, spec, size, opts = {}) {
    if (!size || XL_IMG.mode === "collect") return;
    const areaW = (g2 - g1 + 1) * XL_GRID_PX;
    let areaH = 0;
    for (let r = r1; r <= r2; r += 1) areaH += this.sheet.rowPx(r);
    const x = opts.x != null ? opts.x : opts.align === "left" ? 4 : Math.max(0, (areaW - size.w) / 2);
    const y = opts.y != null ? opts.y : opts.valign === "top" ? 6 : opts.valign === "bottom" ? Math.max(0, areaH - size.h - 6) : Math.max(0, (areaH - size.h) / 2);
    const media = xlMedia(spec, size.w, size.h);
    this.sheet.picture(r1, this.col(g1), x, y, size.w, size.h, media, opts.name || "");
  }

  // 그림 한 장을 위한 행(들)을 새로 만들고 놓기. 못 쓰는 이미지면 「이미지 없음」 칸
  pictureBlock(g1, g2, src, bounds, opts = {}) {
    const T = this.T;
    if (!src) return null;
    const spec = { src, ...(opts.spec || {}) };
    const size = xlFit(spec, bounds, opts.fixed);
    const fill = opts.fill || this.bg;
    if (!size) {
      const link = /^https?:/i.test(src) ? { url: src } : null;
      this.line([{ g1, g2, value: "이미지 없음 (다른 사이트가 허락하지 않은 이미지)", fill: T.bg(C.soft), font: { size: XL_FONT.small, color: T.fg(C.subText) }, align: { h: "center" }, link }], { height: 36 });
      return null;
    }
    let total = size.h + XL_IMG_PAD * 2;
    const r1 = this.r;
    while (total > 0) {
      const px = Math.min(total, XL_ROW_MAX_PX);
      this.line([{ g1, g2, value: null, fill }], { height: px * 0.75 });
      total -= px;
    }
    this.placeIn(r1, this.r - 1, g1, g2, spec, size, { align: opts.align, y: XL_IMG_PAD, name: opts.name });
    return size;
  }
}

/* ---------- 문서 조각 ---------- */

function xlTopCard(d, state) {
  const T = d.T;
  const p = state.profile;
  const top = d.r;
  d.line([{ g1: 1, g2: XL_GRID, value: textOrDash(p.name), fill: T.bg(C.cardHead), font: { size: XL_FONT.name, bold: true }, align: { h: "center" } }], { height: 36 });
  const names = NAME_LANGS.map((lang) => textOrDash(p.names[lang.key])).join(" / ");
  d.line([{ g1: 1, g2: XL_GRID, value: names, fill: T.bg(C.cardHead), font: { size: XL_FONT.small, color: T.fg(C.subText) }, align: { h: "center", v: "top" } }], { height: 20 });
  const src = (key) => getImageSrc(getSkinBase(state, key).image);
  const empty = "이미지 업로드 예정";
  const caption = (g1, g2, text, extra = {}) => ({ g1, g2, value: text, fill: T.bg(C.cardHead), font: { bold: true }, align: { h: "center" }, border: { top: d.side(C.border), ...extra } });
  // 칸 글: 이미지가 있으면 비움(그림이 들어감), 못 쓰면 「이미지 없음」, 없으면 「이미지 업로드 예정」
  const slotCell = (g1, g2, key, size, border) => {
    const has = Boolean(src(key));
    const text = !has ? empty : size ? null : "이미지 없음";
    return { g1, g2, value: text, fill: T.bg(C.soft), font: { size: has ? XL_FONT.small : 13, bold: !has, color: T.fg(C.subText) }, align: { h: "center" }, border, link: has && !size && /^https?:/i.test(src(key)) ? { url: src(key) } : null };
  };
  const fit = (key, bounds) => (src(key) ? xlFit({ src: src(key) }, bounds) : null);
  const sb = fit("basic", { w: 368, h: 500 });
  const se = fit("extended", { w: 368, h: 500 });
  const sp = fit("perfect", { w: 752, h: 520 });
  const hA = Math.max(160, ...(sb ? [sb.h + 16] : []), ...(se ? [se.h + 16] : []));
  const rA = d.line([slotCell(1, 12, "basic", sb, { right: d.side(C.border), top: d.side(C.border) }), slotCell(13, 24, "extended", se, { top: d.side(C.border) })], { height: Math.min(hA, XL_ROW_MAX_PX) * 0.75 });
  d.line([caption(1, 12, "기본 투영"), caption(13, 24, "확장 투영", { left: d.side(C.border) })], { height: 24 });
  const hP = Math.max(186, ...(sp ? [sp.h + 16] : []));
  const rP = d.line([slotCell(1, XL_GRID, "perfect", sp, { top: d.side(C.border) })], { height: Math.min(hP, XL_ROW_MAX_PX) * 0.75 });
  d.line([caption(1, XL_GRID, "완벽 투영")], { height: 24 });
  d.placeIn(rA, rA, 1, 12, { src: src("basic") }, sb, { name: "기본 투영" });
  d.placeIn(rA, rA, 13, 24, { src: src("extended") }, se, { name: "확장 투영" });
  d.placeIn(rP, rP, 1, XL_GRID, { src: src("perfect") }, sp, { name: "완벽 투영" });
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
}

function xlInfo(d, state) {
  const T = d.T;
  const p = state.profile;
  const top = d.r;
  const label = (g1, g2, text) => ({ g1, g2, value: text, fill: T.bg(C.infoLabel), font: { bold: true, color: C.white }, align: { h: "center" }, border: d.all(C.infoLine) });
  const value = (g1, g2, v, v2 = "center") => ({ g1, g2, value: v, fill: T.bg(C.white), font: { color: T.fg(C.infoText) }, align: { h: "center", v: v2 }, border: d.all(C.infoLine) });
  const accent = (text) => (text ? { runs: [{ text, font: d.font({ color: T.fg(C.orange) }) }] } : "-");
  const positions = p.positions.filter((key) => getItem("position", key));
  const classText = [getLabel("class", p.class), positions.map((key) => getLabel("position", key)).join(" · ")].filter(Boolean).join(" | ") || "-";
  const companyItem = getItem("company", p.company);
  const company = companyItem ? getFullLabel("company", p.company) : "-";
  const voiceName = String(p.voiceActor.name || "").trim();
  const voiceCountry = getLabel("country", p.voiceActor.country);
  const voice = voiceName
    ? { runs: [...(voiceCountry ? [{ text: `(${voiceCountry}) `, font: d.font({ size: XL_FONT.small, color: T.fg(C.subText) }) }] : []), { text: voiceName, font: d.font({ color: T.fg(C.orange) }) }] }
    : "-";
  // 클래스·포지션 아이콘 (어두운 둥근 배지) / 기업 로고 (기업 색 바탕)
  const ICON = 40;
  const iconSpec = (src) => ({ src, bg: C.infoIconBg, radius: 6, pad: 4 });
  const icons = [getIconUrl("class", p.class), ...positions.map((key) => getIconUrl("position", key))].filter(Boolean);
  const iconSizes = icons.map((src) => xlFit(iconSpec(src), { w: ICON, h: ICON }, true));
  const logoSrc = companyItem ? getIconUrl("company", p.company) : "";
  const logoSpec = { src: logoSrc, bg: companyItem && companyItem.color ? companyItem.color : C.infoLabel, radius: 6, pad: 2 };
  const logo = logoSrc ? xlFit(logoSpec, { w: 56, h: 56 }, true) : null;
  const anyIcon = iconSizes.some(Boolean) || logo;
  const r1 = d.line([label(1, 5, "클래스"), value(6, 12, classText, anyIcon ? "bottom" : "center"), label(13, 17, "기업"), value(18, 24, company, anyIcon ? "bottom" : "center")], {
    min: anyIcon ? (logo ? 98 : 80) * 0.75 : 30,
  });
  // 아이콘 여러 개는 가운데로 모아서 한 줄
  const shown = icons.map((src, i) => ({ src, size: iconSizes[i] })).filter((x) => x.size);
  const gap = 4;
  const totalW = shown.reduce((n, x) => n + x.size.w, 0) + gap * Math.max(0, shown.length - 1);
  let x = Math.max(0, (7 * XL_GRID_PX - totalW) / 2);
  shown.forEach((it) => {
    d.placeIn(r1, r1, 6, 12, iconSpec(it.src), it.size, { x, y: 6, name: "아이콘" });
    x += it.size.w + gap;
  });
  if (logo) d.placeIn(r1, r1, 18, 24, logoSpec, logo, { valign: "top", name: "기업" });
  [
    ["레어도", p.rarity ? `★${p.rarity}` : "-", "모델명", textOrDash(p.model)],
    ["직업", textOrDash(p.job), "생일", textOrDash(formatBirthday(p.birthday))],
    ["성우", voice, "일러스트", accent(String(p.illustrator || "").trim())],
  ].forEach(([l1, v1, l2, v2]) => d.line([label(1, 5, l1), value(6, 12, v1), label(13, 17, l2), value(18, 24, v2)], { min: 22 }));
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
}

function xlToc(d, sections) {
  const T = d.T;
  const items = [];
  const walk = (nodes) =>
    nodes.forEach((node) => {
      items.push({ text: `${node.number}. ${node.title}`, depth: node.depth, anchor: node.anchor });
      walk(node.children);
    });
  sections.forEach((s) => {
    items.push({ text: `${s.number}. ${s.title}`, depth: 0, anchor: sectionAnchor(s.key) });
    walk(s.subs);
  });
  XL_MEASURE.font = xlFontCss({ size: XL_FONT.body, bold: true });
  const widest = Math.max(160, ...items.map((it) => XL_MEASURE.measureText(it.text).width * 1.1 + it.depth * 18 + 30));
  const g2 = Math.min(XL_GRID, Math.max(8, Math.ceil(widest / XL_GRID_PX)));
  const top = d.r;
  d.line([{ g1: 1, g2, value: "목차", fill: T.bg(C.soft), font: { size: 13, bold: true }, align: { indent: 1 }, border: { bottom: d.side(C.border) } }], { height: 30 });
  items.forEach((it, i) =>
    d.line(
      [
        {
          g1: 1,
          g2,
          value: it.text,
          font: { bold: true, color: T.fg(C.orange), underline: false },
          align: { indent: 1 + it.depth * 2, wrap: false },
          link: { anchor: it.anchor },
        },
      ],
      { height: i === items.length - 1 ? 22 : 18 }
    )
  );
  d.box(top, 1, d.r - 1, g2, C.border);
}

/* 1. 개요 */
function xlOverview(d, state) {
  const T = d.T;
  const ov = isObj(state.overview) ? state.overview : {};
  const image = getImageSrc(ov.image);
  const vid = youtubeId(ov.video);
  if (image) {
    d.pictureBlock(1, 20, image, { w: 640, h: 560 }, { align: "left", name: "개요 이미지" });
    d.gap(8);
  } else if (vid) {
    const url = `https://www.youtube.com/watch?v=${vid}`;
    // 썸네일 + 재생 표시 (못 불러오면 링크 줄만)
    const thumb = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    const size = xlFit({ src: thumb, play: true }, { w: 480, h: 360 });
    if (size) d.pictureBlock(1, 20, thumb, { w: 480, h: 360 }, { align: "left", spec: { play: true }, name: "동영상" });
    else XL_IMG.missing.delete(thumb);
    d.line([{ g1: 1, g2: 20, value: { runs: [{ text: "▶ 동영상 보기 ", font: d.font({ bold: true, color: "#ff3b3b" }) }, { text: url, font: d.font({ size: XL_FONT.small, color: T.fg(C.link), underline: true }) }] }, link: { url } }], { height: 22 });
    d.gap(8);
  }
  const quote = typeof ov.quote === "string" ? ov.quote.trim() : "";
  if (quote) {
    const [a, b] = d.paragraph(1, 22, `“${quote}”`, { fill: T.bg(C.soft), align: { indent: 1, v: "center" } });
    const dash = d.side(C.rule, "dashed");
    d.frame(a, 1, b, 22, { top: dash, bottom: dash, right: dash, left: d.side(C.quoteBar, "thick") });
    d.gap(8);
  }
  d.line([
    {
      g1: 1,
      g2: XL_GRID,
      value: {
        runs: [
          { text: "모바일 게임 ", font: d.font() },
          { text: "뉴럴 클라우드", font: d.font({ bold: true, color: T.fg(C.orange) }) },
          { text: "에 등장하는 인형.", font: d.font() },
        ],
      },
      align: { wrap: false },
    },
  ]);
}

/* 2. 프로필 */
function xlProfile(d, state) {
  const T = d.T;
  const p = state.profile;
  const top = d.r;
  d.line(
    [
      { g1: 1, g2: 15, value: "피험 인형 프로필", fill: T.bg(C.cardHead), font: { size: 12, bold: true }, align: { indent: 1 } },
      { g1: 16, g2: 24, value: "PROJECT.NEURAL.CLOUD", fill: T.bg(C.cardHead), font: { size: XL_FONT.small, bold: true }, align: { h: "right", indent: 1 } },
    ],
    { height: 30 }
  );
  d.gap(8);
  const item = (g1, label, value) => [
    { g1, g2: g1 + 2, value: label, fill: T.bg(C.label), font: { bold: true }, align: { h: "center" } },
    { g1: g1 + 3, g2: g1 + 10, value, align: { indent: 1 }, border: { top: d.side(C.border), bottom: d.side(C.border), right: d.side(C.border) } },
  ];
  const withKey = (cat, key) => textOrDash(getLabel(cat, key));
  [
    ["이름", textOrDash(p.name), "직업", textOrDash(p.job)],
    ["모델", textOrDash(p.model), "기업", withKey("company", p.company)],
    ["생일", textOrDash(formatBirthday(p.birthday)), "클래스", withKey("class", p.class)],
  ].forEach(([l1, v1, l2, v2], i) => {
    d.line([...item(2, l1, v1), ...item(14, l2, v2)], { min: 24 });
    if (i < 2) d.gap(5);
  });
  d.gap(10);
  d.line([{ g1: 2, g2: 23, value: "이력", fill: T.bg(C.label), font: { bold: true }, align: { indent: 1 } }], { height: 24 });
  d.paragraph(2, 23, textOrDash(p.history), { fill: T.bg(C.soft), align: { indent: 1 } });
  d.gap(10);
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
}

/* 3. 성능 */
function xlStatTable(d, table) {
  const T = d.T;
  const n = table.stages.length;
  const spans = [];
  let g = 9;
  table.stages.forEach((_, i) => {
    const w = Math.floor(16 / n) + (i < 16 % n ? 1 : 0);
    spans.push([g, g + w - 1]);
    g += w;
  });
  const top = d.r;
  const head = (g1, g2, text) => ({ g1, g2, value: text, fill: T.bg(C.tableHead), font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) });
  d.line([head(1, 8, "능력치"), ...table.stages.map((st, i) => head(spans[i][0], spans[i][1], st.label))], { min: 22 });
  GAME_DATA.statRows.forEach((row) => {
    const label = GAME_DATA.attribute[row.key].label;
    const spec = { src: getIconUrl("attribute", row.key), bg: C.infoIconBg, radius: 4, pad: 2 };
    const icon = spec.src ? xlFit(spec, { w: 20, h: 20 }, true) : null;
    const r = d.line(
      [
        { g1: 1, g2: 8, value: label, font: { bold: true, color: T.fg(C.infoText) }, align: { indent: icon ? 3 : 1 }, border: d.all(C.infoLine) },
        ...table.stages.map((st, i) => {
          const v = st.cells[row.key];
          const text = v ? v + (row.unit && !v.endsWith(row.unit) ? row.unit : "") : "";
          return { g1: spans[i][0], g2: spans[i][1], value: text, font: { color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) };
        }),
      ],
      { min: 21 }
    );
    d.placeIn(r, r, 1, 8, spec, icon, { x: 6, name: label });
  });
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
  d.gap(12);
}

function xlMarkRuns(d, raw, autoTerms, font = {}) {
  return { runs: htmlToRuns(renderMarkup(raw, autoTerms), d.font({ color: d.T.fg(C.infoText), ...font }), d.T) };
}

// 스킬·각인돌파 카드 몸통: 왼쪽 아이콘 칸 + 오른쪽 줄들. rows: [{ value, badge, badgeColor }]
function xlCardBody(d, iconSrc, rows) {
  const T = d.T;
  const useIcon = iconSrc !== undefined;
  const g1 = useIcon ? 4 : 1;
  const first = d.r;
  rows.forEach((row) => {
    const cells = [];
    if (useIcon) cells.push({ g1: 1, g2: 3, value: null, fill: T.bg(C.soft) });
    const bottom = { bottom: d.side(C.infoLine) };
    if (row.badge) {
      cells.push({ g1, g2: g1 + 1, value: row.badge, fill: row.badgeColor, font: { size: XL_FONT.small, bold: true, color: C.white }, align: { h: "center" }, border: bottom });
      cells.push({ g1: g1 + 2, g2: XL_GRID, value: row.value, align: { indent: 1 }, border: bottom });
    } else {
      cells.push({ g1, g2: XL_GRID, value: row.value, align: { indent: 1, h: row.h }, border: bottom, font: row.font });
    }
    d.line(cells, { min: row.min || 22 });
  });
  if (useIcon && d.r - 1 >= first) {
    // 아이콘 칸 세로 병합 (1단계: 아이콘 자리만)
    const r1 = first;
    const r2 = d.r - 1;
    for (let r = r1; r <= r2; r += 1) for (let c = d.col(1); c <= d.col(3); c += 1) d.sheet.get(r, c).v = null;
    // 행마다 병합해 둔 1~3칸을 행 묶음 하나로 다시 병합
    const prefix = new Set();
    for (let r = r1; r <= r2; r += 1) prefix.add(`${cellRef(r, d.col(1))}:${cellRef(r, d.col(3))}`);
    d.sheet.merges = d.sheet.merges.filter((m) => !prefix.has(m));
    const spec = { src: iconSrc };
    const size = iconSrc ? xlFit(spec, { w: 64, h: 64 }) : null;
    d.sheet.mergeSet(r1, d.col(1), r2, d.col(3), iconSrc && !size ? "이미지 없음" : null, {
      fill: T.bg(C.soft),
      font: d.font({ size: XL_FONT.small, color: T.fg(C.subText) }),
      align: { h: "center", v: "center" },
      border: { right: d.side(C.infoLine) },
    });
    // 아이콘이 들어갈 만큼 행 높이 확보
    let h = 0;
    for (let r = r1; r <= r2; r += 1) h += d.sheet.rowPx(r);
    if (size && h < size.h + 16) d.sheet.height(r2, (d.sheet.rowPx(r2) + size.h + 16 - h) * 0.75);
    d.placeIn(r1, r2, 1, 3, spec, size, { name: "아이콘" });
  }
}

function xlSkillCard(d, card) {
  const T = d.T;
  const top = d.r;
  const nameRuns = htmlToRuns(renderMarkup(card.name, false), d.font({ bold: true, color: T.fg(C.infoText) }), T);
  if (card.cooldown) nameRuns.push({ text: ` (쿨타임 ${card.cooldown}초)`, font: d.font({ color: T.fg(C.infoText) }) });
  const rows = [{ badge: card.slot.label, badgeColor: card.slot.color, value: { runs: nameRuns } }];
  if (card.desc) xlSplitRuns(xlMarkRuns(d, card.desc, true).runs, 20 * XL_GRID_PX, d.font()).forEach((runs) => rows.push({ value: { runs } }));
  const pre = prechargeText(card.precharge);
  if (pre) rows.push({ value: pre, font: { color: T.fg(C.infoText) } });
  if (card.cutscene) rows.push({ value: "[ 궁극기 컷씬 ]", font: { bold: true, color: T.fg(C.infoText) } });
  xlCardBody(d, card.icon || "", rows);
  if (card.cutscene) d.pictureBlock(1, XL_GRID, card.cutscene, { w: 720, h: 420 }, { name: "궁극기 컷씬" });
  if (card.levels.length) {
    // [ 모든 레벨 효과 ] = 요약 줄 (보임), 그 아래 레벨 표 = 접힌 묶음
    d.line([{ g1: 1, g2: XL_GRID, value: "[ 모든 레벨 효과 ]  (왼쪽 + 를 누르면 펼쳐져요)", font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" } }], { height: 22 });
    const g1 = d.r;
    const head = (a, b, text) => ({ g1: a, g2: b, value: text, fill: T.bg(C.tableHead), font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) });
    d.line([head(1, 2, "레벨"), head(3, XL_GRID, "효과")], { min: 20 });
    card.levels.forEach((line, i) =>
      d.line(
        [
          { g1: 1, g2: 2, value: i + 1, font: { color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) },
          { g1: 3, g2: XL_GRID, value: line ? xlMarkRuns(d, line, true) : "", align: { indent: 1 }, border: d.all(C.infoLine) },
        ],
        { min: 20 }
      )
    );
    d.sheet.group(g1, d.r - 1, true);
  }
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
  d.gap(10);
}

function xlEngraving(d, state, group) {
  const T = d.T;
  const eng = getEngraving(state);
  if (!eng) return;
  d.heading(group.number, group.title, group.depth, group.anchor);
  if (eng.image || eng.name || eng.quote) {
    const top = d.r;
    if (eng.image) d.pictureBlock(1, XL_GRID, eng.image, { w: 740, h: 440 }, { fill: T.bg(C.soft), name: "무장각인" });
    if (eng.name) d.line([{ g1: 1, g2: XL_GRID, value: eng.name, fill: T.bg(C.algoHead), font: { size: 12, bold: true, color: C.white }, align: { h: "center" } }], { min: 26 });
    if (eng.quote) d.paragraph(1, XL_GRID, eng.quote, { font: { color: T.fg(C.infoText) }, align: { h: "center" } });
    d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
    d.gap(12);
  }
  let i = 0;
  if (eng.breakthroughs.length) {
    const node = group.children[i++];
    d.heading(node.number, node.title, node.depth, node.anchor);
    eng.breakthroughs.forEach((bt) => {
      const top = d.r;
      d.line([{ g1: 1, g2: XL_GRID, value: `각인돌파 ${bt.stage}`, fill: T.bg(C.tableHead), font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: { bottom: d.side(C.infoLine) } }], { min: 22 });
      const rows = [];
      const nameRuns = htmlToRuns(renderMarkup(bt.name, false), d.font({ bold: true, color: T.fg(C.infoText) }), T);
      if (bt.name || bt.slot) rows.push(bt.slot ? { badge: bt.slot.label, badgeColor: bt.slot.color, value: { runs: nameRuns } } : { value: { runs: nameRuns } });
      if (bt.desc) xlSplitRuns(xlMarkRuns(d, bt.desc, true).runs, 20 * XL_GRID_PX, d.font()).forEach((runs) => rows.push({ value: { runs } }));
      xlCardBody(d, bt.icon ? bt.icon : undefined, rows);
      d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
      d.gap(10);
    });
  }
  if (eng.totals) {
    const node = group.children[i++];
    d.heading(node.number, node.title, node.depth, node.anchor);
    const keys = GAME_DATA.engravingRows;
    const top = d.r;
    const span = (k) => [4 + k * 3, 6 + k * 3];
    const head = (a, b, text) => ({ g1: a, g2: b, value: text, fill: T.bg(C.tableHead), font: { size: XL_FONT.small, bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) });
    const hspec = (key) => ({ src: getIconUrl("attribute", key), bg: C.infoIconBg, radius: 4, pad: 2 });
    const hicons = keys.map((key) => (getIconUrl("attribute", key) ? xlFit(hspec(key), { w: 22, h: 22 }, true) : null));
    const anyIcon = hicons.some(Boolean);
    const headRow = d.line(
      [head(1, 3, "Lv."), ...keys.map((key, k) => ({ ...head(...span(k), GAME_DATA.attribute[key].label), align: { h: "center", v: anyIcon && hicons[k] ? "bottom" : "center" } }))],
      { min: anyIcon ? 42 : 30 }
    );
    keys.forEach((key, k) => d.placeIn(headRow, headRow, span(k)[0], span(k)[1], hspec(key), hicons[k], { valign: "top", name: GAME_DATA.attribute[key].label }));
    const row = (level, bold, lvFill) =>
      d.line(
        [
          { g1: 1, g2: 3, value: level, fill: lvFill, font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) },
          ...keys.map((key, k) => ({
            g1: span(k)[0],
            g2: span(k)[1],
            value: eng.totals[key] == null ? "" : engravingValue(eng.totals[key], key, level),
            font: { bold, color: T.fg(bold ? C.text : C.infoText) },
            align: { h: "center" },
            border: d.all(C.infoLine),
          })),
        ],
        { min: 20 }
      );
    row(GAME_DATA.engravingMaxLevel, true, T.bg(C.white));
    d.line([{ g1: 1, g2: XL_GRID, value: `[ Lv.1 ~ ${GAME_DATA.engravingMaxLevel} 전체 보기 ]  (왼쪽 + 를 누르면 펼쳐져요)`, font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: { top: d.side(C.cardBorder) } }], { height: 22 });
    const g1 = d.r;
    for (let lv = 1; lv <= GAME_DATA.engravingMaxLevel; lv += 1) row(lv, false, T.bg(C.soft));
    d.sheet.group(g1, d.r - 1, true);
    d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
    d.gap(12);
  }
}

function xlPerformance(d, state, section) {
  section.subs.forEach((group) => {
    if (group.key === "engraving") return xlEngraving(d, state, group);
    d.heading(group.number, group.title, group.depth, group.anchor);
    if (group.key === "review") {
      getReviewParagraphs(state).forEach((p) => {
        d.paragraph(1, XL_GRID, xlMarkRuns(d, p, false, { color: d.T.fg(C.text) }));
        d.gap(8);
      });
      return;
    }
    let i = 0;
    const stats = getStatTable(state);
    if (stats) {
      const node = group.children[i++];
      d.heading(node.number, node.title, node.depth, node.anchor);
      xlStatTable(d, stats);
    }
    const cards = getSkillCards(state);
    if (cards.length) {
      const node = group.children[i++];
      d.heading(node.number, node.title, node.depth, node.anchor);
      cards.forEach((card) => xlSkillCard(d, card));
    }
  });
}

/* 4. 추천 알고리즘 */
function xlAlgorithm(d, state) {
  const T = d.T;
  ALGORITHM_ZONES.forEach((type) => {
    const zone = state.algorithm[type];
    const typeItem = GAME_DATA.algorithmType[type];
    const allowedMain = getAllowedOptions(type, "main");
    const allowedSub = getAllowedOptions(type, "sub");
    const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((key) => key && allowed.includes(key) && getItem("attribute", key)))];
    const sharedMain = pick(zone.main, allowedMain);
    const sharedSub = pick(zone.sub, allowedSub);
    const seen = new Set();
    const cols = [0, 1, 2].map((i) => {
      const slot = zone.slots[i] || {};
      const item = getItem("algorithm", slot.key);
      if (!item || item.type !== type || seen.has(slot.key)) return null;
      seen.add(slot.key);
      if (slot.custom !== true) return { key: slot.key, item, custom: false, main: sharedMain, sub: sharedSub };
      return { key: slot.key, item, custom: true, main: pick([slot.main], allowedMain), sub: pick(slot.sub, allowedSub) };
    });
    const anyCustom = cols.some((col) => col && col.custom);
    const names = (list) => (list.length ? list.map((key) => getLabel("attribute", key)).join(" · ") : "-");
    const L = 5; // 표 시작 칸 (폭 16칸 = 512px, 가운데)
    const colSpan = (i) => [L + 4 + i * 4, L + 7 + i * 4];
    const lab = (a, b, text) => ({ g1: a, g2: b, value: text, fill: T.bg(C.tableHead), font: { size: XL_FONT.small, color: T.fg(C.infoText) }, align: { h: "center" }, border: { top: d.side(C.infoLine) } });
    const top = d.r;
    d.line([{ g1: L, g2: L + 15, value: typeItem.label, fill: T.bg(C.algoHead), font: { bold: true, color: C.white }, align: { h: "center" } }], { min: 22 });
    const bspec = (col) => ({ src: getIconUrl("algorithm", col.key), bg: typeItem.accent, radius: 6, pad: 4 });
    const bsize = cols.map((col) => (col && getIconUrl("algorithm", col.key) ? xlFit(bspec(col), { w: 60, h: 60 }, true) : null));
    const imgRow = d.line(
      [{ g1: L, g2: L + 3, value: null, fill: T.bg(typeItem.tint) }, ...cols.map((col, i) => ({ g1: colSpan(i)[0], g2: colSpan(i)[1], value: null, fill: T.bg(typeItem.tint) }))],
      { height: bsize.some(Boolean) ? 57 : 26 }
    );
    cols.forEach((col, i) => col && d.placeIn(imgRow, imgRow, colSpan(i)[0], colSpan(i)[1], bspec(col), bsize[i], { name: col.item.label }));
    d.line([lab(L, L + 3, "알고리즘"), ...cols.map((col, i) => ({ g1: colSpan(i)[0], g2: colSpan(i)[1], value: col ? col.item.label : "-", fill: T.bg(C.algoNames), font: { color: C.white }, align: { h: "center" }, border: { top: d.side(C.infoLine) } }))], { min: 22 });
    const val = (a, b, text) => ({ g1: a, g2: b, value: text, font: { size: XL_FONT.small, color: T.fg(C.infoText) }, align: { h: "center" }, border: { top: d.side(C.infoLine) } });
    if (anyCustom) {
      d.line([lab(L, L + 3, "주 옵션"), ...cols.map((col, i) => val(...colSpan(i), col ? names(col.main) : "-"))], { min: 22 });
      d.line([lab(L, L + 3, "부 옵션"), ...cols.map((col, i) => val(...colSpan(i), col ? names(col.sub) : "-"))], { min: 22 });
    } else {
      d.line([lab(L, L + 2, "주 옵션"), val(L + 3, L + 7, names(sharedMain)), lab(L + 8, L + 10, "부 옵션"), val(L + 11, L + 15, names(sharedSub))], { min: 22 });
    }
    d.box(top, L, d.r - 1, L + 15, C.algoHead, "medium");
    d.gap(12);
  });
}

/* 5. 친밀도 */
function xlIntimacy(d, state) {
  const T = d.T;
  const L = 3;
  const R = 22;
  const top = d.r;
  const head = (text) => d.line([{ g1: L, g2: R, value: text, fill: T.bg(C.tableHead), font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: { top: d.side(C.infoLine) } }], { min: 22 });
  head("친밀도 스킬");
  const skillRow = (key, order) => {
    const item = getItem("intimacy", key);
    if (!item) return;
    const runs = [];
    item.values.forEach((value, i) => {
      if (i) runs.push({ text: "\n", font: d.font() });
      runs.push({ text: `Lv${i + 1}  `, font: d.font({ size: XL_FONT.small, bold: true, color: T.fg(C.subText) }) });
      runs.push({ text: `${item.stat} `, font: d.font({ color: T.fg(C.infoText) }) });
      runs.push({ text: `${value}${item.unit}`, font: d.font({ color: T.fg(C.lvValue) }) });
      runs.push({ text: " 상승.", font: d.font({ color: T.fg(C.infoText) }) });
    });
    const b = { top: d.side(C.infoLine) };
    // 아이콘 = 바탕 틀 + 스킬 그림 겹침
    const base = GAME_DATA.intimacyBase ? assetUrl(GAME_DATA.intimacyBase) : "";
    const icon = getIconUrl("intimacy", key);
    const spec = base ? { src: base, layers: icon ? [icon] : [] } : { src: icon };
    const size = spec.src ? xlFit(spec, { w: 56, h: 56 }, true) : null;
    const r = d.line(
      [
        { g1: L, g2: L, value: order, font: { color: T.fg(C.infoText) }, align: { h: "center" }, border: { ...b, right: d.side(C.infoLine) } },
        { g1: L + 1, g2: L + 3, value: item.label, font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center", v: size ? "bottom" : "center" }, border: { ...b, right: d.side(C.infoLine) } },
        { g1: L + 4, g2: R, value: { runs }, align: { indent: 1 }, border: b },
      ],
      { min: size ? 66 : 22 }
    );
    d.placeIn(r, r, L + 1, L + 3, spec, size, { valign: "top", name: item.label });
  };
  Object.entries(GAME_DATA.intimacy)
    .filter(([, item]) => item.oath)
    .forEach(([key]) => skillRow(key, "서약"));
  state.intimacy.skills
    .filter((key) => {
      const item = getItem("intimacy", key);
      return item && !item.oath;
    })
    .forEach((key, i) => skillRow(key, i + 1));
  // 선물 카드: 한 줄에 5장 (칸 4개씩). 위 = 등급색 상자 그림, 아래 = 어두운 이름 띠
  const giftGroup = (title, keys) => {
    head(title);
    const list = Object.keys(GAME_DATA.gift).filter((key) => keys.includes(key));
    if (!list.length) {
      d.line([{ g1: L, g2: R, value: "-", align: { h: "center" }, border: { top: d.side(C.infoLine) } }], { min: 24 });
      return;
    }
    const PER = 5;
    for (let i = 0; i < list.length; i += PER) {
      const row = list.slice(i, i + PER);
      const slot = (j) => [L + j * 4, L + j * 4 + 3];
      const card = (key) => {
        const gift = getItem("gift", key);
        const tier = getItem("giftTier", gift.tier);
        return { src: getIconUrl("gift", key), bg: tier && tier.bg ? tier.bg : C.iconBg, border: { color: tier ? tier.color : C.infoLine, width: 3 }, radius: 10, pad: 4 };
      };
      const sizes = row.map((key) => xlFit(card(key), { w: 76, h: 76 }, true));
      const cardBg = T.bg("#f0f0f0");
      const r = d.line(
        Array.from({ length: PER }, (_, j) => ({ g1: slot(j)[0], g2: slot(j)[1], value: row[j] && !sizes[j] ? "이미지 없음" : null, fill: row[j] ? cardBg : d.bg, font: { size: XL_FONT.tiny, color: T.fg(C.subText) }, align: { h: "center" } })),
        { height: 66 }
      );
      row.forEach((key, j) => d.placeIn(r, r, slot(j)[0], slot(j)[1], card(key), sizes[j], { name: getLabel("gift", key) }));
      d.line(
        Array.from({ length: PER }, (_, j) =>
          row[j]
            ? { g1: slot(j)[0], g2: slot(j)[1], value: getLabel("gift", row[j]), fill: "#24272d", font: { size: XL_FONT.small, bold: true, color: C.white }, align: { h: "center" } }
            : { g1: slot(j)[0], g2: slot(j)[1], value: null, fill: d.bg }
        ),
        { min: 20 }
      );
      d.gap(4);
    }
  };
  giftGroup("좋아하는 선물", state.intimacy.gifts.like);
  giftGroup("싫어하는 선물", state.intimacy.gifts.hate);
  d.box(top, L, d.r - 1, R, C.infoLine);
  d.gap(12);
  // 서약
  const { description } = getOath(state);
  const parts = getOathTitleParts(state);
  const otop = d.r;
  d.line([{ g1: L, g2: R, value: "서약", fill: T.bg(C.oathHead), font: { bold: true, color: C.white }, align: { h: "center" } }], { min: 22 });
  const title = [parts.left, parts.right].filter(Boolean).join("        ");
  if (title || description) {
    if (title) d.line([{ g1: L, g2: R, value: title, font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: description ? { bottom: d.side(C.oathRule, "medium") } : undefined }], { min: 28 });
    if (description) d.line([{ g1: L, g2: R, value: description, font: { size: XL_FONT.small + 0.5, color: T.fg(C.infoText) }, align: { h: "center" } }], { min: 26 });
  } else {
    d.line([{ g1: L, g2: R, value: "-", align: { h: "center" } }], { min: 24 });
  }
  d.box(otop, L, d.r - 1, R, C.oathLine, "medium");
}

/* 6. 스토리 */
function xlStory(d, state) {
  const T = d.T;
  const story = isObj(state.story) ? state.story : {};
  const top = d.r;
  d.line([{ g1: 1, g2: XL_GRID, value: "인형 스토리", fill: T.bg(C.storyHead), font: { bold: true, color: C.white }, align: { h: "center" } }], { min: 24 });
  GAME_DATA.storySlots.forEach((slot) => {
    const text = typeof story[slot.key] === "string" ? story[slot.key].trim() : "";
    d.line([{ g1: 1, g2: XL_GRID, value: `[ ${slot.label} ]`, fill: T.bg(C.tableHead), font: { bold: true, color: T.fg(C.infoText) }, align: { h: "center" }, border: { top: d.side(C.infoLine) } }], { min: 22 });
    d.line([{ g1: 1, g2: XL_GRID, value: getStoryUnlockText(slot), font: { size: XL_FONT.small, color: T.fg(C.subText) }, align: { indent: 1, v: "bottom" } }], { height: 20 });
    d.paragraph(1, XL_GRID, text || "-", { font: { color: T.fg(C.infoText) }, align: { indent: 1, v: "top" } });
    d.gap(6);
  });
  d.box(top, 1, d.r - 1, XL_GRID, C.cardBorder);
}

/* 7. 작중 행적 */
function xlHistory(d, state, section) {
  const T = d.T;
  const items = getHistoryItems(state);
  const one = (item, node) => {
    d.heading(node.number, item.title.trim(), node.depth, node.anchor);
    const href = safeLinkUrl(item.linkUrl);
    const linkText = item.linkText.trim();
    if (href && linkText) {
      d.line(
        [
          {
            g1: 1,
            g2: XL_GRID,
            value: {
              runs: [
                { text: "→ 자세한 내용은 ", font: d.font() },
                { text: linkText, font: d.font({ color: T.fg(C.link), underline: true }) },
                { text: " 문서를 참고하십시오.", font: d.font() },
              ],
            },
            link: { url: href },
          },
        ],
        { min: 20 }
      );
    }
    const summary = item.summary.trim();
    if (summary) d.paragraph(1, XL_GRID, summary, {});
    d.gap(10);
  };
  const group = section.subs[0];
  if (group && group.children.length) {
    d.heading(group.number, group.title, group.depth, group.anchor);
    items.forEach((item, i) => one(item, group.children[i]));
  } else items.forEach((item, i) => one(item, section.subs[i]));
}

/* 8. 스킨 · 일러스트 */
function xlSkinBadges(d, effects) {
  const T = d.T;
  const runs = [];
  effects.forEach((key, i) => {
    const e = GAME_DATA.skinEffect[key];
    if (i) runs.push({ text: "   ", font: d.font() });
    runs.push({ text: e.label, font: d.font({ size: XL_FONT.small + 0.5, bold: true, color: T.dark ? e.color : toneDown(e.color, 0.62) }) });
  });
  return runs.length ? { runs } : "-";
}

function xlSkinItem(d, item, node) {
  const T = d.T;
  const size = XL_FONT.h3;
  const runs = [
    { text: item.lead, font: d.font({ size, bold: true, color: item.themed ? T.fg(C.orange) : T.fg(C.text) }) },
    ...(item.name ? [{ text: ` - ${item.name}`, font: d.font({ size, bold: true }) }] : []),
    ...(item.tag ? [{ text: ` (${item.tag})`, font: d.font({ size, bold: true }) }] : []),
  ];
  d.heading(node.number, item.headingText, 2, node.anchor, runs);
  if (item.image) {
    const a = d.r;
    d.pictureBlock(1, 22, item.image, { w: 700, h: 760 }, { fill: T.bg(C.soft), name: item.headingText });
    d.box(a, 1, d.r - 1, 22, C.cardBorder);
  }
  const top = d.r;
  const lab = (text) => ({ g1: 1, g2: 8, value: text, fill: T.dark ? T.bg(C.white) : C.skinLabel, font: { size: XL_FONT.small + 0.5, bold: true, color: T.dark ? T.fg(C.text) : C.white }, align: { h: "center" }, border: d.all(C.infoLine) });
  const val = (value) => ({ g1: 9, g2: 22, value: value || "-", font: { size: XL_FONT.small + 0.5, color: T.fg(C.infoText) }, align: { h: "center" }, border: d.all(C.infoLine) });
  d.line([lab("일러스트레이터"), val(item.illustrator ? { runs: [{ text: item.illustrator, font: d.font({ size: XL_FONT.small + 0.5, color: T.fg(C.orange) }) }] } : "")], { min: 22 });
  d.line([lab("입수방법"), val(item.acquisition)], { min: 22 });
  d.line([lab("적용범위"), val(xlSkinBadges(d, item.effects))], { min: 22 });
  d.box(top, 1, d.r - 1, 22, C.cardBorder);
  if (item.description || item.quote) {
    d.gap(8);
    const a = d.r;
    const cellOpts = { fill: T.bg(C.soft), font: { size: XL_FONT.small + 0.5 }, align: { indent: 1 } };
    if (item.description) d.paragraph(1, 22, item.description, cellOpts);
    const quoteRow = d.r;
    if (item.quote) d.paragraph(1, 22, quoteText(item.quote), cellOpts);
    const b = d.r - 1;
    const dash = d.side(C.subText, "dashed");
    const split = item.description && item.quote ? quoteRow : null;
    d.frame(a, 1, b, 22, { top: dash, bottom: dash, right: dash, left: d.side(C.subText, "thick") }, (r) => (r === split ? d.side(C.infoLine) : undefined));
  }
  d.gap(14);
}

function xlTitledImages(d, items) {
  const T = d.T;
  items.forEach((item) => {
    if (item.title) d.line([{ g1: 1, g2: XL_GRID, value: { runs: [{ text: "•  ", font: d.font({ color: T.fg(C.subText) }) }, { text: item.title, font: d.font({ bold: true }) }] } }], { min: 20 });
    item.images.forEach((src) => {
      d.pictureBlock(1, 22, src, { w: 704, h: 1400 }, { align: "left", name: item.title });
      d.gap(6);
    });
  });
}

function xlSkin(d, state, section) {
  const group = section.subs[0];
  d.heading(group.number, group.title, group.depth, group.anchor);
  getSkinItems(state).forEach((item, i) => xlSkinItem(d, item, group.children[i]));
  const node = section.subs[1];
  if (!node) return;
  d.heading(node.number, node.title, node.depth, node.anchor);
  getIllustrationParts(state).forEach((part, i) => {
    const sub = node.children[i];
    d.heading(sub.number, sub.title, sub.depth, sub.anchor);
    if (part.key === "standing") xlTitledImages(d, part.items);
    if (part.key === "cg") {
      part.groups.forEach((g, j) => {
        const n = sub.children[j];
        d.heading(n.number, n.title, n.depth, n.anchor);
        xlTitledImages(d, g.items);
      });
    }
    if (part.key === "expression") {
      part.expressions.forEach((g) => {
        if (g.title) d.line([{ g1: 1, g2: XL_GRID, value: { runs: [{ text: "•  ", font: d.font({ color: d.T.fg(C.subText) }) }, { text: g.title, font: d.font({ bold: true }) }] } }], { min: 20 });
        // 한 줄에 8칸 (칸 3개씩), 칸마다 대사 표 색 테두리
        const tone = getVoiceTone(state);
        const PER = 8;
        for (let i = 0; i < g.images.length; i += PER) {
          const row = g.images.slice(i, i + PER);
          const spec = (src) => ({ src, bg: d.T.bg(C.soft), border: { color: tone, width: 2 } });
          const sizes = row.map((src) => xlFit(spec(src), { w: 88, h: 88 }, true));
          const r = d.line(
            Array.from({ length: PER }, (_, j) => ({ g1: 1 + j * 3, g2: 3 + j * 3, value: row[j] && !sizes[j] ? "이미지 없음" : null, font: { size: XL_FONT.tiny, color: d.T.fg(C.subText) }, align: { h: "center" } })),
            { height: 70 }
          );
          row.forEach((src, j) => d.placeIn(r, r, 1 + j * 3, 3 + j * 3, spec(src), sizes[j], { name: g.title || "감정 표현" }));
        }
        d.gap(10);
      });
    }
    d.gap(8);
  });
}

/* 9. 인형 관계 */
function xlRelationship(d, state) {
  const T = d.T;
  getRelationshipItems(state).forEach((item) => {
    const runs = [{ text: "•  ", font: d.font({ color: T.fg(C.subText) }) }];
    if (item.relation) runs.push({ text: item.relation + (item.person ? " - " : ""), font: d.font({ bold: true }) });
    let link = null;
    if (item.person) {
      const html = renderLinkText(item.person);
      htmlToRuns(html, d.font({ color: T.fg(C.orange) }), T).forEach((run) => runs.push(run));
      const m = /href="([^"]+)"/.exec(html);
      if (m) link = { url: m[1].replace(/&amp;/g, "&") };
    }
    d.line([{ g1: 1, g2: XL_GRID, value: { runs }, link }], { min: 20 });
  });
}

/* 10. 대사 */
function xlVoiceTable(d, title, tone, rows) {
  const T = d.T;
  const top = d.r;
  d.line([{ g1: 1, g2: 22, value: title, fill: tone, font: { bold: true, color: C.white }, align: { h: "center" } }], { min: 24 });
  rows.forEach(({ label, code, text }) => {
    d.line(
      [
        {
          g1: 1,
          g2: 5,
          value: { runs: [{ text: label, font: d.font({ size: XL_FONT.small + 0.5, bold: true, color: T.fg(C.infoText) }) }, { text: `\n${code}`, font: d.font({ size: XL_FONT.tiny - 0.5, color: T.fg(C.subText) }) }] },
          fill: T.bg(C.tableHead),
          align: { h: "center" },
          border: d.all(C.infoLine),
        },
        { g1: 6, g2: 22, value: text || "", font: { color: T.fg(C.infoText) }, align: { indent: 1 }, border: d.all(C.infoLine) },
      ],
      { min: 34 }
    );
  });
  d.box(top, 1, d.r - 1, 22, C.cardBorder);
}

function xlVoice(d, state, section) {
  const tone = getVoiceTone(state);
  const voice = isObj(state.voice) ? state.voice : {};
  xlVoiceTable(
    d,
    "기본 보이스",
    tone,
    GAME_DATA.voiceSlots.map((slot) => ({ label: slot.label, code: slot.code, text: slot.fixed || (typeof voice[slot.key] === "string" ? voice[slot.key].trim() : "") }))
  );
  d.gap(16);
  getVoiceSets(state).forEach((set, i) => {
    const node = section.subs[i];
    d.heading(node.number, set.headingText, node.depth, node.anchor);
    if (set.name) {
      d.line([{ g1: 1, g2: XL_GRID, value: { runs: [{ text: set.name, font: d.font({ color: d.T.fg(C.orange) }) }, { text: " 투영으로 추가되는 보이스 세트이다.", font: d.font() }] } }], { min: 20 });
      d.gap(6);
    }
    if (set.rows.length) xlVoiceTable(d, set.name ? `'${set.name}' 투영 보이스` : "투영 보이스", tone, set.rows.map((row) => ({ label: row.slot.label, code: row.slot.code, text: row.text })));
    d.gap(14);
  });
}

/* 11. 기타 */
function xlEtc(d, state) {
  const T = d.T;
  const items = isObj(state.etc) && Array.isArray(state.etc.items) ? state.etc.items : [];
  items
    .filter(isObj)
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .forEach((text) => {
      d.paragraph(1, XL_GRID, { runs: [{ text: "•  ", font: d.font({ color: T.fg(C.subText) }) }, { text, font: d.font() }] }, {});
      d.gap(4);
    });
}

const XL_SECTION = {
  overview: xlOverview,
  profile: xlProfile,
  performance: xlPerformance,
  algorithm: xlAlgorithm,
  intimacy: xlIntimacy,
  story: xlStory,
  history: xlHistory,
  skin: xlSkin,
  relationship: xlRelationship,
  voice: xlVoice,
  etc: xlEtc,
};

function buildDocSheet(book, state) {
  const T = xlTheme();
  const sheet = book.addSheet("인형 문서");
  sheet.gridLines = false;
  sheet.tabColor = C.orange;
  const bgStyle = { fill: T.bg(C.white) };
  sheet.col(1, 1, XL_MARGIN_PX, { style: bgStyle });
  sheet.col(2, XL_GRID + 1, XL_GRID_PX, { style: bgStyle });
  sheet.col(XL_GRID + 2, 16384, 64, { style: bgStyle }); // 문서 밖도 같은 바탕 (어두운 테마에서 흰 바탕이 안 보이게)
  const d = new XlDoc(sheet, T);
  d.gap(10);
  xlTopCard(d, state);
  xlInfo(d, state);
  d.gap(20);
  const sections = getActiveSections(state);
  xlToc(d, sections);
  d.gap(24);
  sections.forEach((section) => {
    d.heading(section.number, section.title, 0, sectionAnchor(section.key));
    if (XL_SECTION[section.key]) XL_SECTION[section.key](d, state, section);
    d.gap(26);
  });
  d.line([{ g1: 1, g2: XL_GRID, value: "PNC WIKI Generator로 만든 문서", font: { size: XL_FONT.tiny, color: T.fg(C.subText) }, align: { h: "right" } }], { height: 16 });
  return sheet;
}

/* =========================================================
   데이터 시트 (한 시트 = 표 하나, 1행 머리글 고정 + 필터, 맨 오른쪽 숨긴 key 열)
   ========================================================= */

// 이미지 칸 표기: 주소 / 직접 넣은 이미지 / 빈칸
function xlImageNote(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  if (text.startsWith("data:image")) return "직접 넣은 이미지";
  return text;
}

function xlStr(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function xlNum(v) {
  const t = xlStr(v).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : xlStr(v);
}

// columns: [{ title, px }], rows: [[값…]], keys: [키…]
function addDataSheet(book, name, columns, rows, keys) {
  const sheet = book.addSheet(name);
  const head = { font: { bold: true, size: 10 }, fill: "#e8eaf2", align: { v: "center", h: "center", wrap: true }, border: { bottom: { style: "thin", color: "#8a8fa3" } } };
  const body = { font: { size: 10 }, align: { v: "top", wrap: true } };
  const all = [...columns, { title: "key", px: 160 }];
  all.forEach((col, i) => {
    sheet.set(1, i + 1, col.title, head);
    sheet.col(i + 1, i + 1, col.px || 120, i === all.length - 1 ? { hidden: true } : {});
  });
  sheet.height(1, 22);
  rows.forEach((row, r) => {
    [...row, keys[r] || ""].forEach((value, c) => {
      let v = value;
      if (typeof v === "string" && v.length > XLSX_MAX_TEXT) v = `${v.slice(0, XLSX_MAX_TEXT - 40)} …(엑셀 칸 한도로 잘림 — 전체는 _원본)`;
      sheet.set(r + 2, c + 1, v === "" ? null : v, body);
    });
  });
  sheet.freeze = { row: 2, col: 1 };
  sheet.filter = `A1:${colName(all.length)}${Math.max(2, rows.length + 1)}`;
  return sheet;
}

function buildDataSheets(book, state) {
  const p = state.profile;
  const perf = state.performance;

  // 기본정보
  {
    const rows = [];
    const keys = [];
    const add = (label, value, key) => {
      rows.push([label, value]);
      keys.push(key);
    };
    add("이름", xlStr(p.name), "profile.name");
    add("중국어명", xlStr(p.names.cn), "profile.names.cn");
    add("일본어명", xlStr(p.names.jp), "profile.names.jp");
    add("영어명", xlStr(p.names.en), "profile.names.en");
    add("직업", xlStr(p.job), "profile.job");
    add("모델명", xlStr(p.model), "profile.model");
    add("기업", getFullLabel("company", p.company), `profile.company=${p.company}`);
    add("클래스", getLabel("class", p.class), `profile.class=${p.class}`);
    add("포지션", p.positions.map((k) => getLabel("position", k)).filter(Boolean).join(" · "), `profile.positions=${p.positions.join(",")}`);
    add("레어도", p.rarity ? `★${p.rarity}` : "", `profile.rarity=${p.rarity}`);
    add("생일", formatBirthday(p.birthday), `profile.birthday=${p.birthday.unknown ? "unknown" : `${p.birthday.month || ""}-${p.birthday.day || ""}`}`);
    add("성우", xlStr(p.voiceActor.name), "profile.voiceActor.name");
    add("성우 국가", getLabel("country", p.voiceActor.country), `profile.voiceActor.country=${p.voiceActor.country || ""}`);
    add("일러스트레이터", xlStr(p.illustrator), "profile.illustrator");
    add("이력", xlStr(p.history), "profile.history");
    add("등장 스토리", p.storyType && GAME_DATA.storyType[p.storyType] ? GAME_DATA.storyType[p.storyType].label : "", `profile.storyType=${p.storyType || ""}`);
    add("개요 인용", xlStr(state.overview.quote), "overview.quote");
    add("개요 이미지", xlImageNote(state.overview.image), "overview.image");
    add("개요 영상", xlStr(state.overview.video), "overview.video");
    add("평가", perf.review.added ? xlStr(perf.review.text) : "", `performance.review.added=${perf.review.added ? 1 : 0}`);
    add("능력치 생성 방식", { atk: "공격", hash: "연산", twin: "쌍두" }[perf.stats.mode] || "", `performance.stats.mode=${perf.stats.mode}`);
    add("문단 표시: 무장각인", state.sections.weapon === false ? "끔" : "켬", "sections.weapon");
    add("문단 표시: 작중 행적", state.sections.history === false ? "끔" : "켬", "sections.history");
    addDataSheet(book, "기본정보", [{ title: "항목", px: 150 }, { title: "값", px: 520 }], rows, keys);
  }

  // 능력치
  {
    const rarity = String(p.rarity || "");
    const stageLabel = (stage) => (stage.key === "init" ? (rarity ? `${rarity}성 1레벨` : "최초 1레벨") : stage.label);
    const rows = GAME_DATA.statRows.map((row) => [GAME_DATA.attribute[row.key].label, ...GAME_DATA.statStages.map((st) => xlNum(perf.stats.values[st.key][row.key])), row.unit || ""]);
    addDataSheet(
      book,
      "능력치",
      [{ title: "능력치", px: 130 }, ...GAME_DATA.statStages.map((st) => ({ title: stageLabel(st), px: 100 })), { title: "단위", px: 60 }],
      rows,
      GAME_DATA.statRows.map((row) => `performance.stats.values.*.${row.key}`)
    );
  }

  // 스킬 · 스킬레벨
  {
    const rows = [];
    const keys = [];
    const lvRows = [];
    const lvKeys = [];
    GAME_DATA.skillSlots.forEach((slot) => {
      const sk = perf.skills[slot.key] || {};
      const pre = sk.precharge || {};
      rows.push([
        slot.label,
        xlStr(sk.name),
        slot.fixedCooldown ? slot.fixedCooldown : xlNum(sk.cooldown),
        slot.precharge ? xlNum(pre.base) : "",
        slot.precharge ? xlNum(pre.star3) : "",
        slot.precharge ? xlNum(pre.star5) : "",
        xlStr(sk.desc),
        xlStr(sk.levels),
        xlImageNote(sk.icon),
        slot.cutscene ? xlImageNote(sk.cutscene) : "",
      ]);
      keys.push(`performance.skills.${slot.key}`);
      const lines = getLevelLines(sk, slot.levels);
      for (let i = 0; i < slot.levels; i += 1) {
        const own = Array.isArray(sk.overrides) ? xlStr(sk.overrides[i]) : "";
        lvRows.push([slot.label, i + 1, lines[i] ? markupToText(lines[i], true) : "", own]);
        lvKeys.push(`performance.skills.${slot.key}.overrides.${i}`);
      }
    });
    addDataSheet(
      book,
      "스킬",
      [
        { title: "종류", px: 70 },
        { title: "이름", px: 150 },
        { title: "쿨타임(초)", px: 80 },
        { title: "예충전 기본", px: 80 },
        { title: "예충전 ★3", px: 80 },
        { title: "예충전 ★5", px: 80 },
        { title: "설명(표기법 원문)", px: 360 },
        { title: "1레벨 효과(표기법 원문)", px: 300 },
        { title: "아이콘", px: 160 },
        { title: "궁극기 컷씬", px: 160 },
      ],
      rows,
      keys
    );
    addDataSheet(
      book,
      "스킬레벨",
      [
        { title: "스킬", px: 70 },
        { title: "레벨", px: 50 },
        { title: "표시 효과", px: 420 },
        { title: "직접 고친 글", px: 300 },
      ],
      lvRows,
      lvKeys
    );
  }

  // 무장각인 · 각인강화
  {
    const eng = perf.engraving;
    const rows = [["각인", xlStr(eng.name), "", "", xlStr(eng.quote), xlImageNote(eng.image)]];
    const keys = ["performance.engraving"];
    GAME_DATA.breakthroughStages.forEach((stage, i) => {
      const bt = (eng.breakthroughs && eng.breakthroughs[i]) || {};
      const slot = GAME_DATA.skillSlots.find((s) => s.key === bt.target) || (bt.target === GAME_DATA.breakthroughEtc.key ? GAME_DATA.breakthroughEtc : null);
      rows.push([`각인돌파 ${stage}`, xlStr(bt.name), slot ? slot.label : "", xlStr(bt.desc), "", ""]);
      keys.push(`performance.engraving.breakthroughs.${i}=${bt.target || ""}`);
    });
    addDataSheet(
      book,
      "무장각인",
      [
        { title: "구분", px: 90 },
        { title: "이름", px: 160 },
        { title: "대상", px: 70 },
        { title: "설명(표기법 원문)", px: 360 },
        { title: "인용", px: 260 },
        { title: "이미지", px: 160 },
      ],
      rows,
      keys
    );
    const totals = Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, parseEngravingTotal(eng.enhancement && eng.enhancement.totals ? eng.enhancement.totals[key] : "")]));
    const lvRows = Array.from({ length: GAME_DATA.engravingMaxLevel }, (_, i) => [
      i + 1,
      ...GAME_DATA.engravingRows.map((key) => (totals[key] == null ? "" : engravingValue(totals[key], key, i + 1))),
    ]);
    addDataSheet(
      book,
      "각인강화",
      [{ title: "Lv", px: 50 }, ...GAME_DATA.engravingRows.map((key) => ({ title: GAME_DATA.attribute[key].label, px: 90 }))],
      lvRows,
      lvRows.map((_, i) => (i === GAME_DATA.engravingMaxLevel - 1 ? "performance.engraving.enhancement.totals (저장값 = Lv.30)" : `계산값 Lv.${i + 1}`))
    );
  }

  // 추천 알고리즘
  {
    const rows = [];
    const keys = [];
    ALGORITHM_ZONES.forEach((type) => {
      const zone = state.algorithm[type];
      const labels = (list) => (Array.isArray(list) ? list : [list]).filter(Boolean).map((k) => getLabel("attribute", k)).filter(Boolean).join(" · ");
      for (let i = 0; i < 3; i += 1) {
        const slot = zone.slots[i] || {};
        const custom = slot.custom === true;
        rows.push([GAME_DATA.algorithmType[type].label, i + 1, getLabel("algorithm", slot.key), custom ? labels(slot.main) : labels(zone.main), custom ? labels(slot.sub) : labels(zone.sub), custom ? "따로 설정" : "공통"]);
        keys.push(`algorithm.${type}.slots.${i}=${slot.key || ""}`);
      }
    });
    addDataSheet(
      book,
      "추천 알고리즘",
      [
        { title: "영역", px: 70 },
        { title: "순서", px: 50 },
        { title: "알고리즘", px: 130 },
        { title: "주 옵션", px: 160 },
        { title: "부 옵션", px: 200 },
        { title: "옵션 방식", px: 80 },
      ],
      rows,
      keys
    );
  }

  // 친밀도
  {
    const rows = [];
    const keys = [];
    const skillText = (item) => item.values.map((v, i) => `Lv${i + 1} ${item.stat} ${v}${item.unit}`).join(" / ");
    Object.entries(GAME_DATA.intimacy)
      .filter(([, item]) => item.oath)
      .forEach(([key, item]) => {
        rows.push(["친밀도 스킬", "서약", item.label, skillText(item)]);
        keys.push(`intimacy.oathSkill=${key}`);
      });
    state.intimacy.skills.forEach((key, i) => {
      const item = getItem("intimacy", key);
      rows.push(["친밀도 스킬", i + 1, item ? item.label : "", item ? skillText(item) : ""]);
      keys.push(`intimacy.skills.${i}=${key || ""}`);
    });
    [["like", "좋아하는 선물"], ["hate", "싫어하는 선물"]].forEach(([kind, label]) => {
      Object.keys(GAME_DATA.gift)
        .filter((key) => state.intimacy.gifts[kind].includes(key))
        .forEach((key, i) => {
          const gift = getItem("gift", key);
          rows.push([label, i + 1, gift.label, getLabel("giftTier", gift.tier)]);
          keys.push(`intimacy.gifts.${kind}=${key}`);
        });
    });
    const oath = getOath(state);
    rows.push(["서약", "칭호 수식어", oath.prefix, ""], ["서약", "칭호 단어", oath.suffix, ""], ["서약", "설명", oath.description, ""]);
    keys.push("intimacy.oath.titlePrefix", "intimacy.oath.titleSuffix", "intimacy.oath.description");
    addDataSheet(
      book,
      "친밀도",
      [
        { title: "분류", px: 110 },
        { title: "순서", px: 80 },
        { title: "이름", px: 140 },
        { title: "내용", px: 360 },
      ],
      rows,
      keys
    );
  }

  // 스토리
  addDataSheet(
    book,
    "스토리",
    [
      { title: "구분", px: 70 },
      { title: "칸", px: 110 },
      { title: "개방 조건", px: 130 },
      { title: "본문", px: 560 },
    ],
    GAME_DATA.storySlots.map((slot) => [slot.key.startsWith("voice") ? "보이스" : "프로필", slot.label, getStoryUnlockText(slot), xlStr(state.story[slot.key])]),
    GAME_DATA.storySlots.map((slot) => `story.${slot.key}`)
  );

  // 작중 행적
  {
    const items = (state.history.items || []).filter(isObj);
    addDataSheet(
      book,
      "작중 행적",
      [
        { title: "순서", px: 50 },
        { title: "제목", px: 180 },
        { title: "링크 주소", px: 220 },
        { title: "링크 표시 텍스트", px: 150 },
        { title: "요약", px: 420 },
      ],
      items.map((item, i) => [i + 1, xlStr(item.title), xlStr(item.linkUrl), xlStr(item.linkText), xlStr(item.summary)]),
      items.map((_, i) => `history.items.${i}`)
    );
  }

  // 스킨
  {
    const rows = [];
    const keys = [];
    const effects = (list) => cleanSkinEffectKeys(list).map((k) => GAME_DATA.skinEffect[k].label).join(" · ");
    GAME_DATA.skinBase.forEach((slot) => {
      const b = getSkinBase(state, slot.key);
      rows.push([slot.label, "", xlStr(b.name), xlStr(b.illustrator), slot.acquisition, effects(b.effects), slot.description, xlStr(b.quote), xlImageNote(b.image)]);
      keys.push(`skin.base.${slot.key}`);
    });
    (state.skin.items || []).filter(isObj).forEach((item, i) => {
      rows.push(["테마", xlStr(item.theme), xlStr(item.name), xlStr(item.illustrator), xlStr(item.acquisition), effects(item.effects), xlStr(item.description), xlStr(item.quote), xlImageNote(item.image)]);
      keys.push(`skin.items.${item.id || i}`);
    });
    addDataSheet(
      book,
      "스킨",
      [
        { title: "구분", px: 80 },
        { title: "테마", px: 110 },
        { title: "이름", px: 130 },
        { title: "일러스트레이터", px: 110 },
        { title: "입수방법", px: 150 },
        { title: "적용범위", px: 140 },
        { title: "설명", px: 300 },
        { title: "대사", px: 240 },
        { title: "이미지", px: 160 },
      ],
      rows,
      keys
    );
  }

  // 일러스트
  {
    const rows = [];
    const keys = [];
    const ill = state.illustration;
    (ill.standing || []).filter(isObj).forEach((item, i) => {
      rows.push(["스탠딩 CG", "", i + 1, xlStr(item.title), xlImageNote(item.image)]);
      keys.push(`illustration.standing.${i}`);
    });
    const story = getStoryTypeItem(state);
    [["story", story ? `${story.short} CG` : "메인/전속 CG"], ["event", "일반 CG"]].forEach(([field, label]) => {
      ((ill.cg && ill.cg[field]) || []).filter(isObj).forEach((item, i) => {
        const images = Array.isArray(item.images) && item.images.length ? item.images : [""];
        images.forEach((src, j) => {
          rows.push([label, "", `${i + 1}${images.length > 1 ? `-${j + 1}` : ""}`, xlStr(item.title), xlImageNote(src)]);
          keys.push(`illustration.cg.${field}.${i}.images.${j}`);
        });
      });
    });
    const skins = (state.skin.items || []).filter(isObj);
    (state.expression.groups || []).filter(isObj).forEach((group, i) => {
      const skin = skins.find((s) => s.id === group.source);
      const bundle = group.source === "base" ? "기본" : skin ? xlStr(skin.name) || xlStr(skin.theme) : "";
      (group.images || []).filter(isObj).forEach((image, j) => {
        rows.push(["감정 표현", bundle, `${i + 1}-${j + 1}`, "", xlImageNote(image.result)]);
        keys.push(`expression.groups.${i}.images.${j}`);
      });
    });
    addDataSheet(
      book,
      "일러스트",
      [
        { title: "분류", px: 100 },
        { title: "묶음", px: 110 },
        { title: "순서", px: 60 },
        { title: "제목", px: 200 },
        { title: "이미지", px: 300 },
      ],
      rows,
      keys
    );
  }

  // 인형 관계
  {
    const items = (state.relationship.items || []).filter(isObj);
    const links = (text) => {
      const out = [];
      String(text || "").replace(LINK_MARK, (all, label, url) => {
        out.push(url);
        return all;
      });
      return out.join("\n");
    };
    addDataSheet(
      book,
      "인형 관계",
      [
        { title: "순서", px: 50 },
        { title: "관계", px: 140 },
        { title: "대상", px: 200 },
        { title: "링크", px: 300 },
      ],
      items.map((item, i) => [i + 1, xlStr(item.relation), stripLinkMarks(xlStr(item.person)), links(item.person)]),
      items.map((_, i) => `relationship.items.${i}`)
    );
  }

  // 대사
  {
    const rows = [];
    const keys = [];
    const groupOf = (key) => {
      const g = GAME_DATA.voiceGroups.find((grp) => grp.slots.includes(key === "dialogue3" ? "dialogue4" : key));
      return g ? g.label : key === "title" ? "타이틀" : "";
    };
    GAME_DATA.voiceSlots.forEach((slot) => {
      rows.push(["기본 보이스", groupOf(slot.key), slot.label, slot.code, slot.fixed || xlStr(state.voice[slot.key])]);
      keys.push(`voice.${slot.key}`);
    });
    const skins = (state.skin.items || []).filter(isObj);
    (state.voice.sets || []).filter(isObj).forEach((set, i) => {
      const skin = skins.find((s) => s.id && s.id === set.skinId);
      const name = skin ? xlStr(skin.name) || xlStr(skin.theme) : "";
      const count = Number(set.dialogues) || GAME_DATA.skinVoiceDialogueMax;
      GAME_DATA.skinVoiceSlots
        .filter((slot) => !slot.dialogue || slot.dialogue <= count)
        .forEach((slot) => {
          rows.push([name ? `스킨: ${name}` : `스킨 세트 ${i + 1}`, groupOf(slot.key), slot.label, slot.code, xlStr(set.lines && set.lines[slot.key])]);
          keys.push(`voice.sets.${i}.${slot.key}`);
        });
    });
    addDataSheet(
      book,
      "대사",
      [
        { title: "세트", px: 130 },
        { title: "그룹", px: 150 },
        { title: "항목", px: 110 },
        { title: "코드", px: 110 },
        { title: "대사", px: 460 },
      ],
      rows,
      keys
    );
  }

  // 기타
  {
    const items = (state.etc.items || []).filter(isObj);
    addDataSheet(book, "기타", [{ title: "순서", px: 50 }, { title: "내용", px: 600 }], items.map((item, i) => [i + 1, xlStr(item.text)]), items.map((_, i) => `etc.items.${i}`));
  }

  // _원본 (숨김): 작업 저장 JSON과 같은 내용 — 나중에 「엑셀 → 생성기 불러오기」를 만들 때 이 시트를 읽음
  {
    const sheet = book.addSheet("_원본");
    sheet.hidden = true;
    const json = JSON.stringify(toJsonSaveData());
    sheet.set(1, 1, "PNC WIKI Generator 작업 원본 (작업 저장 JSON과 같은 내용, 직접 넣은 이미지 제외). 2행부터 이어 붙이면 JSON 한 덩어리. 고치지 마세요.");
    sheet.set(1, 2, "pnc_wiki_generator_json");
    const CHUNK = 30000;
    for (let i = 0, r = 2; i < json.length; i += CHUNK, r += 1) sheet.set(r, 1, json.slice(i, i + CHUNK), { numFmt: "@" });
    sheet.col(1, 1, 400);
  }
}

/* =========================================================
   만들기 + 저장 메뉴 연결
   ========================================================= */

// 두 번 만들기: ① 필요한 이미지 주소 모으기 → 불러오기 → ② 실제 배치
async function buildWorkbook(state, onImage = null) {
  XL_IMG.mode = "collect";
  XL_IMG.srcs = new Set();
  XL_IMG.missing = new Set();
  XL_IMG.book = new XlsxBook();
  buildDocSheet(XL_IMG.book, state);
  const srcs = [...XL_IMG.srcs];
  await xlLoadImages(srcs, onImage ? (i) => onImage(i, srcs.length) : null);

  XL_IMG.mode = "place";
  XL_IMG.missing = new Set();
  const book = new XlsxBook();
  XL_IMG.book = book;
  book.title = `${String(state.profile.name || "").trim() || "인형"} — 뉴럴 클라우드 위키`;
  buildDocSheet(book, state);
  buildDataSheets(book, state);
  book.missing = new Set(XL_IMG.missing);
  return book;
}

async function exportExcel() {
  const progress = openProgress("엑셀 만드는 중", 100);
  let book;
  try {
    progress.step(0, "준비 중", false);
    await nextFrame();
    book = await buildWorkbook(state, (i, n) => progress.step(Math.round((i / Math.max(1, n)) * 80), `이미지 불러오는 중 (${i}/${n})`, false));
    progress.step(90, "파일로 묶는 중", false);
    await nextFrame();
    const blob = await book.toBlob();
    downloadBlob(blob, `${exportBaseName()}_${exportDateTag()}.xlsx`);
  } catch (error) {
    progress.close();
    exportFailed(error);
    return;
  } finally {
    XL_IMG.info = new Map(); // 메모리 정리
    XL_IMG.book = null;
  }
  progress.close();
  const notes = resultNotes(book.missing, false);
  if (notes) showExportNotice("엑셀 저장 완료", ["<p>엑셀 파일을 저장했어요.</p>", notes]);
  else showToast("엑셀 파일을 저장했어요");
}
