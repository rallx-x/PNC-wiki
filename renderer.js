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
  { key: "history", title: "작중 행적", fixed: true }, // 필수 문단 (항목 0개여도 표시)
  { key: "skin", title: "스킨", fixed: true },
  { key: "relationship", title: "인형 관계", fixed: true },
  { key: "voice", title: "대사", fixed: true },
  { key: "etc", title: "기타", fixed: true },
];

// 하위 문단이 있는 문단: key → (state) => 하위 문단 제목 목록 (문서에 나올 것만, 순서대로)
const SECTION_SUBS = {
  history: (state) => getHistoryItems(state).map((item) => item.title.trim()),
  skin: (state) => getSkinItems(state).map((item) => item.heading),
};

// 켜진 문단만 골라 번호를 붙여 돌려준다. 목차와 본문이 같은 결과를 쓴다.
// 하위 문단 번호도 여기서 계산 ("7.1", "7.2" — 상위 번호를 따라감, 저장하지 않음)
function getActiveSections(state) {
  let number = 0;
  return SECTION_DEFS.filter(
    (def) => def.fixed || state.sections[def.key] !== false
  ).map((def) => {
    const sectionNumber = (number += 1);
    const subs = (SECTION_SUBS[def.key] ? SECTION_SUBS[def.key](state) : []).map((title, i) => ({
      number: `${sectionNumber}.${i + 1}`,
      anchor: `${sectionAnchor(def.key)}-${i + 1}`,
      title,
    }));
    return { ...def, number: sectionNumber, subs };
  });
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
  infoIconBg: "#1d2327", // 정보 표 클래스·포지션 아이콘 칸 (흰 아이콘이라 어두운 칸)
  infoLabel: "#909090", // 나무위키 템플릿 정보 표 제목칸
  infoText: "#373a3c",
  tableHead: "#eeeeee", // 나무위키 템플릿 표 머리줄
  algoHead: "#2e2e2e", // 추천 알고리즘 구역 머리줄·테두리
  algoNames: "#6a6a6a", // 추천 알고리즘 이름 줄
  lvBadge: "#202128", // 친밀도 Lv 배지
  lvValue: "#ffa500", // 친밀도 수치 강조
  infoLine: "#cccccc",
  white: "#ffffff",
  link: "#0275d8", // 나무위키 링크색
  oathHead: "#6b4c2a", // 서약 머리줄 (갈색)
  oathLine: "#8a6a40", // 서약 테두리
  oathRule: "#d9c3a0", // 서약 칭호·설명 사이 선
  skinLabel: "#000000", // 스킨 정보 표 제목칸
  storyHead: "#2e2e2e", // 인형 스토리 카드 머리줄
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
  infoClassBadge: `display:inline-flex;align-items:center;justify-content:center;width:50px;height:50px;background:${C.infoIconBg};border-radius:6px;`,
  infoClassImg: `display:block;width:42px;height:42px;margin:0;border:0;object-fit:contain;`,
  infoCompanyBadge: `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:80px;height:80px;padding:1px;border-radius:6px;`,
  infoCompanyImg: `display:block;width:100%;height:100%;margin:0;border:0;object-fit:contain;`,
  infoAccent: `color:${C.orange};`, // 성우·일러스트 이름 강조 (링크 아님)
  infoFlag: `display:inline-block;width:20px;height:14px;margin:0 6px 0 0;border:0;vertical-align:middle;object-fit:cover;`,

  // 친밀도 (나무위키 템플릿: 폭 600px 표, 머리줄 #eee, Lv 배지 + 주황 수치)
  intimacy: `box-sizing:border-box;display:flex;flex-direction:column;gap:1px;max-width:600px;border:1px solid ${C.infoLine};background:${C.infoLine};color:${C.infoText};`,
  intimacyHead: `display:flex;align-items:center;justify-content:center;gap:6px;padding:6px;background:${C.tableHead};text-align:center;`,
  intimacyRow: `display:grid;grid-template-columns:24px 80px 1fr;gap:1px;`,
  intimacyCell: `display:flex;align-items:center;justify-content:center;padding:6px;background:${C.white};text-align:center;`,
  intimacyLevels: `padding:6px 10px;background:${C.white};text-align:left;line-height:1.9;`,
  intimacyIcon: `position:relative;width:60px;height:60px;margin:0 auto;`,
  intimacyIconImg: `position:absolute;top:0;left:0;display:block;width:60px;height:60px;margin:0;border:0;object-fit:contain;`,
  intimacyName: `margin:2px 0 0;font-size:14px;font-weight:700;`,
  lvBadge: `display:inline-block;height:16px;margin:0 5px 0 0;padding:0 7px;background:${C.lvBadge};color:${C.white};border-radius:3px;font-size:12px;line-height:16px;letter-spacing:-0.5px;vertical-align:middle;`,
  lvValue: `color:${C.lvValue};`,
  empty: `padding:8px;background:${C.white};text-align:center;`,
  reactionIcon: `display:inline-block;width:18px;height:18px;margin:0;border:0;vertical-align:middle;`,
  // 선물 카드 (나무위키 친밀도 선물 칸 참고): 밝은 회색 판 위 등급색 상자 + 아래 어두운 이름 띠
  giftList: `display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:${C.white};`,
  giftCard: `box-sizing:border-box;width:104px;background:#f0f0f0;`,
  giftBox: `box-sizing:border-box;width:88px;height:88px;margin:8px auto;padding:4px;border:3px solid;border-radius:10px;`,
  giftImg: `display:block;width:100%;height:100%;margin:0;border:0;object-fit:contain;`,
  giftName: `display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 2px;background:#24272d;color:${C.white};font-size:12px;font-weight:700;line-height:1.3;word-break:keep-all;text-align:center;`,
  giftNameIcon: `display:inline-block;flex-shrink:0;width:14px;height:14px;margin:0;border:0;`,

  // 추천 알고리즘 (나무위키 템플릿: 구역마다 폭 500px 표, 테두리 2px #2e2e2e)
  algoZone: `box-sizing:border-box;max-width:500px;margin:0 0 16px;border:2px solid ${C.algoHead};background:${C.white};color:${C.infoText};`,
  algoHead: `padding:6px;background:${C.algoHead};color:${C.white};font-weight:700;text-align:center;`,
  algoRow: `display:grid;grid-template-columns:72px 1fr 1fr 1fr;border-top:1px solid ${C.infoLine};`,
  algoRowLabel: `display:flex;align-items:center;justify-content:center;padding:4px;background:${C.tableHead};font-size:13px;text-align:center;`,
  algoImageCell: `box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:80px;padding:8px;`,
  algoBadge: `display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:6px;`,
  algoImg: `display:block;width:56px;height:56px;margin:0;border:0;object-fit:contain;`,
  algoNameCell: `padding:4px 6px;background:${C.algoNames};color:${C.white};text-align:center;font-size:14px;`,
  algoOptionValue: `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 4px;font-size:13px;text-align:center;`,
  algoSharedRow: `display:grid;grid-template-columns:72px 1fr 72px 1fr;border-top:1px solid ${C.infoLine};`,
  algoSharedValue: `display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 10px;padding:6px 4px;font-size:13px;text-align:center;`,
  optionChip: `display:inline-flex;align-items:center;gap:4px;white-space:nowrap;`,
  optionIcon: `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:${C.infoIconBg};border-radius:4px;`,
  optionIconImg: `display:block;width:18px;height:18px;margin:0;border:0;object-fit:contain;`,

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
  paragraph: `margin:0;line-height:1.8;overflow-wrap:anywhere;`,
  subSection: `margin:0 0 28px;`,
  subHeading: `margin:0 0 14px;padding:0 0 6px;border-bottom:1px solid ${C.rule};color:${C.text};font-size:22px;font-weight:700;line-height:1.3;`,
  subHeadingArrow: `display:inline-block;width:24px;color:${C.subText};font-size:14px;vertical-align:top;padding-top:3px;`,
  linkNote: `margin:0 0 12px;padding:0;color:${C.text};font-size:15px;line-height:1.7;`,
  link: `color:${C.link};text-decoration:none;`,
  tocSubItem: `margin:4px 0 4px 18px;line-height:1.4;`,

  // 스토리 카드: 칸마다 접기(details). 기본은 접힘, 캡처 때만 전부 펼침
  story: `box-sizing:border-box;max-width:720px;border:1px solid ${C.cardBorder};background:${C.white};color:${C.infoText};`,
  storyHead: `padding:8px;background:${C.storyHead};color:${C.white};font-weight:700;text-align:center;`,
  storySlot: `display:block;margin:0;border-top:1px solid ${C.infoLine};`,
  storySummary: `display:block;padding:7px 10px;background:${C.tableHead};color:${C.infoText};font-weight:700;text-align:center;cursor:pointer;list-style:none;`,
  storyBody: `padding:12px 16px 14px;line-height:1.8;`,
  storyUnlock: `margin:0 0 8px;color:${C.subText};font-size:13px;`,
  storyText: `margin:0;overflow-wrap:anywhere;`,

  // 인형 관계: "• 관계명 - 인물명" 줄 목록 (인물명만 강조색, 링크 아님)
  relationList: `margin:0;line-height:1.9;`,
  relationItem: `display:flex;gap:8px;overflow-wrap:anywhere;`,
  relationBullet: `flex-shrink:0;color:${C.subText};`,
  relationPerson: `color:${C.orange};`,
  relationName: `font-weight:700;`,

  // 친밀도 서약 (나무위키 서약 칸 참고: 갈색 머리줄 + 칭호 줄 + 구분선 + 설명)
  oath: `box-sizing:border-box;max-width:600px;margin:16px 0 0;border:2px solid ${C.oathLine};background:${C.white};color:${C.infoText};`,
  oathHead: `padding:6px;background:${C.oathHead};color:${C.white};font-weight:700;text-align:center;`,
  oathTitle: `display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 22px;padding:10px 12px 8px;font-weight:700;text-align:center;`,
  oathPart: `display:inline-flex;align-items:center;gap:6px;`,
  oathIcon: `display:block;width:36px;height:auto;margin:0;border:0;`,
  oathRule: `height:0;margin:0 24px;border-top:2px solid ${C.oathRule};`,
  oathDesc: `padding:8px 12px 12px;font-size:14px;text-align:center;overflow-wrap:anywhere;`,

  // 스킨 (하위 문단마다 접기. 큰 이미지 + 정보 표 + 기본 설명)
  skinFold: `display:block;margin:0 0 20px;`,
  skinSummary: `display:block;cursor:pointer;list-style:none;`,
  skinImageBox: `box-sizing:border-box;max-width:720px;margin:0 0 -1px;border:1px solid ${C.cardBorder};background:${C.soft};text-align:center;`,
  skinImage: `display:block;width:100%;height:auto;margin:0 auto;border:0;`,
  skinTable: `box-sizing:border-box;display:grid;grid-template-columns:35% 1fr;gap:1px;max-width:720px;border:1px solid ${C.cardBorder};background:${C.infoLine};`,
  skinLabel: `display:flex;align-items:center;justify-content:center;padding:6px 8px;background:${C.skinLabel};color:${C.white};font-size:14px;font-weight:700;text-align:center;`,
  skinValue: `display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;padding:6px 10px;background:${C.white};color:${C.infoText};font-size:14px;line-height:1.6;text-align:center;overflow-wrap:anywhere;`,
  skinBadge: `display:inline-block;padding:1px 10px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.6;`,
  skinDesc: `box-sizing:border-box;display:inline-block;max-width:720px;margin:16px 0 0;padding:10px 16px;border:1px dashed ${C.subText};border-left:5px solid ${C.subText};background:${C.soft};font-size:14px;`,
  skinDescHead: `margin:0 0 6px;padding:0 0 6px;border-bottom:1px solid ${C.infoLine};`,
  skinDescText: `overflow-wrap:anywhere;`,

  // 대사(기본 보이스): 일반 표 (접기 없음). 왼쪽 칸 이름+코드, 오른쪽 대사
  voice: `box-sizing:border-box;display:flex;flex-direction:column;gap:1px;max-width:720px;border:1px solid ${C.cardBorder};background:${C.infoLine};color:${C.infoText};`,
  voiceHead: `padding:8px;background:${C.storyHead};color:${C.white};font-weight:700;text-align:center;`,
  voiceRow: `display:grid;grid-template-columns:150px 1fr;gap:1px;`,
  voiceLabel: `display:flex;flex-direction:column;justify-content:center;padding:8px 10px;background:${C.tableHead};text-align:center;`,
  voiceName: `font-size:14px;font-weight:700;line-height:1.4;`,
  voiceCode: `margin:2px 0 0;color:${C.subText};font-size:11px;letter-spacing:0.5px;line-height:1.3;`,
  voiceText: `display:flex;align-items:center;padding:8px 12px;background:${C.white};line-height:1.7;overflow-wrap:anywhere;`,
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

function isObj(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

// [클래스][포지션…] 아이콘 + "해결사 | 공격 · 수비" (포지션은 고른 순서대로, 없는 키는 건너뜀)
function infoClassCell(p) {
  const positions = p.positions.filter((key) => getItem("position", key));
  const icons =
    infoBadge("class", p.class, S.infoClassBadge, S.infoClassImg) +
    positions.map((key) => infoBadge("position", key, S.infoClassBadge, S.infoClassImg)).join("");
  const positionText = positions.map((key) => esc(getLabel("position", key))).join(" · ");
  const text = [esc(getLabel("class", p.class)), positionText]
    .filter(Boolean)
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
  return `<div>${flag}<span style="${S.infoAccent}">${esc(name)}</span></div>`;
}

function infoIllustrator(p) {
  const name = String(p.illustrator || "").trim();
  return name ? `<span style="${S.infoAccent}">${esc(name)}</span>` : "-";
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
  ${row("성우", infoVoice(p), "일러스트", infoIllustrator(p))}
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
        `<div style="${S.tocItem}"><a href="#${sectionAnchor(s.key)}" style="${S.tocLink}">${s.number}. ${esc(s.title)}</a></div>` +
        s.subs
          .map(
            (sub) =>
              `<div style="${S.tocSubItem}"><a href="#${sub.anchor}" style="${S.tocLink}">${sub.number}. ${esc(sub.title)}</a></div>`
          )
          .join("")
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

  intimacy: (state) => renderIntimacy(state),

  algorithm: (state) => renderAlgorithm(state),

  story: (state) => renderStory(state),

  history: (state, section) => renderHistory(state, section),

  skin: (state, section) => renderSkin(state, section),

  relationship: (state) => renderRelationship(state),

  voice: (state) => renderVoice(state),
};

/* ---------- 스킨 ---------- */

// 문서에 나올 스킨만 = 투영 종류나 이름 중 하나라도 있는 항목. 순서대로 번호 (8.1 …)
function getSkinItems(state) {
  const items = isObj(state.skin) && Array.isArray(state.skin.items) ? state.skin.items : [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return items
    .filter(isObj)
    .map((item) => {
      const type = str(item.type);
      const name = str(item.name);
      const effects = Array.isArray(item.effects) ? item.effects : [];
      return {
        type,
        name,
        heading: [type, name].filter(Boolean).join(" - "),
        image: safeLinkUrl(item.image),
        illustrator: str(item.illustrator),
        acquisition: str(item.acquisition),
        effects: Object.keys(GAME_DATA.skinEffect).filter((key) => effects.includes(key)),
        description: str(item.description),
      };
    })
    .filter((item) => item.heading);
}

function renderSkinBadge(key) {
  const effect = GAME_DATA.skinEffect[key];
  return `<span style="${S.skinBadge}background:${effect.color};color:${effect.text};">${esc(effect.label)}</span>`;
}

// 하위 문단마다 details (기본 접힘 — 스토리와 같음). 캡처는 getPreviewParts()가 전부 펼침
function renderSkin(state, section) {
  return getSkinItems(state)
    .map((item, i) => {
      const sub = section.subs[i];
      const row = (label, value) => `<div style="${S.skinLabel}">${label}</div><div style="${S.skinValue}">${value || "-"}</div>`;
      const image = item.image
        ? `<div style="${S.skinImageBox}">${img(item.image, item.heading, S.skinImage)}</div>`
        : "";
      const desc = item.description
        ? `<div style="${S.skinDesc}"><div style="${S.skinDescHead}">기본 설명</div><div style="${S.skinDescText}">${escMultiline(item.description)}</div></div>`
        : "";
      return `
<details class="pncwiki-skin" id="${sub.anchor}" style="${S.skinFold}">
  <summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${sub.number}.</span> ${esc(item.heading)}</summary>
  ${image}<div style="${S.skinTable}">${row("일러스트레이터", esc(item.illustrator))}${row("입수방법", escMultiline(item.acquisition))}${row(
        "적용범위",
        item.effects.map(renderSkinBadge).join("")
      )}</div>${desc}
</details>`;
    })
    .join("");
}

/* ---------- 인형 관계 ---------- */

// 문서에 나올 항목만 (관계명·인물명 둘 다 빈 항목은 빠짐)
function getRelationshipItems(state) {
  const items = isObj(state.relationship) && Array.isArray(state.relationship.items) ? state.relationship.items : [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return items
    .filter(isObj)
    .map((item) => ({ relation: str(item.relation), person: str(item.person) }))
    .filter((item) => item.relation || item.person);
}

// "관계명 - 인물명" / 관계명만 / 인물명만 (구분자는 둘 다 있을 때만). 항목 0개면 문단 제목만.
function renderRelationship(state) {
  const items = getRelationshipItems(state);
  if (!items.length) return "";
  const lines = items
    .map((item) => {
      const person = item.person ? `<span style="${S.relationPerson}">${esc(item.person)}</span>` : "";
      const relation = item.relation ? `<span style="${S.relationName}">${esc(item.relation)}${person ? " -" : ""}</span>` : "";
      const text = [relation, person].filter(Boolean).join(" ");
      return `<div style="${S.relationItem}"><span style="${S.relationBullet}">•</span><span>${text}</span></div>`;
    })
    .join("");
  return `<div class="pncwiki-relationship" style="${S.relationList}">${lines}</div>`;
}

/* ---------- 대사 (기본 보이스) ---------- */
// 고정 21칸 (GAME_DATA.voiceSlots 순서). 빈 칸도 줄은 남기고 "-".
function renderVoice(state) {
  const voice = isObj(state.voice) ? state.voice : {};
  const rows = GAME_DATA.voiceSlots
    .map((slot) => {
      const text = typeof voice[slot.key] === "string" ? voice[slot.key].trim() : "";
      return `
  <div style="${S.voiceRow}">
    <div style="${S.voiceLabel}"><div style="${S.voiceName}">${esc(slot.label)}</div><div style="${S.voiceCode}">${esc(slot.code)}</div></div>
    <div style="${S.voiceText}"><div>${text ? escMultiline(text) : "-"}</div></div>
  </div>`;
    })
    .join("");
  return `
<div class="pncwiki-voice" style="${S.voice}">
  <div style="${S.voiceHead}">기본 보이스</div>${rows}
</div>`;
}

/* ---------- 스토리 ---------- */
// 고정 10칸 (GAME_DATA.storySlots 순서). 칸마다 details라 접으면 칸 제목만 남는다.
// 기본은 접힘 (칸 제목만 보임). 이미지 캡처는 script.js getPreviewParts()가 전부 펼친 뒤 찍음.
function renderStory(state) {
  const story = isObj(state.story) ? state.story : {};
  const slots = GAME_DATA.storySlots
    .map((slot) => {
      const text = typeof story[slot.key] === "string" ? story[slot.key].trim() : "";
      return `
  <details class="pncwiki-story-slot" style="${S.storySlot}">
    <summary style="${S.storySummary}">[ ${esc(slot.label)} ]</summary>
    <div style="${S.storyBody}">
      <div style="${S.storyUnlock}">${esc(getStoryUnlockText(slot))}</div>
      <div style="${S.storyText}">${text ? escMultiline(text) : "-"}</div>
    </div>
  </details>`;
    })
    .join("");
  return `
<div class="pncwiki-story" style="${S.story}">
  <div style="${S.storyHead}">인형 스토리</div>${slots}
</div>`;
}

/* ---------- 작중 행적 ---------- */

// 외부 링크 주소 검사: http:// · https:// 로 시작하는 올바른 주소만 허용 (javascript: 등 차단)
// 통과하면 정리된 주소, 아니면 ""
function safeLinkUrl(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!/^https?:\/\//i.test(text) || /[\s"'<>`\\]/.test(text)) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !/[a-z0-9]/i.test(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

// 문서에 나올 항목만 = 제목이 있는 항목 (제목 없는 항목은 본문·목차·번호에서 모두 빠짐, 데이터는 그대로)
// 번호는 이 목록 순서로 매김 → 빈틈없이 이어짐
function getHistoryItems(state) {
  const items = isObj(state.history) && Array.isArray(state.history.items) ? state.history.items : [];
  const str = (v) => (typeof v === "string" ? v : "");
  return items
    .filter(isObj)
    .map((item) => ({
      title: str(item.title),
      linkUrl: str(item.linkUrl),
      linkText: str(item.linkText),
      summary: str(item.summary),
    }))
    .filter((item) => item.title.trim());
}

// "→ 자세한 내용은 [대체 텍스트] 문서를 참고하십시오." — 주소·대체 텍스트 둘 다 있어야 출력
function renderHistoryLink(item) {
  const href = safeLinkUrl(item.linkUrl);
  const text = item.linkText.trim();
  if (!href || !text) return "";
  return `<div style="${S.linkNote}">→ 자세한 내용은 <a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="${S.link}">${esc(text)}</a> 문서를 참고하십시오.</div>`;
}

function renderHistory(state, section) {
  return getHistoryItems(state)
    .map((item, i) => {
      const sub = section.subs[i];
      const summary = item.summary.trim();
      return `
<div class="pncwiki-subsection" id="${sub.anchor}" style="${S.subSection}">
  <div class="pncwiki-subheading" style="${S.subHeading}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${sub.number}.</span> ${esc(item.title.trim())}</div>
  ${renderHistoryLink(item)}${summary ? `<div style="${S.paragraph}">${escMultiline(summary)}</div>` : ""}
</div>`;
    })
    .join("");
}

/* ---------- 추천 알고리즘 ---------- */

const ALGORITHM_ZONES = ["offense", "stability", "special"];

// 능력치 아이콘 + 이름 (수치 없음)
function optionChip(key) {
  const url = getIconUrl("attribute", key);
  const icon = url ? `<span style="${S.optionIcon}">${img(url, "", S.optionIconImg)}</span>` : "";
  return `<span style="${S.optionChip}">${icon}${esc(getLabel("attribute", key))}</span>`;
}

// 구역 표
//  - 전부 공통 옵션이면: 이미지 / 이름 줄 아래에 "주 옵션 | 아이콘 | 부 옵션 | 아이콘" 한 줄
//  - 하나라도 "따로 설정"이면: 알고리즘마다 한 열로 주 옵션 / 부 옵션 (따로 안 한 열은 공통 옵션)
function renderAlgorithmZone(type, zone) {
  const typeItem = GAME_DATA.algorithmType[type];
  const allowedMain = getAllowedOptions(type, "main");
  const allowedSub = getAllowedOptions(type, "sub");
  const pick = (list, allowed) =>
    [...new Set((Array.isArray(list) ? list : []).filter((key) => key && allowed.includes(key) && getItem("attribute", key)))];

  const sharedMain = pick(zone.main, allowedMain);
  const sharedSub = pick(zone.sub, allowedSub);

  // 이 구역 type의 알고리즘만, 같은 키 중복 없이. 옵션은 이 구역 후보에 있는 것만
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

  const chips = (list) => (list.length ? list.map(optionChip).join("") : "-");
  const cell = (style, html) => `<div style="${style}">${html}</div>`;
  const row = (label, style, render) =>
    `<div style="${S.algoRow}">${cell(S.algoRowLabel, label)}${cols.map((col) => cell(style, render(col))).join("")}</div>`;

  const optionRows = anyCustom
    ? `${row("주 옵션", S.algoOptionValue, (col) => (col ? chips(col.main) : "-"))}
  ${row("부 옵션", S.algoOptionValue, (col) => (col ? chips(col.sub) : "-"))}`
    : `<div style="${S.algoSharedRow}">${cell(S.algoRowLabel, "주 옵션")}${cell(S.algoSharedValue, chips(sharedMain))}${cell(
        S.algoRowLabel,
        "부 옵션"
      )}${cell(S.algoSharedValue, chips(sharedSub))}</div>`;

  return `
<div class="pncwiki-algo-zone" style="${S.algoZone}">
  <div style="${S.algoHead}">${esc(typeItem.label)}</div>
  <div style="${S.algoRow}background:${typeItem.tint};">${cell(S.algoRowLabel + "background:transparent;", "")}${cols
    .map((col) =>
      cell(
        S.algoImageCell,
        col ? `<span style="${S.algoBadge}background:${typeItem.accent};">${img(getIconUrl("algorithm", col.key), col.item.label, S.algoImg)}</span>` : ""
      )
    )
    .join("")}</div>
  ${row("알고리즘", S.algoNameCell, (col) => (col ? esc(col.item.label) : "-"))}
  ${optionRows}
</div>`;
}

function renderAlgorithm(state) {
  return `<div class="pncwiki-algorithm">${ALGORITHM_ZONES.map((type) => renderAlgorithmZone(type, state.algorithm[type])).join("")}</div>`;
}

/* ---------- 친밀도 ---------- */

// order: 왼쪽 칸에 들어갈 표시 (숫자 또는 "서<br>약")
function renderIntimacySkill(key, order) {
  const item = getItem("intimacy", key);
  if (!item) return ""; // 없는 키는 건너뜀

  const base = GAME_DATA.intimacyBase ? assetUrl(GAME_DATA.intimacyBase) : "";
  const icon = getIconUrl("intimacy", key);
  const levels = item.values
    .map(
      (value, i) =>
        `<div><span style="${S.lvBadge}">Lv${i + 1}</span>${esc(item.stat)} <span style="${S.lvValue}">${esc(value)}${esc(item.unit)}</span> 상승.</div>`
    )
    .join("");

  return `
  <div style="${S.intimacyRow}">
    <div style="${S.intimacyCell}">${order}</div>
    <div style="${S.intimacyCell}flex-direction:column;">
      <div style="${S.intimacyIcon}">${base ? img(base, "", S.intimacyIconImg) : ""}${icon ? img(icon, item.label, S.intimacyIconImg) : ""}</div>
      <div style="${S.intimacyName}">${esc(item.label)}</div>
    </div>
    <div style="${S.intimacyLevels}">${levels}</div>
  </div>`;
}

// 선물 카드: 등급색 상자 안 선물 이미지 + 이름 띠(반응 아이콘 + 이름)
function renderGiftCard(key, reaction) {
  const gift = getItem("gift", key);
  if (!gift) return "";
  const tier = getItem("giftTier", gift.tier);
  const color = tier ? tier.color : C.infoLine;
  const bg = tier && tier.bg ? tier.bg : C.iconBg;
  const reactionUrl = getIconUrl("giftReaction", reaction);
  const reactionIcon = reactionUrl ? img(reactionUrl, "", S.giftNameIcon) : "";
  return `<div style="${S.giftCard}"><div style="${S.giftBox}border-color:${color};background:${bg};">${img(getIconUrl("gift", key), gift.label, S.giftImg)}</div><div style="${S.giftName}">${reactionIcon}<span>${esc(gift.label)}</span></div></div>`;
}

function renderGiftGroup(reaction, title, keys) {
  const icon = getIconUrl("giftReaction", reaction);
  // GAME_DATA 순서(등급순)로 표시. 저장 순서와 무관
  const cards = Object.keys(GAME_DATA.gift)
    .filter((key) => keys.includes(key))
    .map((key) => renderGiftCard(key, reaction))
    .join("");
  return `
  <div style="${S.intimacyHead}">${icon ? img(icon, getLabel("giftReaction", reaction), S.reactionIcon) : ""}<span>${title}</span></div>
  ${cards ? `<div style="${S.giftList}">${cards}</div>` : `<div style="${S.empty}">-</div>`}`;
}

function renderIntimacy(state) {
  // 맨 위: 서약 스킬 고정 / 그 아래: 고른 스킬 1·2·3 (빈 칸·없는 키는 건너뛰고 번호를 다시 매김)
  const oathRows = Object.entries(GAME_DATA.intimacy)
    .filter(([, item]) => item.oath)
    .map(([key]) => renderIntimacySkill(key, "서<br>약"))
    .join("");
  const skillRows = state.intimacy.skills
    .filter((key) => {
      const item = getItem("intimacy", key);
      return item && !item.oath;
    })
    .map((key, i) => renderIntimacySkill(key, i + 1))
    .join("");
  const gifts = state.intimacy.gifts;

  return `
<div class="pncwiki-intimacy" style="${S.intimacy}">
  <div style="${S.intimacyHead}">친밀도 스킬</div>
  ${oathRows}${skillRows}
  ${renderGiftGroup("like", "좋아하는 선물", gifts.like)}
  ${renderGiftGroup("hate", "싫어하는 선물", gifts.hate)}
</div>${renderOath(state)}`;
}

/* ---------- 친밀도 서약 ---------- */

function getOath(state) {
  const oath = isObj(state.intimacy) && isObj(state.intimacy.oath) ? state.intimacy.oath : {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const name = isObj(state.profile) ? str(state.profile.name) : "";
  return { prefix: str(oath.titlePrefix), suffix: str(oath.titleSuffix), description: str(oath.description), name };
}

// 칭호 조립 규칙 (빈 칸 때문에 ·, 의, 이미지가 혼자 남지 않게)
//  - 왼쪽 묶음 = [수식어 이미지] + 수식어 (+ " · 이름의" — 단어가 있을 때만, "의"가 단어에 걸리므로)
//  - 수식어 없이 단어만 있으면 "이름의"는 단어 묶음 앞에 붙음 (수식어 이미지 없음)
//  - 오른쪽 묶음 = [단어 이미지] + 단어 (단어 있을 때만)
//  - 이름이 비어 있으면 "이름의"는 생략
function getOathTitleParts(state) {
  const { prefix, suffix, name } = getOath(state);
  const owner = suffix && name ? `${name}의` : "";
  return {
    left: prefix ? [prefix, owner].filter(Boolean).join(" · ") : "",
    owner: !prefix ? owner : "",
    right: suffix,
  };
}

// 글자만 (입력 화면 미리보기용)
function getOathTitleText(state) {
  const p = getOathTitleParts(state);
  return [p.left, [p.owner, p.right].filter(Boolean).join(" ")].filter(Boolean).join("  ");
}

function renderOath(state) {
  const { description } = getOath(state);
  const parts = getOathTitleParts(state);
  const icon = (key) => img(assetUrl(GAME_DATA.oathTitle[key]), "", S.oathIcon);
  const left = parts.left ? `<span style="${S.oathPart}">${icon("prefix")}<span>${esc(parts.left)}</span></span>` : "";
  const right = parts.right
    ? `<span style="${S.oathPart}">${parts.owner ? `<span>${esc(parts.owner)}</span>` : ""}${icon("suffix")}<span>${esc(parts.right)}</span></span>`
    : "";
  const title = left || right ? `<div style="${S.oathTitle}">${left}${right}</div>` : "";
  const desc = description ? `<div style="${S.oathDesc}">${esc(description)}</div>` : "";
  const body = title || desc ? `${title}${title && desc ? `<div style="${S.oathRule}"></div>` : ""}${desc}` : `<div style="${S.oathDesc}padding-top:10px;">-</div>`;
  return `
<div class="pncwiki-oath" style="${S.oath}">
  <div style="${S.oathHead}">서약</div>
  ${body}
</div>`;
}

function renderSection(state, section) {
  const body = SECTION_BODY[section.key] ? SECTION_BODY[section.key](state, section) : "";
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
