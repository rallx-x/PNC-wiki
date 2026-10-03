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
  // 등장 스토리(메인/전속)를 골랐으면 "7.1. 전속 스토리" 아래 7.1.1 …, 아니면 바로 7.1 …
  history: (state) => {
    const titles = getHistoryItems(state).map((item) => item.title.trim());
    const group = getStoryTypeItem(state);
    return group && titles.length ? [{ title: group.label, children: titles }] : titles;
  },
  voice: (state) => getVoiceSets(state).map((set) => set.headingText),
  // 3.1 기본 > 능력치 · 스킬 / 3.2 무장각인 > 각인돌파 · 각인강화 / 3.3 평가. 내용 있는 것만 (없으면 번호 당김)
  performance: (state) => {
    const nodes = [];
    const children = [];
    if (getStatTable(state)) children.push("능력치");
    if (getSkillCards(state).length) children.push("스킬");
    if (children.length) nodes.push({ title: "기본", children, key: "basic" });
    const eng = getEngraving(state);
    if (eng) {
      const engChildren = [];
      if (eng.breakthroughs.length) engChildren.push("각인돌파");
      if (eng.totals) engChildren.push("각인강화");
      nodes.push({ title: "무장각인", children: engChildren, key: "engraving" });
    }
    // 평가 = 기본·무장각인을 모두 아우르는 총평 (맨 끝)
    if (getReviewParagraphs(state).length) nodes.push({ title: "평가", children: [], key: "review" });
    return nodes;
  },
  // 8.1 스킨(항상) + 8.2 일러스트(내용 있는 부분만, 없는 칸은 빠지고 번호 당김)
  skin: (state) => {
    const nodes = [{ title: "스킨", children: getSkinItems(state).map((item) => item.headingText) }];
    const parts = getIllustrationParts(state);
    if (parts.length) {
      nodes.push({
        title: "일러스트",
        children: parts.map((part) => ({ title: part.title, children: (part.groups || []).map((group) => group.title) })),
      });
    }
    return nodes;
  },
};

// 하위 문단 트리: 글자 = 제목 하나, { title, children: [...] } = 아래로 한 단계 더 (몇 단계든)
//  → { number: "8.2.2.1", anchor, title, depth, children: [...] }
function buildSubNodes(entries, parentNumber, parentAnchor, depth) {
  return entries.map((entry, i) => {
    const number = `${parentNumber}.${i + 1}`;
    const anchor = `${parentAnchor}-${i + 1}`;
    const title = typeof entry === "string" ? entry : entry.title;
    const children = typeof entry === "string" ? [] : entry.children || [];
    const key = typeof entry === "string" ? "" : entry.key || "";
    return { number, anchor, title, depth, key, children: buildSubNodes(children, number, anchor, depth + 1) };
  });
}

// 켜진 문단만 골라 번호를 붙여 돌려준다. 목차와 본문이 같은 결과를 쓴다.
// 하위 문단 번호도 여기서 계산 ("7.1", "7.2" — 상위 번호를 따라감, 저장하지 않음)
function getActiveSections(state) {
  let number = 0;
  return SECTION_DEFS.filter(
    (def) => def.fixed || state.sections[def.key] !== false
  ).map((def) => {
    const sectionNumber = (number += 1);
    const subs = buildSubNodes(SECTION_SUBS[def.key] ? SECTION_SUBS[def.key](state) : [], sectionNumber, sectionAnchor(def.key), 1);
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
  topImage: `display:block;max-width:100%;max-height:520px;width:auto;height:auto;margin:0 auto;border:0;`,
  imageCaption: `padding:12px;background:${C.cardHead};border-top:1px solid ${C.border};color:${C.text};text-align:center;font-size:14px;font-weight:700;`,
  imageCaptionRight: `border-left:1px solid ${C.border};`,
  imageCaptionWide: `grid-column:1 / -1;`,

  // 상단 정보 표 (div grid. 칸 사이 1px 선 = grid gap + 배경색)
  info: `box-sizing:border-box;display:grid;grid-template-columns:2fr 3fr 2fr 3fr;gap:1px;margin:-1px 0 24px;border:1px solid ${C.cardBorder};background:${C.infoLine};color:${C.infoText};`,
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
  tocSubItem: `margin:4px 0;line-height:1.4;`,

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
  skinImage: `display:block;max-width:100%;width:auto;height:auto;margin:0 auto;border:0;`,
  skinTable: `box-sizing:border-box;display:grid;grid-template-columns:35% 1fr;gap:1px;max-width:720px;border:1px solid ${C.cardBorder};background:${C.infoLine};`,
  skinLabel: `display:flex;align-items:center;justify-content:center;padding:6px 8px;background:${C.skinLabel};color:${C.white};font-size:14px;font-weight:700;text-align:center;`,
  skinValue: `display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;padding:6px 10px;background:${C.white};color:${C.infoText};font-size:14px;line-height:1.6;text-align:center;overflow-wrap:anywhere;`,
  skinBadge: `display:inline-block;padding:1px 10px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.6;`,
  skinDesc: `box-sizing:border-box;display:inline-block;max-width:720px;margin:16px 0 0;padding:10px 16px;border:1px dashed ${C.subText};border-left:5px solid ${C.subText};background:${C.soft};font-size:14px;line-height:1.7;`,
  skinDescRule: `height:0;margin:8px 0;border-top:1px solid ${C.infoLine};`,
  skinDescText: `overflow-wrap:anywhere;`,
  skinItemHeading: `font-size:19px;`,

  // 표기법 위첨자 (나무위키 꺾쇠 주석처럼)
  markSup: `position:relative;top:-0.5em;margin-left:1px;color:${C.orange};font-size:0.72em;line-height:0;`,

  // 성능 > 능력치 표
  statTable: `box-sizing:border-box;display:grid;gap:1px;max-width:720px;margin:0 0 16px;border:1px solid ${C.cardBorder};background:${C.infoLine};color:${C.infoText};font-size:14px;`,
  statHead: `padding:6px;background:${C.tableHead};font-weight:700;text-align:center;`,
  statName: `display:flex;align-items:center;gap:6px;padding:5px 10px;background:${C.white};font-weight:700;`,
  statValue: `display:flex;align-items:center;justify-content:center;padding:5px 8px;background:${C.white};`,

  // 성능 > 무장각인 (대표 카드 · 각인돌파 · 각인강화 표)
  engraveCard: `box-sizing:border-box;max-width:720px;margin:0 0 20px;border:1px solid ${C.cardBorder};background:${C.white};color:${C.infoText};`,
  engraveImageBox: `background:${C.soft};text-align:center;`,
  engraveName: `padding:8px 12px;background:${C.algoHead};color:${C.white};font-size:17px;font-weight:700;text-align:center;`,
  engraveQuote: `padding:12px 16px;font-size:14px;line-height:1.8;text-align:center;overflow-wrap:anywhere;`,
  engraveStage: `padding:5px 12px;background:${C.tableHead};border-bottom:1px solid ${C.infoLine};font-weight:700;text-align:center;`,
  engraveWrap: `box-sizing:border-box;max-width:720px;margin:0 0 16px;overflow-x:auto;`,
  engraveBox: `box-sizing:border-box;min-width:560px;border:1px solid ${C.cardBorder};background:${C.white};color:${C.infoText};font-size:14px;`,
  engraveGrid: `display:grid;gap:1px;background:${C.infoLine};`,
  engraveHead: `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 4px;background:${C.tableHead};font-size:13px;font-weight:700;text-align:center;`,
  engraveLv: `display:flex;align-items:center;justify-content:center;padding:4px;background:${C.soft};font-weight:700;`,
  engraveCell: `display:flex;align-items:center;justify-content:center;padding:4px;background:${C.white};`,
  engraveMax: `display:flex;align-items:center;justify-content:center;padding:6px 4px;background:${C.white};font-weight:700;color:${C.text};`,

  // 성능 > 스킬 카드
  skillCard: `box-sizing:border-box;max-width:720px;margin:0 0 16px;border:1px solid ${C.cardBorder};background:${C.white};color:${C.infoText};font-size:15px;`,
  skillTop: `display:grid;grid-template-columns:84px 1fr;`,
  skillIcon: `display:flex;align-items:center;justify-content:center;padding:8px;border-right:1px solid ${C.infoLine};background:${C.soft};`,
  skillIconImg: `display:block;width:64px;height:64px;margin:0;border:0;object-fit:contain;`,
  skillBody: `min-width:0;`,
  skillRow: `padding:8px 12px;border-bottom:1px solid ${C.infoLine};line-height:1.7;overflow-wrap:anywhere;`,
  skillBadge: `display:inline-block;padding:1px 8px;margin-right:2px;border-radius:2px;color:${C.white};font-size:13px;font-weight:700;`,
  skillFoldTitle: `display:block;padding:6px 12px;font-weight:700;text-align:center;cursor:pointer;list-style:none;`,
  skillLevelTable: `display:grid;grid-template-columns:52px 1fr;gap:1px;background:${C.infoLine};border-top:1px solid ${C.infoLine};`,
  skillLevelHead: `padding:6px;background:${C.tableHead};font-weight:700;text-align:center;`,
  skillLevelNum: `display:flex;align-items:center;justify-content:center;padding:6px;background:${C.white};`,
  skillLevelText: `padding:6px 12px;background:${C.white};line-height:1.7;overflow-wrap:anywhere;`,
  reviewParagraph: `margin:0 0 18px;line-height:1.8;overflow-wrap:anywhere;`,

  // 8.2 일러스트
  illBullet: `display:flex;gap:8px;margin:0 0 8px;font-weight:700;`,
  illImageBox: `margin:0 0 14px;`,
  illImage: `display:block;max-width:100%;width:auto;height:auto;margin:0;border:0;`, // 원본 비율, 작은 그림 확대 안 함
  // 감정 표현: 폭에 따라 열 수 자동 (칸 최소 96px). 결과 그림은 256×256 정사각
  exprGrid: `display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;max-width:100%;margin:0 0 18px;`,
  exprCell: `box-sizing:border-box;min-width:0;border:2px solid;background:${C.soft};`,
  exprImage: `display:block;width:100%;height:auto;margin:0;border:0;`,
  skinTheme: `color:${C.orange};`,

  // 대사(기본 보이스): 일반 표 (접기 없음). 왼쪽 칸 이름+코드, 오른쪽 대사
  voice: `box-sizing:border-box;display:flex;flex-direction:column;gap:1px;max-width:720px;border:1px solid ${C.cardBorder};background:${C.infoLine};color:${C.infoText};`,
  voiceHead: `padding:8px;background:${C.storyHead};color:${C.white};font-weight:700;text-align:center;`,
  voiceRow: `display:grid;grid-template-columns:150px 1fr;gap:1px;`,
  voiceLabel: `display:flex;flex-direction:column;justify-content:center;padding:8px 10px;background:${C.tableHead};text-align:center;`,
  voiceName: `font-size:14px;font-weight:700;line-height:1.4;`,
  voiceCode: `margin:2px 0 0;color:${C.subText};font-size:11px;letter-spacing:0.5px;line-height:1.3;`,
  voiceSetDesc: `margin:0 0 14px;line-height:1.8;`,
  etcList: `margin:0;line-height:1.8;`,
  etcItem: `display:flex;gap:8px;margin:0 0 10px;`,
  etcText: `min-width:0;overflow-wrap:anywhere;`,
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

// 프로필 카드 이미지 = 기본 스킨 3칸 이미지 (같은 이미지를 같이 씀). 없으면 자리 글
function topImage(state, key) {
  const src = getImageSrc(getSkinBase(state, key).image);
  return src ? img(src, "", S.topImage) : "이미지 업로드 예정";
}

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
    <div style="${S.imageSlot}${S.imageSlotLeft}">${topImage(state, "basic")}</div>
    <div style="${S.imageSlot}">${topImage(state, "extended")}</div>
    <div style="${S.imageCaption}">기본 투영</div>
    <div style="${S.imageCaption}${S.imageCaptionRight}">확장 투영</div>
    <div style="${S.imageSlot}${S.imageSlotWide}">${topImage(state, "perfect")}</div>
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

// 목차 하위 항목 (단계마다 18px 들여쓰기)
function renderTocNodes(nodes) {
  return nodes
    .map(
      (node) =>
        `<div style="${S.tocSubItem}margin-left:${18 * node.depth}px;"><a href="#${node.anchor}" style="${S.tocLink}">${node.number}. ${esc(node.title)}</a></div>` +
        renderTocNodes(node.children)
    )
    .join("");
}

function renderToc(sections) {
  const items = sections
    .map(
      (s) =>
        `<div style="${S.tocItem}"><a href="#${sectionAnchor(s.key)}" style="${S.tocLink}">${s.number}. ${esc(s.title)}</a></div>` +
        renderTocNodes(s.subs)
    )
    .join("");

  return `
<details class="pncwiki-toc" open style="${S.toc}">
  <summary style="${S.tocSummary}"><span>목차</span><span style="${S.tocArrow}">▽</span></summary>
  <div style="${S.tocBody}">${items}</div>
</details>`;
}

// 문단 제목 = 접기 머리 (누르면 그 문단 전체가 접힘)
function renderHeading(section) {
  return `<summary class="pncwiki-heading" style="${S.skinSummary}${S.heading}"><span style="${S.headingArrow}">▽</span><span style="${S.headingNumber}">${section.number}.</span> ${esc(section.title)}</summary>`;
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

  performance: (state, section) => renderPerformance(state, section),

  intimacy: (state) => renderIntimacy(state),

  algorithm: (state) => renderAlgorithm(state),

  story: (state) => renderStory(state),

  history: (state, section) => renderHistory(state, section),

  skin: (state, section) => renderSkin(state, section),

  relationship: (state) => renderRelationship(state),

  voice: (state, section) => renderVoice(state, section),

  etc: (state) => renderEtc(state),
};

/* ---------- 스킨 ---------- */
// 8.1. 스킨 (펼침) 아래 8.1.1 … 기본 투영 3칸(항상) + 스킨 테마(테마나 이름이 있는 것만)

function getSkinBase(state, key) {
  const base = state && isObj(state.skin) && isObj(state.skin.base) && isObj(state.skin.base[key]) ? state.skin.base[key] : {};
  return base;
}

function cleanSkinEffectKeys(list) {
  const effects = Array.isArray(list) ? list : [];
  const out = [];
  Object.entries(GAME_DATA.skinEffect).forEach(([key, effect]) => {
    if (effects.includes(key) && !(effect.excludes || []).some((other) => out.includes(other))) out.push(key);
  });
  return out;
}

function getSkinItems(state) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const shape = (raw, extra) => {
    const effects = cleanSkinEffectKeys(raw.effects);
    const tag = effects.map((key) => GAME_DATA.skinEffect[key]).find((effect) => effect.titleTag);
    const lead = extra.theme || extra.label;
    const name = str(raw.name);
    return {
      lead, // 제목 앞부분 (기본 투영 / 테마 이름)
      isBase: Boolean(extra.label), // 기본/확장/완벽 투영 (문서에서 접힌 채로 시작)
      themed: Boolean(extra.theme), // 테마 이름은 강조색
      name,
      tag: tag ? tag.label : "",
      headingText: [[lead, name].filter(Boolean).join(" - "), tag ? `(${tag.label})` : ""].filter(Boolean).join(" "),
      image: getImageSrc(raw.image),
      illustrator: str(raw.illustrator),
      acquisition: extra.acquisition,
      effects,
      description: extra.description,
      quote: str(raw.quote),
    };
  };
  const base = GAME_DATA.skinBase.map((slot) =>
    shape(getSkinBase(state, slot.key), { label: slot.label, acquisition: slot.acquisition, description: slot.description })
  );
  const items = isObj(state.skin) && Array.isArray(state.skin.items) ? state.skin.items : [];
  const themes = items
    .filter(isObj)
    .filter((raw) => str(raw.theme) || str(raw.name))
    .map((raw) => shape(raw, { theme: str(raw.theme), acquisition: str(raw.acquisition), description: str(raw.description) }));
  return [...base, ...themes];
}

function renderSkinBadge(key) {
  const effect = GAME_DATA.skinEffect[key];
  return `<span style="${S.skinBadge}background:${effect.color};color:${effect.text};">${esc(effect.label)}</span>`;
}

// 대사는 따옴표로 감쌈 (이미 따옴표로 시작하면 그대로)
function quoteText(text) {
  return /^["“]/.test(text) ? text : `"${text}"`;
}

function renderSkinItem(item, sub) {
  const lead = item.themed ? `<span style="${S.skinTheme}">${esc(item.lead)}</span>` : esc(item.lead);
  const heading = [lead, item.name ? esc(item.name) : ""].filter(Boolean).join(" - ") + (item.tag ? ` (${esc(item.tag)})` : "");
  const row = (label, value, extra = "") => `<div style="${S.skinLabel}">${label}</div><div style="${S.skinValue}${extra}">${value || "-"}</div>`;
  const image = item.image ? `<div style="${S.skinImageBox}">${img(item.image, item.headingText, S.skinImage)}</div>` : "";
  const desc = item.description ? `<div style="${S.skinDescText}">${escMultiline(item.description)}</div>` : "";
  const quote = item.quote ? `<div style="${S.skinDescText}">${escMultiline(quoteText(item.quote))}</div>` : "";
  const descBox = desc || quote ? `<div style="${S.skinDesc}">${desc}${desc && quote ? `<div style="${S.skinDescRule}"></div>` : ""}${quote}</div>` : "";
  return `
  <details class="pncwiki-skin" id="${sub.anchor}"${item.isBase ? "" : " open"} style="${S.skinFold}">
    <summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}${S.skinItemHeading}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${sub.number}.</span> ${heading}</summary>
    ${image}<div style="${S.skinTable}">${row("일러스트레이터", esc(item.illustrator), item.illustrator ? `color:${C.orange};` : "")}${row(
      "입수방법",
      escMultiline(item.acquisition)
    )}${row("적용범위", item.effects.map(renderSkinBadge).join(""))}</div>${descBox}
  </details>`;
}

// 접는 하위 제목 (단계가 깊을수록 글자 작게)
function foldHeading(node) {
  const size = [22, 22, 19, 17][Math.min(node.depth, 3)];
  return `<summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}font-size:${size}px;"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${node.number}.</span> ${esc(node.title)}</summary>`;
}

function renderSkin(state, section) {
  const group = section.subs[0];
  const items = getSkinItems(state);
  return `
<details class="pncwiki-skin-group" id="${group.anchor}" open style="${S.skinFold}">
  ${foldHeading(group)}
  ${items.map((item, i) => renderSkinItem(item, group.children[i])).join("")}
</details>${section.subs[1] ? renderIllustration(state, section.subs[1]) : ""}`;
}

/* ---------- 표기법 (스킬·평가 글) ---------- */
// *고유명사*  *단어|색*  **굵게**  ^위첨자^  [글자]{색}  __밑줄__  ~~취소선~~  \기호(그대로)
// 고유명사 색: 사전 단어로 끝나면 그 분류 색, 아니면 「사전에 없는 단어」 색
// autoTerms: 사전 단어는 별표 없이도 자동 색 (스킬 글)
const MARK_ESCAPABLE = "\\*^[]{}_~|";
let termRegexCache = null;

function termColorOf(text) {
  const t = text.trim();
  const words = Object.keys(GAME_DATA.termDictionary).sort((a, b) => b.length - a.length);
  const hit = words.find((word) => t.endsWith(word));
  const kind = hit ? GAME_DATA.termDictionary[hit] : "unknown";
  return GAME_DATA.termColor[kind].color;
}

function namedColor(name) {
  const n = String(name || "").trim();
  if (GAME_DATA.namedColor[n]) return GAME_DATA.namedColor[n];
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(n) ? n : "";
}

function autoTermHtml(escapedPlain) {
  if (!termRegexCache) {
    const words = Object.keys(GAME_DATA.termDictionary)
      .sort((a, b) => b.length - a.length)
      .map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    termRegexCache = new RegExp(words.join("|"), "g");
  }
  return escapedPlain.replace(termRegexCache, (word) => `<span style="color:${termColorOf(word.replace(/&amp;/g, "&"))};">${word}</span>`);
}

function markInline(text, autoTerms) {
  const re = /\*\*(.+?)\*\*|\*([^*\n]+?)\*|\^([^^\n]+?)\^|\[([^\]\n]+?)\]\{([^}\n]+?)\}|__(.+?)__|~~(.+?)~~/g;
  let out = "";
  let last = 0;
  let m;
  const plain = (s) => (autoTerms ? autoTermHtml(esc(s)) : esc(s));
  while ((m = re.exec(text))) {
    out += plain(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] !== undefined) out += `<span style="font-weight:700;">${markInline(m[1], autoTerms)}</span>`;
    else if (m[2] !== undefined) {
      const bar = m[2].lastIndexOf("|");
      const color = bar > -1 ? namedColor(m[2].slice(bar + 1)) : "";
      const word = bar > -1 && color ? m[2].slice(0, bar) : m[2];
      out += `<span style="color:${color || termColorOf(word)};">${markInline(word, false)}</span>`;
    } else if (m[3] !== undefined) out += `<span style="${S.markSup}">[${esc(m[3])}]</span>`;
    else if (m[4] !== undefined) {
      const color = namedColor(m[5]);
      out += color ? `<span style="color:${color};">${markInline(m[4], false)}</span>` : plain(m[0]);
    } else if (m[6] !== undefined) out += `<span style="text-decoration:underline;">${markInline(m[6], autoTerms)}</span>`;
    else if (m[7] !== undefined) out += `<span style="text-decoration:line-through;">${markInline(m[7], autoTerms)}</span>`;
  }
  return out + plain(text.slice(last));
}

// 글 전체 → HTML (줄바꿈 → <br>). 「\기호」는 기호 그대로
function renderMarkup(raw, autoTerms) {
  const holds = [];
  const text = String(raw == null ? "" : raw).replace(/\\([\\*^\[\]{}_~|])/g, (_, ch) => {
    holds.push(ch);
    return `\uE000${holds.length - 1}\uE001`;
  });
  const html = text
    .split(/\r?\n/)
    .map((line) => markInline(line, autoTerms))
    .join("<br>");
  return html.replace(/\uE000(\d+)\uE001/g, (_, i) => esc(holds[Number(i)]));
}

/* ---------- 레벨 효과 자동 만들기 ---------- */
// 1레벨 글 안의 {처음~끝} / {처음+증가} / {값,값,…} 을 레벨마다 계산해서 **굵게** 넣음
const LEVEL_VAR = /\{\s*(-?\d+(?:\.\d+)?(?:\s*(?:~|\+)\s*-?\d+(?:\.\d+)?|(?:\s*,\s*-?\d+(?:\.\d+)?)+))\s*\}/g;

function decimalsOf(n) {
  const s = String(n);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

function formatLevelNumber(value, decimals) {
  const fixed = value.toFixed(Math.min(4, decimals));
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

function levelValue(spec, index, total) {
  const s = spec.replace(/\s+/g, "");
  if (s.includes(",")) {
    const list = s.split(",");
    return list[Math.min(index, list.length - 1)];
  }
  if (s.includes("~")) {
    const [a, b] = s.split("~");
    const start = Number(a);
    const end = Number(b);
    const step = total > 1 ? (end - start) / (total - 1) : 0;
    const dec = Math.max(decimalsOf(a), decimalsOf(b), Number.isInteger(step) ? 0 : 1);
    return formatLevelNumber(start + step * index, dec);
  }
  const [a, b] = s.split("+");
  return formatLevelNumber(Number(a) + Number(b) * index, Math.max(decimalsOf(a), decimalsOf(b)));
}

// index 0 = 1레벨
function makeLevelText(base, index, total) {
  return String(base || "").replace(LEVEL_VAR, (_, spec) => `**${levelValue(spec, index, total)}**`);
}

// 레벨 줄 목록: 직접 고친 레벨은 고친 글, 아니면 자동 글
function getLevelLines(skill, total) {
  const base = typeof skill.levels === "string" ? skill.levels.trim() : "";
  const overrides = Array.isArray(skill.overrides) ? skill.overrides : [];
  if (!base && !overrides.some((v) => typeof v === "string" && v.trim())) return [];
  return Array.from({ length: total }, (_, i) => {
    const own = typeof overrides[i] === "string" ? overrides[i].trim() : "";
    return own || (base ? makeLevelText(base, i, total) : "");
  });
}

/* ---------- 성능: 스킬 · 평가 ---------- */

function getSkillCards(state) {
  const perf = isObj(state.performance) ? state.performance : {};
  const skills = isObj(perf.skills) ? perf.skills : {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return GAME_DATA.skillSlots
    .map((slot) => {
      const skill = isObj(skills[slot.key]) ? skills[slot.key] : {};
      const pre = isObj(skill.precharge) ? skill.precharge : {};
      return {
        slot,
        icon: getImageSrc(skill.icon),
        name: str(skill.name),
        desc: str(skill.desc),
        cooldown: slot.fixedCooldown ? String(slot.fixedCooldown) : str(skill.cooldown),
        precharge: slot.precharge ? [str(pre.base), str(pre.star3), str(pre.star5)] : [],
        cutscene: slot.cutscene ? getImageSrc(skill.cutscene) : "",
        levels: getLevelLines(skill, slot.levels),
      };
    })
    // 이름·설명·아이콘·레벨 효과 중 하나라도 있는 스킬만 (궁극기 30초 고정은 내용으로 치지 않음)
    .filter((card) => card.name || card.desc || card.icon || card.levels.length || card.cutscene || (card.slot.cooldown && card.cooldown) || card.precharge.some(Boolean));
}

function getReviewParagraphs(state) {
  const perf = isObj(state.performance) ? state.performance : {};
  const review = isObj(perf.review) ? perf.review : {};
  if (review.added !== true || typeof review.text !== "string") return [];
  return review.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function prechargeText(values) {
  const [base, star3, star5] = values;
  const parts = [];
  if (base) parts.push(`${base}초`);
  if (star3) parts.push(`${star3}초(★3)`);
  if (star5) parts.push(`${star5}초(★5)`);
  return parts.length ? `예충전 ${parts.join(" → ")}` : "";
}

// 능력치 표: 값이 하나라도 있을 때만, 단계 칸도 값이 있는 단계만
function getStatTable(state) {
  const perf = isObj(state.performance) ? state.performance : {};
  const stats = isObj(perf.stats) ? perf.stats : {};
  const values = isObj(stats.values) ? stats.values : {};
  const str = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");
  const rarity = isObj(state.profile) ? String(state.profile.rarity || "") : "";
  const stages = GAME_DATA.statStages
    .map((stage) => {
      const row = isObj(values[stage.key]) ? values[stage.key] : {};
      const cells = Object.fromEntries(GAME_DATA.statRows.map((r) => [r.key, str(row[r.key])]));
      const label = stage.key === "init" ? (rarity ? `${rarity}성 1레벨` : "최초 1레벨") : stage.label;
      return { key: stage.key, label, cells, any: Object.values(cells).some(Boolean) };
    })
    .filter((stage) => stage.any); // 값이 하나도 없는 단계 칸은 안 보임
  if (!stages.length) return null;
  return { stages };
}

function renderStatTable(table) {
  const cols = table.stages.length;
  const head = `<div style="${S.statHead}">능력치</div>${table.stages.map((st) => `<div style="${S.statHead}">${esc(st.label)}</div>`).join("")}`;
  const rows = GAME_DATA.statRows
    .map((row) => {
      const item = GAME_DATA.attribute[row.key];
      const url = getIconUrl("attribute", row.key);
      const icon = url ? `<span style="${S.optionIcon}">${img(url, "", S.optionIconImg)}</span>` : "";
      const cells = table.stages
        .map((st) => {
          const v = st.cells[row.key];
          return `<div style="${S.statValue}">${v ? esc(v) + (row.unit && !v.endsWith(row.unit) ? row.unit : "") : ""}</div>`;
        })
        .join("");
      return `<div style="${S.statName}">${icon}<span>${esc(item.label)}</span></div>${cells}`;
    })
    .join("");
  return `<div class="pncwiki-stats" style="${S.statTable}grid-template-columns:minmax(120px,1.3fr) repeat(${cols},1fr);">${head}${rows}</div>`;
}

function renderSkillCard(card) {
  const cooldown = card.cooldown ? ` <span style="font-weight:400;">(쿨타임 ${esc(card.cooldown)}초)</span>` : "";
  const head = `<div style="${S.skillRow}"><span style="${S.skillBadge}background:${card.slot.color};">${esc(card.slot.label)}</span> <span style="font-weight:700;">${renderMarkup(card.name, false)}</span>${cooldown}</div>`;
  const desc = card.desc ? `<div style="${S.skillRow}">${renderMarkup(card.desc, true)}</div>` : "";
  const pre = prechargeText(card.precharge);
  const preRow = pre ? `<div style="${S.skillRow}">${esc(pre)}</div>` : "";
  const cut = card.cutscene
    ? `<details class="pncwiki-skill-fold" style="${S.skillRow}display:block;"><summary style="${S.skillFoldTitle}text-align:left;">[ 궁극기 컷씬 ]</summary><div style="padding-top:8px;">${img(card.cutscene, "궁극기 컷씬", S.illImage)}</div></details>`
    : "";
  const levels = card.levels.length
    ? `<details class="pncwiki-skill-fold" style="display:block;border-top:1px solid ${C.infoLine};"><summary style="${S.skillFoldTitle}">[ 모든 레벨 효과 ]</summary><div style="${S.skillLevelTable}"><div style="${S.skillLevelHead}">레벨</div><div style="${S.skillLevelHead}">효과</div>${card.levels
        .map((line, i) => `<div style="${S.skillLevelNum}">${i + 1}</div><div style="${S.skillLevelText}">${line ? renderMarkup(line, true) : ""}</div>`)
        .join("")}</div></details>`
    : "";
  return `
<div class="pncwiki-skill" style="${S.skillCard}">
  <div style="${S.skillTop}">
    <div style="${S.skillIcon}">${card.icon ? img(card.icon, card.name, S.skillIconImg) : ""}</div>
    <div style="${S.skillBody}">${head}${desc}${preRow}${cut}</div>
  </div>${levels}
</div>`;
}

function renderPerformance(state, section) {
  return section.subs
    .map((group) => {
      if (group.key === "engraving") return renderEngraving(state, group);
      if (group.key === "review") return renderReview(state, group);
      return renderPerformanceBasic(state, group);
    })
    .join("");
}

function renderReview(state, node) {
  return `
<details class="pncwiki-perf-group" id="${node.anchor}" open style="${S.skinFold}">
  ${foldHeading(node)}
  ${getReviewParagraphs(state).map((p) => `<div style="${S.reviewParagraph}">${renderMarkup(p, false)}</div>`).join("")}
</details>`;
}

function renderPerformanceBasic(state, group) {
  const cards = getSkillCards(state);
  const parts = [];
  let i = 0;
  const stats = getStatTable(state);
  if (stats) {
    const node = group.children[i++];
    parts.push(`
  <details class="pncwiki-perf" id="${node.anchor}" open style="${S.skinFold}">
    ${foldHeading(node)}
    ${renderStatTable(stats)}
  </details>`);
  }
  if (cards.length) {
    const node = group.children[i++];
    parts.push(`
  <details class="pncwiki-perf" id="${node.anchor}" open style="${S.skinFold}">
    ${foldHeading(node)}
    ${cards.map(renderSkillCard).join("")}
  </details>`);
  }
  return `
<details class="pncwiki-perf-group" id="${group.anchor}" open style="${S.skinFold}">
  ${foldHeading(group)}
  ${parts.join("")}
</details>`;
}

/* ---------- 3.2 무장각인 ---------- */
// 각인강화 Lv 값: 공통 성장곡선 (GAME_DATA.engravingSteps / engravingFrac). 저장된 Lv.30 총량에서 계산만 함 (랜덤 없음)

// "1,234" / " 81 " → 숫자, 빈칸·숫자 아님 → null
function parseEngravingTotal(raw) {
  const m = /^\s*(\d+)\s*$/.exec(String(raw == null ? "" : raw).replace(/,/g, ""));
  return m ? Number(m[1]) : null;
}

function engravingValue(total, key, level) {
  const count = GAME_DATA.engravingSteps[key].filter((l) => l <= level).length;
  return count ? Math.round(total * GAME_DATA.engravingFrac[count - 1]) : 0;
}

// 무장각인 내용: 하나도 없으면 null (문단 자체가 안 나옴)
function getEngraving(state) {
  const perf = isObj(state.performance) ? state.performance : {};
  const eng = isObj(perf.engraving) ? perf.engraving : {};
  const skills = isObj(perf.skills) ? perf.skills : {};
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const list = Array.isArray(eng.breakthroughs) ? eng.breakthroughs : [];
  const breakthroughs = GAME_DATA.breakthroughStages
    .map((stage, i) => {
      const raw = isObj(list[i]) ? list[i] : {};
      const slot =
        GAME_DATA.skillSlots.find((s) => s.key === raw.target) || (raw.target === GAME_DATA.breakthroughEtc.key ? GAME_DATA.breakthroughEtc : null);
      const skill = slot && isObj(skills[slot.key]) ? skills[slot.key] : {};
      return { stage, slot, icon: getImageSrc(skill.icon), name: str(raw.name), desc: str(raw.desc) };
    })
    .filter((bt) => bt.name || bt.desc); // 이름도 설명도 없는 단계는 생략
  const enh = isObj(eng.enhancement) ? eng.enhancement : {};
  const rawTotals = isObj(enh.totals) ? enh.totals : {};
  const totals = Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, parseEngravingTotal(rawTotals[key])]));
  const hasTotals = Object.values(totals).some((v) => v != null);
  const name = str(eng.name);
  const quote = str(eng.quote);
  const image = getImageSrc(eng.image);
  if (!name && !quote && !image && !breakthroughs.length && !hasTotals) return null;
  return { name, quote, image, breakthroughs, totals: hasTotals ? totals : null };
}

function renderBreakthrough(bt) {
  const badge = bt.slot ? `<span style="${S.skillBadge}background:${bt.slot.color};">${esc(bt.slot.label)}</span> ` : "";
  const head = bt.name || badge ? `<div style="${S.skillRow}">${badge}<span style="font-weight:700;">${renderMarkup(bt.name, false)}</span></div>` : "";
  const desc = bt.desc ? `<div style="${S.skillRow}border-bottom:0;">${renderMarkup(bt.desc, true)}</div>` : "";
  const body = `<div style="${S.skillBody}">${head}${desc}</div>`;
  const inner = bt.icon
    ? `<div style="${S.skillTop}"><div style="${S.skillIcon}">${img(bt.icon, bt.name, S.skillIconImg)}</div>${body}</div>`
    : body;
  return `<div class="pncwiki-breakthrough" style="${S.skillCard}"><div style="${S.engraveStage}">각인돌파 ${esc(bt.stage)}</div>${inner}</div>`;
}

function renderEngravingTable(totals) {
  const keys = GAME_DATA.engravingRows;
  const grid = `${S.engraveGrid}grid-template-columns:56px repeat(${keys.length},1fr);`;
  const heads = keys
    .map((key) => {
      const url = getIconUrl("attribute", key);
      const icon = url ? `<span style="${S.optionIcon}">${img(url, "", S.optionIconImg)}</span>` : "";
      return `<div style="${S.engraveHead}">${icon}<span>${esc(GAME_DATA.attribute[key].label)}</span></div>`;
    })
    .join("");
  const row = (level, cellStyle) =>
    `<div style="${S.engraveLv}">${level}</div>${keys
      .map((key) => `<div style="${cellStyle}">${totals[key] == null ? "" : engravingValue(totals[key], key, level)}</div>`)
      .join("")}`;
  const all = Array.from({ length: GAME_DATA.engravingMaxLevel }, (_, i) => row(i + 1, S.engraveCell)).join("");
  return `
<div class="pncwiki-engrave-table" style="${S.engraveWrap}"><div style="${S.engraveBox}">
  <div style="${grid}"><div style="${S.engraveHead}">Lv.</div>${heads}${row(GAME_DATA.engravingMaxLevel, S.engraveMax)}</div>
  <details class="pncwiki-engrave-fold" style="display:block;border-top:1px solid ${C.cardBorder};"><summary style="${S.skillFoldTitle}">[ Lv.1 ~ ${GAME_DATA.engravingMaxLevel} 전체 보기 ]</summary><div style="${grid}border-top:1px solid ${C.infoLine};">${all}</div></details>
</div></div>`;
}

function renderEngraving(state, group) {
  const eng = getEngraving(state);
  if (!eng) return "";
  const image = eng.image ? `<div style="${S.engraveImageBox}">${img(eng.image, eng.name, S.skinImage)}</div>` : "";
  const name = eng.name ? `<div style="${S.engraveName}">${esc(eng.name)}</div>` : "";
  const quote = eng.quote ? `<div style="${S.engraveQuote}">${escMultiline(eng.quote)}</div>` : "";
  const card = image || name || quote ? `<div class="pncwiki-engrave" style="${S.engraveCard}">${image}${name}${quote}</div>` : "";
  const parts = [];
  let i = 0;
  if (eng.breakthroughs.length) {
    const node = group.children[i++];
    parts.push(`
  <details class="pncwiki-perf" id="${node.anchor}" open style="${S.skinFold}">
    ${foldHeading(node)}
    ${eng.breakthroughs.map(renderBreakthrough).join("")}
  </details>`);
  }
  if (eng.totals) {
    const node = group.children[i++];
    parts.push(`
  <details class="pncwiki-perf" id="${node.anchor}" open style="${S.skinFold}">
    ${foldHeading(node)}
    ${renderEngravingTable(eng.totals)}
  </details>`);
  }
  return `
<details class="pncwiki-perf-group" id="${group.anchor}" open style="${S.skinFold}">
  ${foldHeading(group)}
  ${card}${parts.join("")}
</details>`;
}

/* ---------- 8.2 일러스트 ---------- */
// 스탠딩 CG / 일러스트 CG(메인·전속 → 일반) / 감정 표현 — 내용 있는 것만, 순서대로 번호

// 이미지 목록: 쓸 수 있는 주소만 (http/https, 직접 넣은 이미지)
function cleanImageList(list) {
  return (Array.isArray(list) ? list : []).map(getImageSrc).filter(Boolean);
}

// 제목 + 이미지 항목: 제목이나 이미지가 있는 것만
function getTitledImageItems(list, field) {
  return (Array.isArray(list) ? list : [])
    .filter(isObj)
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      images: field === "image" ? cleanImageList([item.image]) : cleanImageList(item.images),
    }))
    .filter((item) => item.title || item.images.length);
}

// 감정 표현 묶음: 결과 그림(256×256)이 하나라도 있는 묶음만. 제목 = 기본 / 연결된 스킨 이름
function getExpressionGroups(state) {
  const expr = isObj(state.expression) ? state.expression : {};
  const groups = Array.isArray(expr.groups) ? expr.groups : [];
  const skins = isObj(state.skin) && Array.isArray(state.skin.items) ? state.skin.items : [];
  return groups
    .filter(isObj)
    .map((group) => {
      let title = "";
      if (group.source === "base") title = "기본";
      else if (group.source) {
        const skin = skins.find((item) => isObj(item) && item.id === group.source);
        title = skin ? (typeof skin.name === "string" && skin.name.trim()) || (typeof skin.theme === "string" ? skin.theme.trim() : "") : "";
      }
      const images = (Array.isArray(group.images) ? group.images : [])
        .filter(isObj)
        .map((image) => getImageSrc(image.result))
        .filter(Boolean);
      return { title, images };
    })
    .filter((group) => group.images.length);
}

function getIllustrationParts(state) {
  const ill = isObj(state.illustration) ? state.illustration : {};
  const cg = isObj(ill.cg) ? ill.cg : {};
  const parts = [];
  const standing = getTitledImageItems(ill.standing, "image");
  if (standing.length) parts.push({ key: "standing", title: "스탠딩 CG", items: standing });
  const groups = [];
  const story = getStoryTypeItem(state);
  if (story) {
    const items = getTitledImageItems(cg.story, "images");
    if (items.length) groups.push({ title: story.short, items });
  }
  const events = getTitledImageItems(cg.event, "images");
  if (events.length) groups.push({ title: "일반", items: events });
  if (groups.length) parts.push({ key: "cg", title: "일러스트 CG", groups });
  const expressions = getExpressionGroups(state);
  if (expressions.length) parts.push({ key: "expression", title: "감정 표현", expressions });
  return parts;
}

// "• 제목" 줄 (제목 없으면 줄 없음)
function bulletTitle(title) {
  return title ? `<div style="${S.illBullet}"><span style="${S.relationBullet}">•</span><span>${esc(title)}</span></div>` : "";
}

function renderTitledImages(items) {
  return items
    .map((item) => `${bulletTitle(item.title)}${item.images.map((src) => `<div style="${S.illImageBox}">${img(src, item.title, S.illImage)}</div>`).join("")}`)
    .join("");
}

function renderIllustration(state, node) {
  const tone = getVoiceTone(state);
  const parts = getIllustrationParts(state);
  const body = parts
    .map((part, i) => {
      const sub = node.children[i];
      let inner = "";
      if (part.key === "standing") inner = renderTitledImages(part.items);
      if (part.key === "cg") {
        inner = part.groups
          .map((group, j) => `
    <details class="pncwiki-ill" id="${sub.children[j].anchor}" open style="${S.skinFold}">
      ${foldHeading(sub.children[j])}
      ${renderTitledImages(group.items)}
    </details>`)
          .join("");
      }
      if (part.key === "expression") {
        inner = part.expressions
          .map(
            (group) =>
              `${bulletTitle(group.title)}<div style="${S.exprGrid}">${group.images
                .map((src) => `<div style="${S.exprCell}border-color:${tone};">${img(src, group.title, S.exprImage)}</div>`)
                .join("")}</div>`
          )
          .join("");
      }
      return `
  <details class="pncwiki-ill" id="${sub.anchor}" open style="${S.skinFold}">
    ${foldHeading(sub)}
    ${inner}
  </details>`;
    })
    .join("");
  return `
<details class="pncwiki-ill-group" id="${node.anchor}" open style="${S.skinFold}">
  ${foldHeading(node)}
  ${body}
</details>`;
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

// 링크 표기 (Carrd와 같은 모양): "[글자](https://주소)" → 글자에 링크. 주소가 올바르지 않으면 글자만
// 한 칸에 여러 개 가능 ("[A](주소), [B](주소)"). 나머지 글은 그대로
const LINK_MARK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function renderLinkText(text) {
  let out = "";
  let last = 0;
  String(text).replace(LINK_MARK, (all, label, url, at) => {
    out += esc(text.slice(last, at));
    const href = safeLinkUrl(url);
    out += href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="${S.link}">${esc(label)}</a>` : esc(label);
    last = at + all.length;
    return all;
  });
  return out + esc(text.slice(last));
}

// 링크 표기를 뺀 글자만 (입력창 카드 제목 등)
function stripLinkMarks(text) {
  return String(text).replace(LINK_MARK, "$1");
}

// "관계명 - 인물명" / 관계명만 / 인물명만 (구분자는 둘 다 있을 때만). 항목 0개면 문단 제목만.
// 인물명은 링크 표기 가능 (다른 사람 OC 문서로 이어 주기)
function renderRelationship(state) {
  const items = getRelationshipItems(state);
  if (!items.length) return "";
  const lines = items
    .map((item) => {
      const person = item.person ? `<span style="${S.relationPerson}">${renderLinkText(item.person)}</span>` : "";
      const relation = item.relation ? `<span style="${S.relationName}">${esc(item.relation)}${person ? " -" : ""}</span>` : "";
      const text = [relation, person].filter(Boolean).join(" ");
      return `<div style="${S.relationItem}"><span style="${S.relationBullet}">•</span><span>${text}</span></div>`;
    })
    .join("");
  return `<div class="pncwiki-relationship" style="${S.relationList}">${lines}</div>`;
}

/* ---------- 대사 (기본 보이스) ---------- */
// 고정 칸 (GAME_DATA.voiceSlots 순서). 빈 칸도 줄은 남김. fixed 칸(타이틀 콜)은 정해진 글
// 대사 표 머리 색 = 소속 회사 색을 어둡게 (얼터너티브스는 42LAB 색). 회사 없으면 기본 진회색
function toneDown(hex, factor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return C.storyHead;
  const n = parseInt(m[1], 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * factor).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

function getVoiceTone(state) {
  let company = getItem("company", isObj(state.profile) ? state.profile.company : "");
  if (company && company.toneFrom) company = getItem("company", company.toneFrom);
  return company ? toneDown(company.color, 0.55) : C.storyHead;
}

// 스킨 보이스 세트 (문서에 나올 것만: 연결된 스킨 이름이 있거나 대사가 하나라도 있음)
function getVoiceSets(state) {
  const voice = isObj(state.voice) ? state.voice : {};
  const sets = Array.isArray(voice.sets) ? voice.sets : [];
  const skins = isObj(state.skin) && Array.isArray(state.skin.items) ? state.skin.items : [];
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return sets
    .filter(isObj)
    .map((set) => {
      const skin = skins.find((item) => isObj(item) && item.id && item.id === set.skinId && Array.isArray(item.effects) && item.effects.includes("voice"));
      const name = skin ? str(skin.name) || str(skin.theme) : "";
      const lines = isObj(set.lines) ? set.lines : {};
      const count = Number(set.dialogues) || GAME_DATA.skinVoiceDialogueMax;
      const rows = GAME_DATA.skinVoiceSlots
        .filter((slot) => !slot.dialogue || slot.dialogue <= count)
        .map((slot) => ({ slot, text: str(lines[slot.key]) }))
        .filter((row) => row.text);
      return { name, rows, headingText: name ? `'${name}' 투영 보이스 세트` : "투영 보이스 세트" };
    })
    .filter((set) => set.name || set.rows.length);
}

function renderVoiceRow(label, code, text) {
  return `
  <div style="${S.voiceRow}">
    <div style="${S.voiceLabel}"><div style="${S.voiceName}">${esc(label)}</div><div style="${S.voiceCode}">${esc(code)}</div></div>
    <div style="${S.voiceText}"><div>${text ? escMultiline(text) : ""}</div></div>
  </div>`;
}

function renderVoiceSet(set, sub, tone) {
  const name = set.name ? `<span style="${S.skinTheme}">${esc(set.name)}</span>` : "";
  const desc = set.name ? `<div style="${S.voiceSetDesc}">${name} 투영으로 추가되는 보이스 세트이다.</div>` : "";
  const table = set.rows.length
    ? `
<div class="pncwiki-voice" style="${S.voice}">
  <div style="${S.voiceHead}background:${tone};">${set.name ? `'${esc(set.name)}' 투영 보이스` : "투영 보이스"}</div>${set.rows
        .map((row) => renderVoiceRow(row.slot.label, row.slot.code, row.text))
        .join("")}
</div>`
    : "";
  return `
<details class="pncwiki-voice-set" id="${sub.anchor}" style="${S.skinFold}">
  <summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${sub.number}.</span> ${esc(set.headingText)}</summary>
  ${desc}${table}
</details>`;
}

function renderVoice(state, section) {
  const tone = getVoiceTone(state);
  return renderBaseVoice(state, tone) + getVoiceSets(state).map((set, i) => renderVoiceSet(set, section.subs[i], tone)).join("");
}

// 기본 보이스 (안 쓴 칸도 줄은 남기고 빈칸)
function renderBaseVoice(state, tone) {
  const voice = isObj(state.voice) ? state.voice : {};
  const rows = GAME_DATA.voiceSlots
    .map((slot) => renderVoiceRow(slot.label, slot.code, slot.fixed || (typeof voice[slot.key] === "string" ? voice[slot.key].trim() : "")))
    .join("");
  return `
<div class="pncwiki-voice" style="${S.voice}margin-bottom:28px;">
  <div style="${S.voiceHead}background:${tone};">기본 보이스</div>${rows}
</div>`;
}

/* ---------- 기타 ---------- */
// 자유 • 목록 (일반 글만, 빈 항목 건너뜀). 항목 0개면 문단 제목만
function renderEtc(state) {
  const items = isObj(state.etc) && Array.isArray(state.etc.items) ? state.etc.items : [];
  const lines = items
    .filter(isObj)
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .map((text) => `<div style="${S.etcItem}"><span style="${S.relationBullet}">•</span><span style="${S.etcText}">${escMultiline(text)}</span></div>`)
    .join("");
  return lines ? `<div class="pncwiki-etc" style="${S.etcList}">${lines}</div>` : "";
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

// 이미지 src 검사: http/https 주소(safeLinkUrl) 또는 직접 넣은 이미지(data:image/png|jpeg|webp|gif;base64,…)
// 통과하면 그대로, 아니면 ""
function getImageSrc(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(text)) return text;
  return safeLinkUrl(text);
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

// 등장 스토리 (메인/전속) — 없으면 null
function getStoryTypeItem(state) {
  const key = isObj(state.profile) ? state.profile.storyType : "";
  return (key && GAME_DATA.storyType[key]) || null;
}

function renderHistoryItem(item, sub, small) {
  const summary = item.summary.trim();
  return `
<details class="pncwiki-subsection" id="${sub.anchor}" open style="${S.subSection}display:block;">
  <summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}${small ? S.skinItemHeading : ""}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${sub.number}.</span> ${esc(item.title.trim())}</summary>
  ${renderHistoryLink(item)}${summary ? `<div style="${S.paragraph}">${escMultiline(summary)}</div>` : ""}
</details>`;
}

function renderHistory(state, section) {
  const items = getHistoryItems(state);
  const group = section.subs[0];
  if (group && group.children.length) {
    return `
<details class="pncwiki-subsection" id="${group.anchor}" open style="${S.subSection}display:block;">
  <summary class="pncwiki-subheading" style="${S.skinSummary}${S.subHeading}"><span style="${S.subHeadingArrow}">▽</span><span style="${S.headingNumber}">${group.number}.</span> ${esc(group.title)}</summary>
  ${items.map((item, i) => renderHistoryItem(item, group.children[i], true)).join("")}
</details>`;
  }
  return items.map((item, i) => renderHistoryItem(item, section.subs[i], false)).join("");
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
  return { prefix: str(oath.titlePrefix), suffix: str(oath.titleSuffix), description: str(oath.description) };
}

// 칭호: 적은 그대로 "칭호 · 수식어" / "칭호 · 단어" (비어 있는 쪽은 이미지까지 통째로 생략)
function getOathTitleParts(state) {
  const { prefix, suffix } = getOath(state);
  return { left: prefix ? `칭호 · ${prefix}` : "", right: suffix ? `칭호 · ${suffix}` : "" };
}

// 글자만 (입력 화면 미리보기용)
function getOathTitleText(state) {
  const p = getOathTitleParts(state);
  return [p.left, p.right].filter(Boolean).join("   ");
}

function renderOath(state) {
  const { description } = getOath(state);
  const parts = getOathTitleParts(state);
  const icon = (key) => img(assetUrl(GAME_DATA.oathTitle[key]), "", S.oathIcon);
  const left = parts.left ? `<span style="${S.oathPart}">${icon("prefix")}<span>${esc(parts.left)}</span></span>` : "";
  const right = parts.right ? `<span style="${S.oathPart}">${icon("suffix")}<span>${esc(parts.right)}</span></span>` : "";
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
    `<details class="pncwiki-section" id="${sectionAnchor(section.key)}" open style="${S.section}display:block;">${renderHeading(section)}${body}</details>`
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
