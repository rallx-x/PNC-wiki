/* =========================================================
   PNC WIKI Generator — xlsx.js
   엑셀(.xlsx) 파일을 직접 만드는 작은 엔진 (외부 라이브러리 없음)

   .xlsx = XML 파일 여러 개를 ZIP으로 묶은 것. 묶기는 export.js의 makeZip을 같이 씀.
   이 생성기에 필요한 기능만:
     글자·숫자 칸, 한 칸 안 부분 서식(리치 텍스트), 글꼴·채우기·테두리·정렬,
     병합, 열 너비, 행 높이, 틀 고정, 필터, 행 묶음(접기), 링크(바깥 주소 / 시트 안 위치),
     숨긴 열·숨긴 시트, 눈금선 숨김, 열 전체 기본 서식
   ========================================================= */

const XLSX_MAX_TEXT = 32767; // 칸 하나 최대 글자 수
const XLSX_MAX_ROW_PT = 409; // 행 높이 최대
const XLSX_DEFAULT_FONT = "맑은 고딕";

function xmlEsc(text) {
  return String(text == null ? "" : text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "") // XML에 못 넣는 글자
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 1 → A, 27 → AA
function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(r, c) {
  return `${colName(c)}${r}`;
}

// "#rrggbb" → "FFRRGGBB"
function argb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  return m ? `FF${m[1].toUpperCase()}` : null;
}

// 화면 px → 엑셀 열 너비 (기본 글꼴 Calibri 11 기준, 숫자 한 글자 = 7px)
function pxToColWidth(px) {
  return Math.max(0.5, Math.round((px / 7) * 100) / 100);
}

// 서식 { font:{name,size,bold,italic,underline,strike,color}, fill, border:{left,right,top,bottom:{style,color}},
//        align:{h,v,wrap,indent}, numFmt:"@" }
// 같은 서식은 한 번만 등록
class XlsxStyles {
  constructor() {
    this.fonts = [];
    this.fills = [];
    this.borders = [];
    this.xfs = [];
    this.keys = { font: new Map(), fill: new Map(), border: new Map(), xf: new Map() };
    this.font({ name: "Calibri", size: 11 }); // 0 = 기본 (열 너비 기준 글꼴)
    this.fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.border({});
    this.xf({}); // 0 = 기본
  }

  intern(kind, list, key, xml) {
    const map = this.keys[kind];
    if (map.has(key)) return map.get(key);
    list.push(xml);
    map.set(key, list.length - 1);
    return list.length - 1;
  }

  font(f) {
    const font = { name: XLSX_DEFAULT_FONT, size: 10, ...f };
    const key = JSON.stringify(font);
    const color = argb(font.color);
    const xml =
      "<font>" +
      (font.bold ? "<b/>" : "") +
      (font.italic ? "<i/>" : "") +
      (font.strike ? "<strike/>" : "") +
      (font.underline ? '<u/>' : "") +
      `<sz val="${font.size}"/>` +
      (color ? `<color rgb="${color}"/>` : '<color theme="1"/>') +
      `<name val="${xmlEsc(font.name)}"/><family val="2"/><charset val="129"/>` +
      "</font>";
    return this.intern("font", this.fonts, key, xml);
  }

  fill(hex) {
    const color = argb(hex);
    if (!color) return 0;
    return this.intern("fill", this.fills, color, `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`);
  }

  border(b) {
    const side = (name) => {
      const s = b && b[name];
      if (!s || !s.style) return `<${name}/>`;
      const color = argb(s.color);
      return `<${name} style="${s.style}">${color ? `<color rgb="${color}"/>` : '<color auto="1"/>'}</${name}>`;
    };
    const xml = `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`;
    return this.intern("border", this.borders, xml, xml);
  }

  xf(style) {
    const s = style || {};
    const fontId = s.font ? this.font(s.font) : 0;
    const fillId = s.fill ? this.fill(s.fill) : 0;
    const borderId = s.border ? this.border(s.border) : 0;
    const numFmtId = s.numFmt === "@" ? 49 : 0;
    const a = s.align || {};
    const alignAttrs =
      (a.h ? ` horizontal="${a.h}"` : "") +
      (a.v ? ` vertical="${a.v}"` : "") +
      (a.wrap ? ' wrapText="1"' : "") +
      (a.indent ? ` indent="${a.indent}"` : "");
    const key = `${fontId}|${fillId}|${borderId}|${numFmtId}|${alignAttrs}`;
    const xml =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      (fontId ? ' applyFont="1"' : "") +
      (fillId ? ' applyFill="1"' : "") +
      (borderId ? ' applyBorder="1"' : "") +
      (numFmtId ? ' applyNumberFormat="1"' : "") +
      (alignAttrs ? ` applyAlignment="1"><alignment${alignAttrs}/></xf>` : "/>");
    return this.intern("xf", this.xfs, key, xml);
  }

  // 리치 텍스트 조각 글꼴 (<rPr>)
  runProps(f) {
    const font = { name: XLSX_DEFAULT_FONT, size: 10, ...f };
    const color = argb(font.color);
    return (
      "<rPr>" +
      (font.bold ? "<b/>" : "") +
      (font.italic ? "<i/>" : "") +
      (font.strike ? "<strike/>" : "") +
      (font.underline ? "<u/>" : "") +
      `<sz val="${font.size}"/>` +
      (color ? `<color rgb="${color}"/>` : "") +
      `<rFont val="${xmlEsc(font.name)}"/><family val="2"/><charset val="129"/>` +
      "</rPr>"
    );
  }

  xml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

// 시트 하나. 칸 값: 글자 / 숫자 / { runs:[{ text, font }] } (리치 텍스트)
class XlsxSheet {
  constructor(book, name) {
    this.book = book;
    this.name = name;
    this.rows = new Map(); // r → { cells: Map(c → { v, s }), ht, level, hidden, collapsed }
    this.cols = []; // { min, max, width, hidden, style }
    this.merges = [];
    this.links = []; // { ref, url } | { ref, location }
    this.freeze = null; // { row, col } = 이 행·열 앞에서 고정
    this.filter = null; // "A1:F20"
    this.gridLines = true;
    this.hidden = false;
    this.tabColor = null;
    this.zoom = null;
    this.outline = false;
    this.anchors = new Map(); // 이름 → 행 (시트 안 링크용)
    this.pendingLinks = []; // { ref, anchor }
    this.pictures = []; // { row, col, x, y, w, h, media, name }
  }

  // 그림 놓기: (row, col) 칸의 왼쪽 위에서 x, y px 떨어진 곳에 w×h px (칸 크기와 상관없이 고정 크기)
  picture(row, col, x, y, w, h, media, name = "") {
    this.pictures.push({ row, col, x, y, w, h, media, name });
  }

  colPx(c) {
    const def = this.cols.find((col) => c >= col.min && c <= col.max);
    return def ? def.px : 64;
  }

  rowPx(r) {
    const row = this.rows.get(r);
    if (row && row.hidden) return 0;
    return ((row && row.ht) || 16.5) * (96 / 72);
  }

  // 칸 기준 위치를 실제로 떨어지는 칸 + 칸 안 위치로 정리 (엑셀은 칸 안 위치가 칸 크기보다 크면 안 됨)
  anchorAt(row, col, x, y) {
    let c = col;
    let dx = x;
    while (dx >= this.colPx(c) && c < 16384) {
      dx -= this.colPx(c);
      c += 1;
    }
    let r = row;
    let dy = y;
    while (dy >= this.rowPx(r) && r < 1048576) {
      dy -= this.rowPx(r);
      r += 1;
    }
    return { r, c, dx: Math.max(0, dx), dy: Math.max(0, dy) };
  }

  drawingXml(rels, mediaPath) {
    const EMU = 9525;
    const items = this.pictures
      .map((pic, i) => {
        const a = this.anchorAt(pic.row, pic.col, pic.x, pic.y);
        const id = rels.add("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", mediaPath(pic.media));
        const cx = Math.round(pic.w * EMU);
        const cy = Math.round(pic.h * EMU);
        return (
          "<xdr:oneCellAnchor>" +
          `<xdr:from><xdr:col>${a.c - 1}</xdr:col><xdr:colOff>${Math.round(a.dx * EMU)}</xdr:colOff><xdr:row>${a.r - 1}</xdr:row><xdr:rowOff>${Math.round(a.dy * EMU)}</xdr:rowOff></xdr:from>` +
          `<xdr:ext cx="${cx}" cy="${cy}"/>` +
          `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="그림 ${i + 1}" descr="${xmlEsc(pic.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
          `<xdr:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
          `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
          "<xdr:clientData/></xdr:oneCellAnchor>"
        );
      })
      .join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      items +
      "</xdr:wsDr>"
    );
  }

  row(r) {
    if (!this.rows.has(r)) this.rows.set(r, { cells: new Map() });
    return this.rows.get(r);
  }

  // 칸 쓰기 (style = 서식 객체)
  set(r, c, value, style) {
    const row = this.row(r);
    const cell = row.cells.get(c) || {};
    if (value !== undefined) cell.v = value;
    if (style !== undefined) cell.s = style;
    row.cells.set(c, cell);
    return cell;
  }

  get(r, c) {
    const row = this.rows.get(r);
    return row ? row.cells.get(c) : undefined;
  }

  // 여러 칸 병합 + 같은 서식. 테두리는 바깥쪽 변만 각 칸에 나눠 줌 (엑셀은 병합 칸 테두리를 가장자리 칸에서 그림)
  mergeSet(r1, c1, r2, c2, value, style = {}) {
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const b = style.border || {};
        const border = {
          left: c === c1 ? b.left : undefined,
          right: c === c2 ? b.right : undefined,
          top: r === r1 ? b.top : undefined,
          bottom: r === r2 ? b.bottom : undefined,
        };
        this.set(r, c, r === r1 && c === c1 ? value : null, { ...style, border });
      }
    }
    if (r1 !== r2 || c1 !== c2) this.merges.push(`${cellRef(r1, c1)}:${cellRef(r2, c2)}`);
  }

  // 이미 쓴 칸들에 바깥 테두리 더하기
  box(r1, c1, r2, c2, side) {
    const add = (r, c, name) => {
      const cell = this.get(r, c) || this.set(r, c, null, {});
      cell.s = { ...(cell.s || {}), border: { ...((cell.s && cell.s.border) || {}), [name]: side } };
    };
    for (let c = c1; c <= c2; c += 1) {
      add(r1, c, "top");
      add(r2, c, "bottom");
    }
    for (let r = r1; r <= r2; r += 1) {
      add(r, c1, "left");
      add(r, c2, "right");
    }
  }

  height(r, pt) {
    this.row(r).ht = Math.max(3, Math.min(XLSX_MAX_ROW_PT, Math.round(pt * 4) / 4));
  }

  // 행 묶음 (접기). collapsed = 처음에 접혀 있음
  group(r1, r2, collapsed) {
    for (let r = r1; r <= r2; r += 1) {
      const row = this.row(r);
      row.level = 1;
      if (collapsed) row.hidden = true;
    }
    this.outline = true;
    if (collapsed && r1 > 1) this.row(r1 - 1).collapsed = true; // 요약 줄 = 묶음 바로 위 줄
  }

  col(min, max, px, extra = {}) {
    this.cols.push({ min, max, px, width: pxToColWidth(px), ...extra });
  }

  link(r, c, target) {
    const ref = cellRef(r, c);
    if (target.url) this.links.push({ ref, url: target.url });
    else if (target.anchor) this.pendingLinks.push({ ref, anchor: target.anchor });
    else if (target.location) this.links.push({ ref, location: target.location });
  }

  anchor(name, r) {
    this.anchors.set(name, r);
  }

  quotedName() {
    return `'${this.name.replace(/'/g, "''")}'`;
  }

  cellXml(r, c, cell, styles, strings) {
    const ref = cellRef(r, c);
    const s = cell.s ? styles.xf(cell.s) : 0;
    const sAttr = s ? ` s="${s}"` : "";
    const v = cell.v;
    if (v == null || v === "") return s ? `<c r="${ref}"${sAttr}/>` : "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
    return `<c r="${ref}"${sAttr} t="s"><v>${strings.add(v, styles)}</v></c>`;
  }

  xml(styles, strings, rels, drawingId = null) {
    this.pendingLinks.forEach(({ ref, anchor }) => {
      const r = this.anchors.get(anchor);
      if (r) this.links.push({ ref, location: `${this.quotedName()}!A${r}` });
    });
    this.pendingLinks = [];

    const rowNums = [...this.rows.keys()].sort((a, b) => a - b);
    let maxC = 1;
    const sheetData = rowNums
      .map((r) => {
        const row = this.rows.get(r);
        const cols = [...row.cells.keys()].sort((a, b) => a - b);
        if (cols.length) maxC = Math.max(maxC, cols[cols.length - 1]);
        const cells = cols.map((c) => this.cellXml(r, c, row.cells.get(c), styles, strings)).join("");
        const attrs =
          (row.ht ? ` ht="${row.ht}" customHeight="1"` : "") +
          (row.level ? ` outlineLevel="${row.level}"` : "") +
          (row.hidden ? ' hidden="1"' : "") +
          (row.collapsed ? ' collapsed="1"' : "");
        return `<row r="${r}"${attrs}>${cells}</row>`;
      })
      .join("");
    const maxR = rowNums.length ? rowNums[rowNums.length - 1] : 1;

    const sheetPr =
      this.tabColor || this.outline
        ? `<sheetPr>${this.tabColor ? `<tabColor rgb="${argb(this.tabColor)}"/>` : ""}${this.outline ? '<outlinePr summaryBelow="0"/>' : ""}</sheetPr>`
        : "";
    const pane = this.freeze
      ? (() => {
          const { row, col } = this.freeze;
          const xs = col > 1 ? ` xSplit="${col - 1}"` : "";
          const ys = row > 1 ? ` ySplit="${row - 1}"` : "";
          const which = row > 1 && col > 1 ? "bottomRight" : row > 1 ? "bottomLeft" : "topRight";
          return `<pane${xs}${ys} topLeftCell="${cellRef(row, col)}" activePane="${which}" state="frozen"/><selection pane="${which}" activeCell="${cellRef(row, col)}" sqref="${cellRef(row, col)}"/>`;
        })()
      : "";
    const view =
      `<sheetViews><sheetView workbookViewId="0"${this.gridLines ? "" : ' showGridLines="0"'}${this.zoom ? ` zoomScale="${this.zoom}" zoomScaleNormal="${this.zoom}"` : ""}${
        this.book.sheets.indexOf(this) === this.book.activeIndex() ? ' tabSelected="1"' : ""
      }>${pane}</sheetView></sheetViews>`;
    const cols = this.cols.length
      ? `<cols>${this.cols
          .sort((a, b) => a.min - b.min)
          .map(
            (col) =>
              `<col min="${col.min}" max="${col.max}" width="${col.width}" customWidth="1"${col.hidden ? ' hidden="1"' : ""}${
                col.style ? ` style="${styles.xf(col.style)}"` : ""
              }/>`
          )
          .join("")}</cols>`
      : "";
    const merges = this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    const links = this.links.length
      ? `<hyperlinks>${this.links
          .map((link) => {
            if (link.location) return `<hyperlink ref="${link.ref}" location="${xmlEsc(link.location)}"/>`;
            const id = rels.add("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", link.url, true);
            return `<hyperlink ref="${link.ref}" r:id="${id}"/>`;
          })
          .join("")}</hyperlinks>`
      : "";
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      sheetPr +
      `<dimension ref="A1:${cellRef(maxR, maxC)}"/>` +
      view +
      `<sheetFormatPr defaultRowHeight="16.5"${this.outline ? ' outlineLevelRow="1"' : ""}/>` +
      cols +
      `<sheetData>${sheetData}</sheetData>` +
      (this.filter ? `<autoFilter ref="${this.filter}"/>` : "") +
      merges +
      links +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      (drawingId ? `<drawing r:id="${drawingId}"/>` : "") +
      "</worksheet>"
    );
  }
}

// 공유 글자 목록 (같은 글은 한 번만)
class XlsxStrings {
  constructor() {
    this.list = [];
    this.map = new Map();
    this.count = 0;
  }

  add(value, styles) {
    this.count += 1;
    let xml;
    if (value && typeof value === "object" && Array.isArray(value.runs)) {
      const runs = value.runs.filter((run) => run.text !== "" && run.text != null);
      let budget = XLSX_MAX_TEXT;
      xml = runs
        .map((run) => {
          const text = String(run.text).slice(0, Math.max(0, budget));
          budget -= text.length;
          return `<r>${styles.runProps(run.font || {})}<t xml:space="preserve">${xmlEsc(text)}</t></r>`;
        })
        .join("");
      if (!xml) xml = '<t xml:space="preserve"></t>';
    } else {
      xml = `<t xml:space="preserve">${xmlEsc(String(value).slice(0, XLSX_MAX_TEXT))}</t>`;
    }
    if (this.map.has(xml)) return this.map.get(xml);
    this.list.push(xml);
    this.map.set(xml, this.list.length - 1);
    return this.list.length - 1;
  }

  xml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.list.length}">` +
      this.list.map((x) => `<si>${x}</si>`).join("") +
      "</sst>"
    );
  }
}

class XlsxRels {
  constructor() {
    this.items = [];
  }

  add(type, target, external) {
    const id = `rId${this.items.length + 1}`;
    this.items.push({ id, type, target, external });
    return id;
  }

  xml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      this.items
        .map((it) => `<Relationship Id="${it.id}" Type="${it.type}" Target="${xmlEsc(it.target)}"${it.external ? ' TargetMode="External"' : ""}/>`)
        .join("") +
      "</Relationships>"
    );
  }
}

// 시트 이름 규칙: 31자 이하, []:*?/\ 금지, 겹치지 않게
function cleanSheetName(name, used) {
  let base = String(name).replace(/[\[\]:*?/\\]/g, "").replace(/^'+|'+$/g, "").slice(0, 31) || "Sheet";
  let out = base;
  for (let i = 2; used.has(out.toLowerCase()); i += 1) out = `${base.slice(0, 28)}(${i})`;
  used.add(out.toLowerCase());
  return out;
}

class XlsxBook {
  constructor() {
    this.sheets = [];
    this.usedNames = new Set();
    this.title = "";
    this.media = []; // { bytes: Uint8Array, ext: "png" | "jpeg" }
    this.mediaKeys = new Map();
  }

  // 그림 파일 등록 (같은 key면 한 번만) → 번호
  addMedia(key, bytes, ext) {
    if (this.mediaKeys.has(key)) return this.mediaKeys.get(key);
    this.media.push({ bytes, ext });
    this.mediaKeys.set(key, this.media.length - 1);
    return this.media.length - 1;
  }

  addSheet(name) {
    const sheet = new XlsxSheet(this, cleanSheetName(name, this.usedNames));
    this.sheets.push(sheet);
    return sheet;
  }

  activeIndex() {
    return Math.max(0, this.sheets.findIndex((s) => !s.hidden));
  }

  // → [{ name, data }] (zip에 넣을 파일들)
  files() {
    const enc = new TextEncoder();
    const styles = new XlsxStyles();
    const strings = new XlsxStrings();
    const out = [];
    const put = (name, text) => out.push({ name, data: enc.encode(text) });

    let drawingCount = 0;
    const sheetXml = this.sheets.map((sheet) => {
      const rels = new XlsxRels();
      let drawing = null;
      let drawingId = null;
      if (sheet.pictures.length) {
        drawingCount += 1;
        const dRels = new XlsxRels();
        const xml = sheet.drawingXml(dRels, (m) => `../media/image${m + 1}.${this.media[m].ext}`);
        drawing = { n: drawingCount, xml, rels: dRels };
        drawingId = rels.add("http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", `../drawings/drawing${drawingCount}.xml`);
      }
      const xml = sheet.xml(styles, strings, rels, drawingId);
      return { xml, rels, drawing };
    });

    const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    put(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        (this.media.some((m) => m.ext === "png") ? '<Default Extension="png" ContentType="image/png"/>' : "") +
        (this.media.some((m) => m.ext === "jpeg") ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : "") +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        this.sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("") +
        sheetXml
          .filter((x) => x.drawing)
          .map((x) => `<Override PartName="/xl/drawings/drawing${x.drawing.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
          .join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        "</Types>"
    );
    put(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/>` +
        "</Relationships>"
    );
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    put(
      "docProps/core.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlEsc(this.title)}</dc:title><dc:creator>PNC WIKI Generator</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        "</cp:coreProperties>"
    );
    put(
      "docProps/app.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PNC WIKI Generator</Application></Properties>'
    );

    const wbRels = new XlsxRels();
    const sheetEntries = this.sheets.map((sheet, i) => {
      const id = wbRels.add(`${NS_R}/worksheet`, `worksheets/sheet${i + 1}.xml`);
      return `<sheet name="${xmlEsc(sheet.name)}" sheetId="${i + 1}" r:id="${id}"${sheet.hidden ? ' state="hidden"' : ""}/>`;
    });
    wbRels.add(`${NS_R}/styles`, "styles.xml");
    wbRels.add(`${NS_R}/sharedStrings`, "sharedStrings.xml");
    const names = this.sheets
      .map((sheet, i) => (sheet.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEsc(sheet.quotedName())}!${sheet.filter.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}</definedName>` : ""))
      .join("");
    put(
      "xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}">` +
        `<bookViews><workbookView activeTab="${this.activeIndex()}"/></bookViews>` +
        `<sheets>${sheetEntries.join("")}</sheets>` +
        (names ? `<definedNames>${names}</definedNames>` : "") +
        "</workbook>"
    );
    put("xl/_rels/workbook.xml.rels", wbRels.xml());

    sheetXml.forEach(({ xml, rels, drawing }, i) => {
      put(`xl/worksheets/sheet${i + 1}.xml`, xml);
      if (rels.items.length) put(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, rels.xml());
      if (drawing) {
        put(`xl/drawings/drawing${drawing.n}.xml`, drawing.xml);
        put(`xl/drawings/_rels/drawing${drawing.n}.xml.rels`, drawing.rels.xml());
      }
    });
    this.media.forEach((m, i) => out.push({ name: `xl/media/image${i + 1}.${m.ext}`, data: m.bytes, media: true }));
    // 서식·글자 목록은 시트를 다 만든 뒤에 (시트가 등록함)
    put("xl/styles.xml", styles.xml());
    put("xl/sharedStrings.xml", strings.xml());
    return out;
  }

  async toBlob() {
    const files = this.files();
    for (const file of files) {
      if (file.media) continue; // 그림은 이미 압축된 파일
      const packed = await deflateRaw(file.data);
      if (packed && packed.length < file.data.length) file.packed = packed;
    }
    const zip = makeZip(files);
    return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
}
