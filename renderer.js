/* =========================================================
   PNC WIKI Generator — renderer.js
   위키 문서 HTML을 만드는 곳. (화면을 직접 건드리지 않음)

   renderDocument(state) → HTML 문자열 1개
     ├─ 생성기 미리보기   : preview.innerHTML = 결과
     ├─ 티스토리 HTML 출력 : 결과를 그대로 복사
     └─ 이미지 캡처       : 미리보기 DOM의 [data-part] 단위

   규칙
   - 스타일은 전부 인라인(style="...")으로. 값은 아래 S에서만 관리.
   - 구조 식별용 클래스는 pncwiki- 로 시작.
   - 티스토리 스킨이 꾸미기 쉬운 태그(h1~h6, p, blockquote, ul/ol/li, table)는
     쓰지 않고 div / span / a / img / details / summary 만 사용.
   - 사용자 입력은 반드시 esc()를 거친 뒤 넣는다.
   - 출력물에는 JavaScript를 넣지 않는다.
   ========================================================= */

/* ---------- 문단 정의 ---------- */

// 문단 순서·제목. 번호와 목차는 이 목록으로 자동 계산한다.
// fixed: true = 항상 표시 / 없으면 state.sections[key]로 켜고 끔
const SECTION_DEFS = [
  { key: "overview", title: "개요", fixed: true },
  { key: "profile", title: "프로필", fixed: true },
  { key: "performance", title: "성능", fixed: true },
  { key: "algorithm", title: "추천 알고리즘", fixed: true },
  { key: "intimacy", title: "친밀도", fixed: true },
  { key: "story", title: "스토리" },
  { key: "appearance", title: "작중 행적" },
  { key: "skin", title: "스킨", fixed: true },
  { key: "relationship", title: "인형 관계", fixed: true },
  { key: "voice", title: "대사", fixed: true },
  { key: "etc", title: "기타", fixed: true },
];

// 켜진 문단만 골라 번호를 붙여 돌려준다. 목차와 본문이 같은 결과를 쓴다.
function getActiveSections(state) {
  let number = 0;
  return SECTION_DEFS.filter(
    (def) => def.fixed || state.sections[def.key] !== false
  ).map((def) => ({ ...def, number: (number += 1) }));
}

// 문단 앵커 id. 티스토리 페이지의 다른 id와 겹치지 않게 접두사를 붙임.
function sectionAnchor(key) {
  return `pncwiki-s-${key}`;
}

/* ---------- 스타일 상수 ---------- */

const C = {
  text: "#222222",
  subText: "#666666",
  border: "#d8dde5",
  cardBorder: "#505050",
  cardHead: "#f0f2f5",
  soft: "#f7f8fa",
  label: "#eceff3",
  rule: "#cccccc",
  quoteBar: "#999999",
  orange: "#ec9f19",
  iconBg: "#2b2b2b",
  infoLabel: "#909090", // 나무위키 템플릿 정보 표 제목칸
  infoText: "#373a3c",
  infoLine: "#cccccc",
  white: "#ffffff",
};

const FONT = "'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif";

const S = {
  // 문서 전체. 스킨에서 물려받는 글꼴·색·줄간격을 여기서 끊는다.
  root: `box-sizing:border-box;margin:0;padding:0;background:${C.white};color:${C.text};font-family:${FONT};font-size:16px;line-height:1.6;text-align:left;word-break:keep-all;`,
  part: `box-sizing:border-box;background:${C.white};`,

  // 상단 카드 (이름 + 투영 이미지)
  topCard: `box-sizing:border-box;margin:0;border:1px solid ${C.cardBorder};background:${C.white};color:${C.text};overflow:hidden;`,
  topNameBox: `padding:14px 16px;background:${C.cardHead};text-align:center;`,
  topName: `margin:0 0 6px;font-size:24px;font-weight:700;line-height:1.3;color:${C.text};`,
  topNameSub: `margin:0;font-size:14px;color:${C.subText};`,
  flag: `display:inline-block;width:18px;height:12px;margin:0 4px 0 0;border:0;vertical-align:middle;object-fit:cover;`,
  imageGrid: `display:grid;grid-template-columns:1fr 1fr;border-top:1px solid ${C.border};`,
  imageSlot: `display:flex;align-items:center;justify-content:center;min-height:280px;background:${C.soft};color:${C.subText};font-size:24px;font-weight:700;text-align:center;`,
  imageSlotLeft: `border-right:1px solid ${C.border};`,
  imageSlotWide: `grid-column:1 / -1;min-height:340px;border-top:1px solid ${C.border};`,
  imageCaption: `padding:12px;background:${C.cardHead};border-top:1px solid ${C.border};color:${C.text};text-align:center;font-size:14px;font-weight:700;`,
  imageCaptionRight: `border-left:1px solid ${C.border};`,
  imageCaptionWide: `grid-column:1 / -1;`,

  // 상단 정보 표 (div grid. 칸 사이 1px 선 = grid gap + 배경색)
  info: `box-sizing:border-box;display:grid;grid-template-columns:20% 30% 20% 30%;gap:1px;margin:-1px 0 24px;border:1px solid ${C.cardBorder};background:${C.infoLine};color:${C.infoText};`,
  infoLabel: `display:flex;align-items:center;justify-content:center;padding:8px;background:${C.infoLabel};color:${C.white};font-weight:700;text-align:center;`,
  infoValue: `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;background:${C.white};color:${C.infoText};text-align:center;word-break:keep-all;`,
  infoIcons: `display:flex;justify-content:center;gap:4px;`,
  infoClassBadge: `display:inline-flex;align-items:center;justify-content:center;width:50px;height:50px;background:${C.iconBg};border-radius:6px;`,
  infoClassImg: `display:block;width:42px;height:42px;margin:0;border:0;object-fit:contain;`,
  infoCompanyBadge: `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:80px;height:80px;padding:1px;border-radius:6px;`,
  infoCompanyImg: `display:block;width:100%;height:100%;margin:0;border:0;object-fit:contain;`,
  infoFlag: `display:inline-block;width:20px;height:14px;margin:0 6px 0 0;border:0;vertical-align:middle;object-fit:cover;`,

  // 인용문
  quote: `margin:0 0 24px;padding:14px 16px;border-left:4px solid ${C.quoteBar};background:transparent;color:${C.text};line-height:1.7;`,

  // 목차 (details/summary — 스크립트 없이 접기/펼치기)
  toc: `display:block;box-sizing:border-box;width:fit-content;min-width:240px;margin:0 0 28px;background:${C.white};`,
  tocSummary: `display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;min-height:54px;padding:14px 18px;border:1px solid ${C.border};background:${C.soft};color:${C.text};font-size:18px;font-weight:700;cursor:pointer;list-style:none;`,
  tocArrow: `width:20px;text-align:center;color:${C.subText};font-size:14px;line-height:1;`,
  tocBody: `padding:14px 18px 16px;border:1px solid ${C.border};border-top:none;`,
  tocItem: `margin:6px 0;line-height:1.4;`,
  tocLink: `color:${C.orange};font-weight:700;text-decoration:none;`,

  // 문단
  section: `margin:0 0 36px;`,
  heading: `margin:0 0 20px;padding:0 0 8px;border-bottom:1px solid ${C.rule};color:${C.text};font-size:28px;font-weight:700;line-height:1.3;`,
  headingArrow: `display:inline-block;width:28px;color:${C.subText};font-size:16px;vertical-align:top;padding-top:4px;`,
  headingNumber: `color:${C.orange};`,
  paragraph: `margin:0;line-height:1.8;`,
  accent: `color:${C.orange};font-weight:700;`,

  // 프로필 카드
  profileCard: `box-sizing:border-box;margin:0 0 28px;padding:0 0 16px;border:1px solid ${C.cardBorder};background:${C.white};overflow:hidden;`,
  profileTitle: `display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:${C.cardHead};color:${C.text};`,
  profileTitleSub: `font-size:13px;font-weight:600;`,
  profileGrid: `display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:16px 16px 0;`,
  profileItem: `display:flex;`,
  profileLabel: `box-sizing:border-box;width:64px;flex-shrink:0;padding:10px 12px;background:${C.label};color:${C.text};font-weight:700;white-space:nowrap;`,
  profileValue: `box-sizing:border-box;flex:1;min-width:0;padding:10px 14px;background:${C.white};border:1px solid ${C.border};border-left:none;line-height:1.6;word-break:keep-all;`,
  historyLabel: `margin:18px 16px 0;padding:10px 14px;background:${C.label};font-weight:700;`,
  historyValue: `margin:0 16px;padding:16px;background:${C.soft};line-height:1.8;word-break:keep-all;`,

  // 아이콘 (흰색 아이콘이 많아서 어두운 칸 위에 올림)
  iconBadge: `display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:0 8px 0 0;background:${C.iconBg};border-radius:4px;vertical-align:middle;`,
  iconImg: `display:block;width:24px;height:24px;margin:0;border:0;object-fit:contain;`,
};

/* ---------- 작은 도구 ---------- */

// 사용자 입력을 HTML에 넣기 전에 반드시 거친다.
function esc(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// escape 후 줄바꿈만 <br>로 (티스토리가 공백 처리를 바꿔도 줄바꿈 유지)
function escMultiline(text) {
  return esc(text).replace(/\r?\n/g, "<br>");
}

function textOrDash(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed : "-";
}

function formatBirthday(birthday) {
  if (birthday.unknown) return "불명";
  const month = birthday.month ? `${birthday.month}월` : "";
  const day = birthday.day ? `${birthday.day}일` : "";
  return [month, day].filter(Boolean).join(" ");
}

function img(src, alt, style) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" style="${style}">`;
}

// GAME_DATA 키 → [아이콘] 이름. 아이콘이 없으면 이름만, 키가 없으면 "-".
function iconLabel(category, key) {
  const label = getLabel(category, key);
  const iconUrl = getIconUrl(category, key);
  const badge = iconUrl
    ? `<span style="${S.iconBadge}">${img(iconUrl, label, S.iconImg)}</span>`
    : "";
  return `${badge}${esc(textOrDash(label))}`;
}

// 파트 감싸기. 이미지 캡처 때 data-part 단위로 잘라 쓴다.
function part(name, inner, extraStyle = "") {
  return `<div class="pncwiki-part" data-part="${name}" style="${S.part}${extraStyle}">${inner}</div>`;
}

/* ---------- 문서 조각 ---------- */

// 다국어명 칸. names의 키는 "언어", 국기는 그 언어를 나타내는 국가 이미지.
const NAME_LANGS = [
  { key: "cn", flag: "cn", placeholder: "중국어명" },
  { key: "jp", flag: "jp", placeholder: "일본어명" },
  { key: "en", flag: "us", placeholder: "영어명" },
];

function renderTopCard(state) {
  const p = state.profile;
  const flag = (key) => {
    const url = getIconUrl("country", key);
    return url ? img(url, getLabel("country", key), S.flag) : "";
  };
  const names = NAME_LANGS.map(
    (lang) => `${flag(lang.flag)}${esc(textOrDash(p.names[lang.key]))}`
  ).join(" / ");

  return `
<div class="pncwiki-top-card" style="${S.topCard}">
  <div style="${S.topNameBox}">
    <div style="${S.topName}">${esc(textOrDash(p.name))}</div>
    <div style="${S.topNameSub}">${names}</div>
  </div>
  <div style="${S.imageGrid}">
    <div style="${S.imageSlot}${S.imageSlotLeft}">이미지 업로드 예정</div>
    <div style="${S.imageSlot}">이미지 업로드 예정</div>
    <div style="${S.imageCaption}">기본 투영</div>
    <div style="${S.imageCaption}${S.imageCaptionRight}">확장 투영</div>
    <div style="${S.imageSlot}${S.imageSlotWide}">이미지 업로드 예정</div>
    <div style="${S.imageCaption}${S.imageCaptionWide}">완벽 투영</div>
  </div>
</div>`;
}

/* 상단 정보 표 (data-part="info") */

function infoBadge(category, key, badgeStyle, imgStyle, bg) {
  const url = getIconUrl(category, key);
  if (!url) return "";
  return `<span style="${badgeStyle}${bg ? `background:${bg};` : ""}">${img(url, getLabel(category, key), imgStyle)}</span>`;
}

function infoClassCell(p) {
  const icons =
    infoBadge("class", p.class, S.infoClassBadge, S.infoClassImg) +
    infoBadge("position", p.position, S.infoClassBadge, S.infoClassImg);
  const text = [getLabel("class", p.class), getLabel("position", p.position)]
    .filter(Boolean)
    .map(esc)
    .join(" | ");
  return `${icons ? `<div style="${S.infoIcons}">${icons}</div>` : ""}<div>${text || "-"}</div>`;
}

function infoCompanyCell(p) {
  const item = getItem("company", p.company);
  if (!item) return "-";
  const badge = infoBadge("company", p.company, S.infoCompanyBadge, S.infoCompanyImg, item.color || C.infoLabel);
  return `${badge}<div>${esc(getFullLabel("company", p.company))}</div>`;
}

function infoRarity(p) {
  return p.rarity ? `★${esc(p.rarity)}` : "-";
}

function infoVoice(p) {
  const v = p.voiceActor;
  const name = String(v.name || "").trim();
  if (!name) return "-";
  const url = getIconUrl("country", v.country);
  const flag = url ? img(url, getLabel("country", v.country), S.infoFlag) : "";
  return `<div>${flag}${esc(name)}</div>`;
}

function renderInfo(state) {
  const p = state.profile;
  const row = (label1, value1, label2, value2) => `
    <div style="${S.infoLabel}">${label1}</div><div style="${S.infoValue}">${value1}</div>
    <div style="${S.infoLabel}">${label2}</div><div style="${S.infoValue}">${value2}</div>`;

  return `
<div class="pncwiki-info" style="${S.info}">
  ${row("클래스", infoClassCell(p), "기업", infoCompanyCell(p))}
  ${row("레어도", infoRarity(p), "모델명", esc(textOrDash(p.model)))}
  ${row("직업", esc(textOrDash(p.job)), "생일", esc(textOrDash(formatBirthday(p.birthday))))}
  ${row("성우", infoVoice(p), "일러스트", esc(textOrDash(p.illustrator)))}
</div>`;
}

function renderQuote(state) {
  const quote = state.overview.quote.trim();
  return `<div class="pncwiki-quote" style="${S.quote}">“${escMultiline(quote)}”</div>`;
}

function renderToc(sections) {
  const items = sections
    .map(
      (s) =>
        `<div style="${S.tocItem}"><a href="#${sectionAnchor(s.key)}" style="${S.tocLink}">${s.number}. ${esc(s.title)}</a></div>`
    )
    .join("");

  return `
<details class="pncwiki-toc" open style="${S.toc}">
  <summary style="${S.tocSummary}"><span>목차</span><span style="${S.tocArrow}">▽</span></summary>
  <div style="${S.tocBody}">${items}</div>
</details>`;
}

function renderHeading(section) {
  return `<div class="pncwiki-heading" style="${S.heading}"><span style="${S.headingArrow}">▽</span><span style="${S.headingNumber}">${section.number}.</span> ${esc(section.title)}</div>`;
}

function renderProfileItem(label, valueHtml) {
  return `
    <div style="${S.profileItem}">
      <div style="${S.profileLabel}">${label}</div>
      <div style="${S.profileValue}">${valueHtml}</div>
    </div>`;
}

/* ---------- 문단 본문 ---------- */
// key → (state) => 본문 HTML. 없는 문단은 제목만 표시된다.

const SECTION_BODY = {
  overview: () =>
    `<div style="${S.paragraph}">모바일 게임 <span style="${S.accent}">뉴럴 클라우드</span>에 등장하는 인형.</div>`,

  profile: (state) => {
    const p = state.profile;
    return `
<div class="pncwiki-profile-card" style="${S.profileCard}">
  <div style="${S.profileTitle}">
    <span>피험 인형 프로필</span>
    <span style="${S.profileTitleSub}">PROJECT.NEURAL.CLOUD</span>
  </div>
  <div style="${S.profileGrid}">
    ${renderProfileItem("이름", esc(textOrDash(p.name)))}
    ${renderProfileItem("직업", esc(textOrDash(p.job)))}
    ${renderProfileItem("모델", esc(textOrDash(p.model)))}
    ${renderProfileItem("기업", iconLabel("company", p.company))}
    ${renderProfileItem("생일", esc(textOrDash(formatBirthday(p.birthday))))}
    ${renderProfileItem("클래스", iconLabel("class", p.class))}
  </div>
  <div style="${S.historyLabel}">이력</div>
  <div style="${S.historyValue}">${escMultiline(textOrDash(p.history))}</div>
</div>`;
  },

  // 성능: 틀만 유지 (내용 구조화는 사용자 정리 후)
};

function renderSection(state, section) {
  const body = SECTION_BODY[section.key] ? SECTION_BODY[section.key](state) : "";
  return part(
    section.key,
    `<div class="pncwiki-section" id="${sectionAnchor(section.key)}" style="${S.section}">${renderHeading(section)}${body}</div>`
  );
}

/* ---------- 문서 전체 ---------- */

function renderDocument(state) {
  const sections = getActiveSections(state);

  return `<div class="pncwiki-doc" style="${S.root}">
${part("top", renderTopCard(state))}
${part("info", renderInfo(state))}
${part("quote", renderQuote(state))}
${part("toc", renderToc(sections))}
${sections.map((section) => renderSection(state, section)).join("\n")}
</div>`;
}
