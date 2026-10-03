/* =========================================================
   PNC WIKI Generator — script.js
   구조:
   1. 기본 설정 / 기본값(DEFAULT_STATE)
   2. state 도구 (경로 읽기·쓰기, 기본값 병합)
   3. 불러오기 / 버전 변환(migration)
   4. 저장 (localStorage, JSON 파일)
   5. 입력 폼 ↔ state 연결 (data-field)
   6. 미리보기 그리기 (문서 자체는 renderer.js)
   7. 이벤트 연결 / 시작
   ========================================================= */

/* ---------- 1. 기본 설정 / 기본값 ---------- */

const APP_ID = "pnc_wiki_generator";

const ALGORITHM_SLOTS = 3; // 구역당 추천 알고리즘 칸 수
const ALGORITHM_SUBS = 2; // 알고리즘 하나의 부 옵션 수 (게임 기준 최대 2)
const ALGORITHM_SHARED_MAINS = 2; // 구역 공통 주 옵션 수 (추천은 최대 2개까지)
const ALGORITHM_TYPES = ["offense", "stability", "special"];

// custom: false면 구역 공통 옵션을 따르고, true면 이 칸의 main/sub를 쓴다
function emptyAlgorithmSlot() {
  return { key: "", custom: false, main: "", sub: ["", ""] };
}

function emptySkinBase() {
  return { name: "", image: "", illustrator: "", effects: [], quote: "" };
}

function emptyAlgorithmZone() {
  return { main: ["", ""], sub: ["", ""], slots: emptyAlgorithmSlots() };
}

function emptyAlgorithmSlots() {
  return [emptyAlgorithmSlot(), emptyAlgorithmSlot(), emptyAlgorithmSlot()];
}
const CURRENT_VERSION = 5;
const STORAGE_KEY = "pnc_wiki_generator_autosave";

// 사용자가 입력·선택하는 값만 둔다. (표시 이름, 번호 등 계산 가능한 값은 저장하지 않음)
// 필드를 "추가"할 때는 여기에만 넣으면 된다. 버전은 올리지 않아도 됨.
const DEFAULT_STATE = {
  profile: {
    name: "",
    names: {
      cn: "", // 중국어명
      jp: "", // 일본어명
      en: "", // 영어명  (※ 언어 키. 성우 국가 키와 별개)
    },
    job: "",
    model: "",
    company: "", // GAME_DATA.company 키
    class: "", // GAME_DATA.class 키
    positions: [], // GAME_DATA.position 키, 고른 순서대로 (최대 MAX_POSITIONS개)
    rarity: "", // "1" | "2" | "3"
    birthday: {
      month: "", // "1" ~ "12"
      day: "", // "1" ~ "31"
      unknown: false,
    },
    voiceActor: {
      name: "",
      country: "", // GAME_DATA.country 키 (jp / kr / cn / us)
    },
    illustrator: "",
    history: "",
    storyType: "", // "" | "main" | "exclusive" (GAME_DATA.storyType) — 작중 행적·일러스트 CG 분류
  },
  overview: {
    quote: "",
    image: "", // 1. 개요 대표 이미지 (파일 또는 주소, 선택)
    video: "", // 유튜브 주소 (선택) — 이미지가 없을 때 썸네일 + 링크로 나옴
  },
  // 성능 > 기본: 스킬 3종 + 평가 (능력치는 별도 작업 중)
  //   levels = 1레벨 효과 글 ({처음~끝} 등은 레벨마다 자동 계산), overrides = 레벨별로 직접 고친 글 ("" = 자동)
  performance: {
    skills: Object.fromEntries(
      GAME_DATA.skillSlots.map((slot) => [
        slot.key,
        {
          icon: "",
          name: "",
          desc: "",
          ...(slot.cooldown ? { cooldown: "" } : {}),
          ...(slot.precharge ? { precharge: { base: "", star3: "", star5: "" } } : {}),
          ...(slot.cutscene ? { cutscene: "" } : {}),
          levels: "",
          overrides: Array(slot.levels).fill(""),
        },
      ])
    ),
    review: { added: false, text: "" }, // 평가: 「+ 평가 추가」로 생김
    // 능력치: 자동생성(또는 직접 입력)한 실제 숫자만 저장. 단계 init/s60/s70 × GAME_DATA.statRows 키 ("" = 빈칸)
    //   basis = 마지막으로 생성할 때의 조건 (바뀌면 안내만, 자동으로 다시 만들지 않음)
    //   edited = 생성 뒤 직접 고친 칸이 있는지 (다시 생성 때 확인용)
    stats: {
      mode: "atk", // atk | hash | twin
      values: Object.fromEntries(
        GAME_DATA.statStages.map((stage) => [stage.key, Object.fromEntries(GAME_DATA.statRows.map((row) => [row.key, ""]))])
      ),
      basis: { class: "", rarity: "", mode: "" },
      edited: false,
    },
    // 3.2 무장각인: 내용이 있으면 문서에 나옴 (켜기 스위치 없음)
    //   breakthroughs = 각인돌파 I·II·III (target: passive|auto|ultimate|etc|"")
    //   enhancement.totals = 각인강화 Lv.30 총량 7개만 저장 (Lv.1~30 표는 공통 성장곡선으로 출력 때 계산)
    //   enhancement.basis = 생성 당시 5성 70레벨 능력치·공격 방식 (바뀌면 안내만)
    engraving: {
      name: "",
      image: "",
      quote: "",
      breakthroughs: GAME_DATA.breakthroughStages.map(() => ({ target: "", name: "", desc: "" })),
      enhancement: {
        totals: Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, ""])),
        basis: { mode: "", values: Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, ""])) },
        edited: false,
      },
    },
  },
  // 추천 알고리즘: 구역마다 알고리즘 3칸, 칸마다 주 옵션 1개 + 부 옵션 2개
  // (이름·이미지·세트 효과·수치는 GAME_DATA. 여기에는 고른 키만)
  algorithm: {
    offense: emptyAlgorithmZone(),
    stability: emptyAlgorithmZone(),
    special: emptyAlgorithmZone(),
    // slot = { key: 알고리즘 키, main: 주 옵션 attribute 키, sub: [부 옵션1, 부 옵션2] } ("" = 미선택)
  },
  // 친밀도: 고른 키만 저장. 수치·문장·이미지·등급은 GAME_DATA에서 가져옴
  intimacy: {
    // GAME_DATA.intimacy 키 3칸. 칸 순서 = 문서 번호 1·2·3 ("" = 빈 칸)
    // 서약 스킬(한마음의 빛)은 문서 맨 위에 항상 고정 표시라 저장하지 않음
    skills: ["", "", ""],
    gifts: {
      like: [], // GAME_DATA.gift 키 목록 (좋아하는 선물)
      hate: [], // GAME_DATA.gift 키 목록 (싫어하는 선물)
      // 보통 = 둘 다 아닌 나머지 전부 (따로 저장하지 않음)
    },
    // 서약 칭호·설명. 문서에는 "[이미지] 칭호 · 수식어  [이미지] 칭호 · 단어"
    oath: {
      titlePrefix: "", // 칭호 수식어 (예: 누구의) — 적은 그대로 출력
      titleSuffix: "", // 칭호 단어 (예: 무언가)
      description: "", // 서약 설명 (한 줄)
    },
  },
  // 스토리: 고정 10칸의 본문만 (칸 이름·순서·개방 Lv은 GAME_DATA.storySlots)
  story: Object.fromEntries(GAME_DATA.storySlots.map((slot) => [slot.key, ""])),
  // 작중 행적: 하위 문단 목록. 번호(7.1 …)는 renderer가 계산, 저장하지 않음
  history: {
    items: [], // { title, linkUrl, linkText, summary }
  },
  // 스킨: 기본 3칸(고정) + 스킨 테마(자유 목록). 번호(8.1.1 …)는 renderer가 계산
  //   image = 이미지 주소(http/https) 또는 직접 넣은 이미지(data:image/…)
  //   effects = GAME_DATA.skinEffect 키 배열
  skin: {
    // 입수방법·설명은 GAME_DATA.skinBase 고정 글. 이미지는 프로필 카드와 같이 씀
    base: Object.fromEntries(GAME_DATA.skinBase.map((slot) => [slot.key, emptySkinBase()])),
    items: [], // 스킨 테마 { theme, name, image, illustrator, acquisition, effects: [], description, quote }
  },
  // 인형 관계: 자유 목록 (관계명·인물명 모두 직접 입력. 예시는 입력 화면 안내일 뿐)
  relationship: {
    items: [], // { relation, person }
  },
  // 대사(기본 보이스): 고정 21칸의 대사만 (칸 이름·코드·순서는 GAME_DATA.voiceSlots)
  //   sets = 스킨 보이스 세트 { skinId, dialogues(1~3), lines: { GAME_DATA.skinVoiceSlots key: "" } }
  voice: {
    ...Object.fromEntries(GAME_DATA.voiceSlots.map((slot) => [slot.key, ""])),
    sets: [],
  },
  // 8.2 일러스트 (이미지 = 주소 또는 직접 넣은 이미지)
  illustration: {
    standing: [], // 스탠딩 CG { title, image }
    cg: {
      story: [], // 메인 또는 전속 CG (등장 스토리를 골랐을 때만) { title, images: [] }
      event: [], // 일반 (이벤트 스토리) CG { title, images: [] }
    },
  },
  // 감정 표현: 묶음 { source: "base" | 스킨 id, images: [{ source, w, h, cx, cy, size, result }] }
  //   source = 원본(줄인 것), cx·cy = 영역 가운데(0~1), size = 영역 한 변(짧은 변 대비 0~1), result = 256×256 결과
  //   lastArea = 마지막으로 맞춘 영역 → 다음에 넣는 그림에 같은 위치·크기로 적용
  expression: {
    groups: [],
    lastArea: { cx: 0.5, cy: 0.3, size: 0.5 },
  },
  // 기타: 자유 • 목록
  etc: {
    items: [], // { text }
  },
  // 켜고 끌 수 있는 문단만. (고정 문단은 SECTION_DEFS의 fixed — 작중 행적은 필수 문단)
  // 작성할지 고르는 문단 (기본 켜짐). 꺼도 써 둔 내용은 그대로 두고 문서에서만 뺌
  //   weapon = 3.2 무장각인 / history = 작중 행적. 스토리(친밀도)는 필수라 없음
  sections: {
    weapon: true,
    history: true,
  },
};

// 문단 순서·제목(SECTION_DEFS)과 문서 그리기는 renderer.js에 있음.

// 목록형 입력 등록부 (5-1 참고). 경로 → 목록 정의
const LIST_DEFS = {};

const MAX_POSITIONS = 2; // 포지션 최대 선택 수
const INTIMACY_SLOTS = 3; // 선택 친밀도 스킬 칸 수 (서약 스킬 제외)

let state = cloneDefaults();

/* ---------- 2. state 도구 ---------- */

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

// 빈 새 문서 (고정 칸 목록은 칸 수만큼 채운 상태)
function freshState() {
  return normalizeState(cloneDefaults());
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// "profile.birthday.month" 같은 경로로 값 읽기
function getPath(obj, path) {
  return path.split(".").reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}

// 경로로 값 쓰기
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((cur, key) => {
    if (cur[key] === null || typeof cur[key] !== "object") cur[key] = {};
    return cur[key];
  }, obj);
  target[last] = value;
}

// 기본값 위에 불러온 값을 덮어쓴다.
// - 기본값에 없는 항목은 버림
// - 빠진 항목은 기본값으로 채움
// - 종류(글자/참거짓)가 다른 값은 버림
function mergeWithDefaults(defaults, data) {
  const result = {};
  Object.keys(defaults).forEach((key) => {
    const def = defaults[key];
    const val = isPlainObject(data) ? data[key] : undefined;

    if (isPlainObject(def)) {
      result[key] = mergeWithDefaults(def, val);
    } else if (Array.isArray(def)) {
      result[key] = Array.isArray(val) ? val.slice() : def.slice();
    } else if (typeof val === typeof def) {
      result[key] = val;
    } else {
      result[key] = def;
    }
  });
  return result;
}

/* ---------- 3. 불러오기 / 버전 변환 ---------- */

// v0 = 구조 개편 전 평면 저장 형식
const V0_KEYS = [
  "name", "job", "model", "company", "classType",
  "birthdayMonth", "birthdayDay", "birthdayUnknown", "history", "quote",
];

// v0에서 기업·클래스는 한국어 이름으로 저장됐었다 → 키로 바꿈
function labelToKey(category, label) {
  const entries = Object.entries(GAME_DATA[category] || {});
  const found = entries.find(([, item]) => item.label === label);
  return found ? found[0] : "";
}

function numberOnly(text) {
  const n = parseInt(String(text || ""), 10);
  return Number.isNaN(n) ? "" : String(n);
}

const MIGRATIONS = {
  // v0 → v1
  0: (old) => ({
    app: APP_ID,
    version: 1,
    profile: {
      name: old.name || "",
      job: old.job || "",
      model: old.model || "",
      company: labelToKey("company", old.company),
      class: labelToKey("class", old.classType),
      birthday: {
        month: numberOnly(old.birthdayMonth),
        day: numberOnly(old.birthdayDay),
        unknown: Boolean(old.birthdayUnknown),
      },
      history: old.history || "",
    },
    overview: {
      quote: old.quote || "",
    },
  }),
  // v1 → v2: 포지션이 단일값(position)에서 복수값(positions)으로 바뀜
  1: (old) => {
    const next = { ...old, version: 2 };
    const profile = { ...(isPlainObject(old.profile) ? old.profile : {}) };
    if (!Array.isArray(profile.positions)) {
      profile.positions = typeof profile.position === "string" && profile.position ? [profile.position] : [];
    }
    delete profile.position;
    next.profile = profile;
    return next;
  },
  // v2 → v3: 추천 알고리즘 주/부 옵션이 "구역 하나"에서 "알고리즘 칸마다"로 바뀜
  //   구역의 주/부 옵션은 그 구역에서 처음 채워진 알고리즘 칸으로 옮김 (부 옵션은 앞 2개)
  2: (old) => {
    const next = { ...old, version: 3 };
    const algorithm = isPlainObject(old.algorithm) ? old.algorithm : {};
    next.algorithm = {};
    ["offense", "stability", "special"].forEach((type) => {
      const zone = isPlainObject(algorithm[type]) ? algorithm[type] : {};
      const keys = Array.isArray(zone.slots) ? zone.slots : [];
      const firstFilled = keys.findIndex((k) => typeof k === "string" && k);
      const target = firstFilled === -1 ? 0 : firstFilled;
      const sub = Array.isArray(zone.sub) ? zone.sub.filter((k) => typeof k === "string").slice(0, 2) : [];
      next.algorithm[type] = {
        slots: [0, 1, 2].map((i) => ({
          key: typeof keys[i] === "string" ? keys[i] : "",
          main: i === target && typeof zone.main === "string" ? zone.main : "",
          sub: i === target ? sub : [],
        })),
      };
    });
    return next;
  },
  // v3 → v4: 구역 공통 옵션(주 최대 2·부 최대 2) + 칸별 "따로 설정"(custom) 추가
  //   알고리즘이 있는 칸들의 옵션이 전부 같으면 → 공통 옵션으로 합침
  //   하나라도 다르면 → 알고리즘이 있는 칸은 각자 "따로 설정"으로 유지
  3: (old) => {
    const next = { ...old, version: 4 };
    const algorithm = isPlainObject(old.algorithm) ? old.algorithm : {};
    const str = (v) => (typeof v === "string" ? v : "");
    next.algorithm = {};
    ["offense", "stability", "special"].forEach((type) => {
      const zone = isPlainObject(algorithm[type]) ? algorithm[type] : {};
      const slots = (Array.isArray(zone.slots) ? zone.slots : []).slice(0, 3).map((slot) => {
        const s = isPlainObject(slot) ? slot : {};
        const sub = Array.isArray(s.sub) ? s.sub : [];
        return { key: str(s.key), main: str(s.main), sub: [str(sub[0]), str(sub[1])] };
      });
      const sign = (s) => JSON.stringify([s.main, [...s.sub].filter(Boolean).sort()]);
      const filled = slots.filter((s) => s.key);
      const withOptions = slots.filter((s) => s.main || s.sub.some(Boolean));
      const sameAll = filled.length > 0 && filled.every((s) => sign(s) === sign(filled[0]));
      let shared = null;
      if (sameAll) shared = filled[0];
      else if (!filled.length && withOptions.length) shared = withOptions[0];

      next.algorithm[type] = {
        main: shared ? [shared.main, ""] : ["", ""],
        sub: shared ? [...shared.sub] : ["", ""],
        slots: slots.map((s) => {
          const custom = !shared && Boolean(s.key);
          return custom
            ? { key: s.key, custom: true, main: s.main, sub: s.sub }
            : { key: s.key, custom: false, main: "", sub: ["", ""] };
        }),
      };
    });
    return next;
  },
  // v4 → v5: 스킨이 "기본 3칸 고정 + 스킨 테마 목록"으로 바뀜
  //   items 중 투영 종류가 기본/확장/완벽 투영인 첫 항목 → 기본 칸으로 (입수방법·설명은 고정 글이 되어 버림)
  //   나머지 → 스킨 테마 (type → theme)
  4: (old) => {
    const next = { ...old, version: 5 };
    const skin = isPlainObject(old.skin) ? old.skin : {};
    const items = Array.isArray(skin.items) ? skin.items : [];
    const str = (v) => (typeof v === "string" ? v : "");
    const baseByLabel = { "기본 투영": "basic", "확장 투영": "extended", "완벽 투영": "perfect" };
    const base = {};
    const themes = [];
    items.forEach((raw) => {
      if (!isPlainObject(raw)) return;
      const type = str(raw.type).trim();
      const key = baseByLabel[type];
      const common = {
        name: str(raw.name),
        image: str(raw.image),
        illustrator: str(raw.illustrator),
        effects: Array.isArray(raw.effects) ? raw.effects : [],
        quote: "",
      };
      if (key && !base[key]) {
        base[key] = common;
      } else {
        themes.push({ theme: str(raw.type), ...common, acquisition: str(raw.acquisition), description: str(raw.description) });
      }
    });
    next.skin = { base, items: themes };
    return next;
  },
  // 다음에 구조가 바뀌면 여기에 5: (old) => ({ ... }) 추가
};

// 어떤 데이터든 현재 state 형태로 바꿔서 돌려준다. 못 쓰는 데이터면 오류.
function normalizeData(data) {
  if (!isPlainObject(data)) {
    throw new Error("JSON 형식이 아닙니다.");
  }

  let version;

  if (data.app === APP_ID) {
    version = Number(data.version);
  } else if (data.app === undefined && V0_KEYS.some((key) => key in data)) {
    version = 0;
  } else {
    throw new Error("이 생성기에서 만든 파일이 아닙니다.");
  }

  if (!Number.isInteger(version) || version < 0) {
    throw new Error("파일 버전을 알 수 없습니다.");
  }

  if (version > CURRENT_VERSION) {
    throw new Error("더 새로운 버전의 생성기에서 만든 파일입니다. 페이지를 새로고침해 주세요.");
  }

  let converted = data;
  while (version < CURRENT_VERSION) {
    converted = MIGRATIONS[version](converted);
    version += 1;
  }

  return normalizeState(mergeWithDefaults(DEFAULT_STATE, converted));
}

// 배열 값 정리 (불러온 파일이 이상해도 화면이 깨지지 않게)
function normalizeState(st) {
  const strings = (list) => list.filter((v) => typeof v === "string");
  const unique = (list) => [...new Set(strings(list).filter(Boolean))];

  // 서약 스킬은 고정이라 칸에서 빼고, 칸이 넘치면 앞에서부터 채운 값을 남김
  const isOath = (key) => {
    const item = GAME_DATA.intimacy[key];
    return Boolean(item && item.oath);
  };
  let skills = strings(st.intimacy.skills).filter((key) => !isOath(key));
  while (skills.length > INTIMACY_SLOTS && skills[skills.length - 1] === "") {
    skills.pop(); // 뒤쪽 빈 칸부터 줄임 (칸 위치 최대한 유지)
  }
  if (skills.length > INTIMACY_SLOTS) {
    skills = skills.filter(Boolean).slice(0, INTIMACY_SLOTS);
  }
  while (skills.length < INTIMACY_SLOTS) skills.push("");
  st.intimacy.skills = skills;

  // 같은 선물이 좋아함·싫어함에 동시에 있으면 좋아함만 남김
  st.profile.positions = unique(st.profile.positions).slice(0, MAX_POSITIONS);

  // 추천 알고리즘: 칸 3개, 칸 모양 정리, 같은 구역 알고리즘 중복은 뒤 칸 비움,
  // 부 옵션은 2칸 고정 (같은 칸 안 중복은 뒤쪽 비움)
  // 공통 옵션: 주 2칸·부 2칸 고정 (중복은 뒤쪽 비움)
  const fixedList = (rawList, size) => {
    const src = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (let i = 0; i < size; i += 1) {
      const v = typeof src[i] === "string" ? src[i] : "";
      out.push(v && out.includes(v) ? "" : v);
    }
    return out;
  };
  ALGORITHM_TYPES.forEach((type) => {
    const zone = isPlainObject(st.algorithm[type]) ? st.algorithm[type] : {};
    const raw = Array.isArray(zone.slots) ? zone.slots.slice(0, ALGORITHM_SLOTS) : [];
    const seen = new Set();
    const slots = raw.map((slot) => {
      const s = isPlainObject(slot) ? slot : {};
      let key = typeof s.key === "string" ? s.key : "";
      if (key && seen.has(key)) key = "";
      if (key) seen.add(key);
      const subRaw = Array.isArray(s.sub) ? s.sub : [];
      const sub = [];
      for (let i = 0; i < ALGORITHM_SUBS; i += 1) {
        const v = typeof subRaw[i] === "string" ? subRaw[i] : "";
        sub.push(v && sub.includes(v) ? "" : v);
      }
      return { key, custom: s.custom === true, main: typeof s.main === "string" ? s.main : "", sub };
    });
    while (slots.length < ALGORITHM_SLOTS) slots.push(emptyAlgorithmSlot());
    st.algorithm[type] = {
      main: fixedList(zone.main, ALGORITHM_SHARED_MAINS),
      sub: fixedList(zone.sub, ALGORITHM_SUBS),
      slots,
    };
  });

  const like = unique(st.intimacy.gifts.like);
  st.intimacy.gifts.like = like;
  st.intimacy.gifts.hate = unique(st.intimacy.gifts.hate).filter((key) => !like.includes(key));

  // 기본 스킨 적용범위: 아는 키만, 정의 순서, 같이 못 고르는 것 정리
  GAME_DATA.skinBase.forEach((slot) => {
    const item = st.skin.base[slot.key];
    item.effects = cleanSkinEffects(item.effects);
  });

  // 목록형 입력: 등록된 목록마다 항목 모양 정리
  Object.keys(LIST_DEFS).forEach((path) => {
    setPath(st, path, normalizeListValue(getPath(st, path), LIST_DEFS[path]));
  });

  // 스킨 id 중복이면 뒤쪽에 새 id (복사·편집된 파일 대비)
  const skinIds = new Set();
  st.skin.items.forEach((item) => {
    if (skinIds.has(item.id)) item.id = newSkinId();
    skinIds.add(item.id);
  });

  if (!Object.keys(GAME_DATA.storyType).includes(st.profile.storyType)) st.profile.storyType = "";

  if (!["atk", "hash", "twin"].includes(st.performance.stats.mode)) st.performance.stats.mode = "atk";

  // 각인돌파: 3단계 고정, 칸마다 글자만, 대상은 아는 키만
  const btTargets = [...GAME_DATA.skillSlots.map((slot) => slot.key), GAME_DATA.breakthroughEtc.key];
  const btRaw = Array.isArray(st.performance.engraving.breakthroughs) ? st.performance.engraving.breakthroughs : [];
  st.performance.engraving.breakthroughs = GAME_DATA.breakthroughStages.map((_, i) => {
    const raw = isPlainObject(btRaw[i]) ? btRaw[i] : {};
    const text = (v) => (typeof v === "string" ? v : "");
    return { target: btTargets.includes(raw.target) ? raw.target : "", name: text(raw.name), desc: text(raw.desc) };
  });

  // 스킬 레벨 직접 고친 글: 레벨 수만큼 글자 칸
  GAME_DATA.skillSlots.forEach((slot) => {
    const skill = st.performance.skills[slot.key];
    const raw = Array.isArray(skill.overrides) ? skill.overrides : [];
    skill.overrides = Array.from({ length: slot.levels }, (_, i) => (typeof raw[i] === "string" ? raw[i] : ""));
  });

  st.expression.lastArea = cleanExprArea(st.expression.lastArea);

  // 감정 표현 묶음: 같은 대상(기본·같은 스킨)은 하나만 — 뒤쪽 묶음은 대상 비움 (그림은 유지)
  const usedSources = new Set();
  st.expression.groups.forEach((group) => {
    if (group.source && usedSources.has(group.source)) group.source = "";
    if (group.source) usedSources.add(group.source);
  });
  return st;
}

/* ---------- 4. 저장 ---------- */

function toSaveData() {
  return { app: APP_ID, version: CURRENT_VERSION, ...state };
}

// 자동 저장은 글만: 직접 넣은 이미지(data:image/…)는 빼고 저장 (주소 이미지는 글이라 유지)
// → 새로고침하면 직접 넣은 이미지는 다시 넣어야 함. 작업 저장(JSON)도 같은 규칙 (toJsonSaveData)
function toAutosaveData() {
  return JSON.parse(
    JSON.stringify(toSaveData(), (key, value) => (typeof value === "string" && value.startsWith("data:image/") ? "" : value))
  );
}

function saveToLocalStorage() {
  const warn = document.getElementById("autosaveWarning");
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toAutosaveData()));
    if (warn) warn.hidden = true;
  } catch {
    // 저장 공간 부족 등 — 작업은 계속 가능. 직접 넣은 이미지가 많으면 생길 수 있음
    if (warn) warn.hidden = false;
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    state = normalizeData(JSON.parse(saved));
  } catch {
    // 망가진 자동저장은 무시하고 빈 상태로 시작
    state = freshState();
  }
}

// 파일 이름 앞부분: 영문명 → 한글명 → PNC_WIKI (파일 이름에 못 쓰는 글자·공백 정리)
function exportBaseName() {
  const pick = [state.profile.names.en, state.profile.name].map((v) => String(v || "").trim()).find(Boolean) || "PNC_WIKI";
  const clean = pick.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "_").replace(/^[.\s_]+|[.\s_]+$/g, "");
  return clean.slice(0, 40) || "PNC_WIKI";
}

// 날짜 MMDD
function exportDateTag() {
  const now = new Date();
  return String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
}

function makeFileName() {
  return `${exportBaseName()}_${exportDateTag()}.json`;
}

// 작업 저장(JSON): 글·설정·이미지 주소는 전부, 직접 넣은 이미지(파일 그 자체)는 뺌 → 파일이 가볍고 어디서든 열림
function toJsonSaveData() {
  let removed = 0;
  const data = JSON.parse(
    JSON.stringify(toSaveData(), (key, value) => {
      if (typeof value === "string" && value.startsWith("data:image/")) {
        removed += 1;
        return "";
      }
      return value;
    })
  );
  return { ...data, images: "excluded", imagesRemoved: removed };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(toJsonSaveData(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = makeFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob;
}

function loadJsonFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    let raw;
    let nextState;

    try {
      raw = JSON.parse(event.target.result);
      nextState = normalizeData(raw);
    } catch (error) {
      // 실패하면 현재 작업은 그대로 둔다
      alert(`불러오기 실패: ${error instanceof SyntaxError ? "올바른 JSON 파일이 아닙니다." : error.message}`);
      return;
    }

    state = nextState;
    refreshAll();

    // 저장할 때 빠진 직접 넣은 이미지 개수 안내
    const removed = Number(raw.imagesRemoved) || 0;
    if (raw.images === "excluded" && removed > 0 && typeof showExportNotice === "function") {
      showExportNotice("불러오기 완료", [
        `<p>불러왔어요. 이 파일을 저장할 때 직접 넣은 이미지 <b>${removed}개</b>는 빠져 있었어요.</p>`,
        "<p>비어 있는 이미지 칸에 다시 넣어 주세요. 이미지 주소로 넣은 칸은 그대로 들어 있어요.</p>",
      ]);
    }
  };

  reader.readAsText(file);
}

/* ---------- 5. 입력 폼 ↔ state ---------- */

const editorPanel = document.getElementById("editorPanel");
const birthdayMonthSelect = document.getElementById("dollBirthdayMonth");
const birthdayDaySelect = document.getElementById("dollBirthdayDay");

const DAYS_IN_MONTH = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };

// 생일 규칙: 불명이면 월·일 비움 / 그 달에 없는 날짜면 일 비움
function applyBirthdayRules() {
  const birthday = state.profile.birthday;

  if (birthday.unknown) {
    birthday.month = "";
    birthday.day = "";
  }

  const maxDay = DAYS_IN_MONTH[birthday.month] || 31;
  if (Number(birthday.day) > maxDay) {
    birthday.day = "";
  }
}

// 월에 맞춰 일 선택지 다시 만들기
function buildBirthdayDayOptions() {
  const maxDay = DAYS_IN_MONTH[state.profile.birthday.month] || 31;

  birthdayDaySelect.innerHTML = `<option value="">- 일</option>`;

  for (let day = 1; day <= maxDay; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = `${day}일`;
    birthdayDaySelect.appendChild(option);
  }
}

// GAME_DATA로 선택지 만들기: <div data-options="country" data-options-field="profile.voiceActor.country">
// 화면에 보이는 이름은 GAME_DATA label, 저장되는 값은 키
function buildOptionGroups() {
  document.querySelectorAll("[data-options]").forEach((box) => {
    const category = box.dataset.options;
    const field = box.dataset.optionsField;

    box.innerHTML = "";
    // 맨 앞에 "선택 안 함" (값 "" = 미선택. GAME_DATA에는 없는 입력 UI 전용 선택지)
    const options = [["", { label: "선택 안 함" }], ...Object.entries(GAME_DATA[category] || {})];
    options.forEach(([key, item]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = field;
      input.value = key;
      input.dataset.field = field;
      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${item.label}`));
      box.appendChild(label);
    });
  });
}

// 포지션: 체크박스 복수 선택 (고른 순서 유지, 최대 MAX_POSITIONS개)
function buildPositionPicker() {
  const box = document.getElementById("positionPicker");
  box.innerHTML = "";
  Object.entries(GAME_DATA.position).forEach(([key, item]) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = key;
    input.dataset.position = key;
    label.append(input, document.createTextNode(` ${item.label}`));
    box.appendChild(label);
  });
}

function fillPositionPicker() {
  const chosen = state.profile.positions;
  document.querySelectorAll("[data-position]").forEach((input) => {
    input.checked = chosen.includes(input.value);
    input.disabled = !input.checked && chosen.length >= MAX_POSITIONS;
  });
  const order = chosen.map((key) => getLabel("position", key) || key).join(" → ");
  document.getElementById("positionSummary").textContent =
    `선택 ${chosen.length}/${MAX_POSITIONS}` + (order ? ` · 표시 순서: ${order}` : "");
}

// 추천 알고리즘 입력: 구역마다 알고리즘 카드 3개
//   카드 = [아이콘][알고리즘 선택] → 세트 효과 설명 → 주 옵션 → 부 옵션 1·2
function makeSelect(field, noneLabel, options) {
  const select = document.createElement("select");
  select.dataset.field = field;
  select.appendChild(new Option(noneLabel, ""));
  options.forEach(([value, text]) => select.appendChild(new Option(text, value)));
  return select;
}

function buildAlgorithmPicker() {
  const box = document.getElementById("algorithmPicker");
  box.innerHTML = "";

  ALGORITHM_TYPES.forEach((type) => {
    const typeItem = GAME_DATA.algorithmType[type];
    const zone = document.createElement("div");
    zone.className = "algo-zone";

    const title = document.createElement("div");
    title.className = "algo-zone-title";
    title.textContent = typeItem.label;
    title.style.borderLeftColor = typeItem.accent;
    zone.appendChild(title);

    const algoOptions = getAlgorithmsOfType(type).map((key) => [key, getLabel("algorithm", key)]);
    const mainOptions = getAllowedOptions(type, "main").map((key) => [key, getLabel("attribute", key)]);
    const subOptions = getAllowedOptions(type, "sub").map((key) => [key, getLabel("attribute", key)]);

    // 구역 공통 옵션 (기본: 이 구역 알고리즘 전부에 적용)
    const shared = document.createElement("div");
    shared.className = "algo-shared";
    const sharedTitle = document.createElement("div");
    sharedTitle.className = "algo-shared-title";
    sharedTitle.textContent = "공통 옵션 (이 구역 알고리즘 전부에 적용)";
    const sharedRow = document.createElement("div");
    sharedRow.className = "algo-shared-row";
    [
      ["주 옵션 1", `algorithm.${type}.main.0`, mainOptions],
      ["주 옵션 2", `algorithm.${type}.main.1`, mainOptions],
      ["부 옵션 1", `algorithm.${type}.sub.0`, subOptions],
      ["부 옵션 2", `algorithm.${type}.sub.1`, subOptions],
    ].forEach(([text, field, options]) => {
      const label = document.createElement("label");
      label.append(document.createTextNode(text), makeSelect(field, "선택 안 함", options));
      sharedRow.appendChild(label);
    });
    shared.append(sharedTitle, sharedRow);
    zone.appendChild(shared);

    for (let i = 0; i < ALGORITHM_SLOTS; i += 1) {
      const base = `algorithm.${type}.slots.${i}`;
      const card = document.createElement("div");
      card.className = "algo-card";

      const head = document.createElement("div");
      head.className = "algo-slot-row";
      const thumb = document.createElement("span");
      thumb.className = "algo-thumb";
      thumb.style.background = typeItem.accent;
      thumb.dataset.algoThumb = `${type}.${i}`;
      head.append(thumb, makeSelect(`${base}.key`, `알고리즘 ${i + 1} — 선택 안 함`, algoOptions));

      // 세트 효과 (알고리즘을 고르면 채워짐)
      const desc = document.createElement("div");
      desc.className = "algo-desc";
      desc.dataset.algoDesc = `${type}.${i}`;

      // + 버튼: 이 알고리즘만 옵션 따로 설정
      const toggle = document.createElement("label");
      toggle.className = "algo-custom-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.dataset.field = `${base}.custom`;
      const toggleText = document.createElement("span");
      toggleText.dataset.algoToggleText = `${type}.${i}`;
      toggle.append(toggleInput, toggleText);

      const optionRow = document.createElement("div");
      optionRow.className = "algo-option-row";
      optionRow.dataset.algoOwn = `${type}.${i}`;
      const mainBox = document.createElement("label");
      mainBox.append(document.createTextNode("주 옵션"), makeSelect(`${base}.main`, "선택 안 함", mainOptions));
      const sub1 = document.createElement("label");
      sub1.append(document.createTextNode("부 옵션 1"), makeSelect(`${base}.sub.0`, "선택 안 함", subOptions));
      const sub2 = document.createElement("label");
      sub2.append(document.createTextNode("부 옵션 2"), makeSelect(`${base}.sub.1`, "선택 안 함", subOptions));
      optionRow.append(mainBox, sub1, sub2);

      card.append(head, desc, toggle, optionRow);
      zone.appendChild(card);
    }

    box.appendChild(zone);
  });
}

// 두 칸짜리 선택에서 서로 같은 값 고르지 못하게
function blockPairDuplicate(fieldA, fieldB) {
  const a = document.querySelector(`[data-field="${fieldA}"]`);
  const b = document.querySelector(`[data-field="${fieldB}"]`);
  [[a, b], [b, a]].forEach(([self, other]) => {
    [...self.options].forEach((option) => {
      option.disabled = Boolean(option.value) && option.value === other.value;
    });
  });
}

// state → 알고리즘 입력 (아이콘·세트 효과, 같은 구역 알고리즘 중복 막기, 옵션 1·2 중복 막기, 따로 설정 표시)
function fillAlgorithmPicker() {
  ALGORITHM_TYPES.forEach((type) => {
    const slots = state.algorithm[type].slots;
    blockPairDuplicate(`algorithm.${type}.main.0`, `algorithm.${type}.main.1`);
    blockPairDuplicate(`algorithm.${type}.sub.0`, `algorithm.${type}.sub.1`);
    const chosenKeys = slots.map((slot) => slot.key);

    slots.forEach((slot, i) => {
      const base = `algorithm.${type}.slots.${i}`;

      const thumb = document.querySelector(`[data-algo-thumb="${type}.${i}"]`);
      const url = getIconUrl("algorithm", slot.key);
      thumb.innerHTML = url ? `<img src="${url}" alt="">` : "";

      const desc = document.querySelector(`[data-algo-desc="${type}.${i}"]`);
      desc.innerHTML = "";
      getAlgorithmSets(slot.key).forEach((set) => {
        const line = document.createElement("div");
        const tag = document.createElement("b");
        tag.textContent = set.label;
        line.append(tag, document.createTextNode(` ${set.text}`));
        desc.appendChild(line);
      });
      desc.hidden = !desc.childNodes.length;

      const keySelect = document.querySelector(`[data-field="${base}.key"]`);
      [...keySelect.options].forEach((option) => {
        option.disabled = Boolean(option.value) && option.value !== slot.key && chosenKeys.includes(option.value);
      });

      blockPairDuplicate(`${base}.sub.0`, `${base}.sub.1`);

      document.querySelector(`[data-algo-own="${type}.${i}"]`).hidden = !slot.custom;
      document.querySelector(`[data-algo-toggle-text="${type}.${i}"]`).textContent = slot.custom
        ? "− 공통 옵션으로 되돌리기"
        : "+ 이 알고리즘만 옵션 따로 설정";
    });
  });
}

// 친밀도 스킬 칸: 칸마다 select 하나 (선택 안 함 + GAME_DATA.intimacy)
function buildIntimacySlots() {
  const box = document.getElementById("intimacySkillSlots");
  box.innerHTML = "";

  const oath = Object.values(GAME_DATA.intimacy).find((item) => item.oath);
  if (oath) {
    const note = document.createElement("div");
    note.className = "skill-oath-note";
    note.textContent = `서약: ${oath.label} (맨 위 고정)`;
    box.appendChild(note);
  }

  for (let i = 0; i < INTIMACY_SLOTS; i += 1) {
    const row = document.createElement("label");
    row.className = "skill-slot-row";

    const title = document.createElement("span");
    title.textContent = `스킬 ${i + 1}`;

    const select = document.createElement("select");
    select.dataset.field = `intimacy.skills.${i}`;
    select.appendChild(new Option("선택 안 함", ""));
    Object.entries(GAME_DATA.intimacy)
      .filter(([, item]) => !item.oath)
      .forEach(([key, item]) => {
        select.appendChild(new Option(`${item.label} — ${item.stat}`, key));
      });

    row.append(title, select);
    box.appendChild(row);
  }
}

// 선물 반응: 선물마다 보통 / 좋아함 / 싫어함 중 하나 (한 선물이 두 그룹에 들어갈 수 없음)
const GIFT_CHOICES = [
  { value: "neutral", label: "보통" },
  { value: "like", label: "좋아함" },
  { value: "hate", label: "싫어함" },
];

function buildGiftPicker() {
  const box = document.getElementById("giftPicker");
  box.innerHTML = "";

  Object.entries(GAME_DATA.giftTier).forEach(([tier, tierItem]) => {
    const title = document.createElement("div");
    title.className = "gift-tier-title";
    title.dataset.giftTier = tier;
    title.textContent = tierItem.label;
    title.style.color = tierItem.color;
    box.appendChild(title);

    Object.entries(GAME_DATA.gift)
      .filter(([, gift]) => String(gift.tier) === tier)
      .forEach(([key, gift]) => {
        const row = document.createElement("div");
        row.className = "gift-row";
        row.dataset.giftTier = tier;

        const thumb = document.createElement("img");
        thumb.className = "gift-thumb";
        thumb.src = getIconUrl("gift", key);
        thumb.alt = gift.label;
        thumb.style.borderColor = tierItem.color;

        const name = document.createElement("div");
        name.className = "gift-name";
        name.textContent = gift.label;

        const choices = document.createElement("div");
        choices.className = "gift-choice";
        GIFT_CHOICES.forEach((choice) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = `gift.${key}`;
          input.value = choice.value;
          input.dataset.gift = key;

          const icon = document.createElement("img");
          icon.src = getIconUrl("giftReaction", choice.value);
          icon.alt = "";

          label.append(input, icon, document.createTextNode(choice.label));
          choices.appendChild(label);
        });

        row.append(thumb, name, choices);
        box.appendChild(row);
      });
  });
}

function getGiftReaction(key) {
  const gifts = state.intimacy.gifts;
  if (gifts.like.includes(key)) return "like";
  if (gifts.hate.includes(key)) return "hate";
  return "neutral";
}

function setGiftReaction(key, reaction) {
  const gifts = state.intimacy.gifts;
  gifts.like = gifts.like.filter((k) => k !== key);
  gifts.hate = gifts.hate.filter((k) => k !== key);
  if (reaction === "like") gifts.like.push(key);
  if (reaction === "hate") gifts.hate.push(key);
}

function fillGiftPicker() {
  document.querySelectorAll("[data-gift]").forEach((input) => {
    input.checked = input.value === getGiftReaction(input.dataset.gift);
  });

  const gifts = state.intimacy.gifts;
  document.getElementById("giftSummary").textContent =
    `좋아함 ${gifts.like.length}개 · 싫어함 ${gifts.hate.length}개 · 나머지는 보통`;
}

// state → 폼 (불러오기·초기화·새로고침 때)
// root 안의 data-field 입력칸에 state 값 넣기
function fillFields(root) {
  // 키 배열 체크박스 (data-toggle-field="경로" value="키")
  root.querySelectorAll("[data-toggle-field]").forEach((el) => {
    const list = getPath(state, el.dataset.toggleField);
    el.checked = Array.isArray(list) && list.includes(el.value);
  });
  root.querySelectorAll("[data-field]").forEach((el) => {
    const value = getPath(state, el.dataset.field);

    if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else if (el.type === "radio") {
      el.checked = el.value === value;
    } else {
      el.value = value == null ? "" : value;
    }
  });
}

function fillForm() {
  buildBirthdayDayOptions();
  fillFields(document);

  const unknown = state.profile.birthday.unknown;
  birthdayMonthSelect.disabled = unknown;
  birthdayDaySelect.disabled = unknown;

  fillGiftPicker();
  fillPositionPicker();
  fillAlgorithmPicker();
  Object.keys(FOLD_EDITORS).forEach(fillFoldStatus);
  fillOathPreview();
  fillImageFields(document);
  fillSkinBaseStatus();
  fillStoryCgGroup();
  fillSkillStatus();
  fillSkillLevels();
  fillReviewEditor();
  fillStatEditor();
  fillEngravingEditor();
  fillSectionChecks();
  fillOverviewVideoHint();
}

// 폼 → state (입력할 때마다)
function handleInput(event) {
  const el = event.target;

  // 포지션 복수 선택 (data-field가 아닌 별도 처리)
  if (el.dataset && el.dataset.position) {
    const key = el.dataset.position;
    const chosen = state.profile.positions.filter((k) => k !== key);
    if (el.checked && chosen.length < MAX_POSITIONS) chosen.push(key);
    state.profile.positions = chosen;
    fillPositionPicker();
    saveToLocalStorage();
    render();
    return;
  }

  // 선물 반응 (data-field가 아닌 별도 처리)
  if (el.dataset && el.dataset.gift) {
    if (!el.checked) return;
    setGiftReaction(el.dataset.gift, el.value);
    fillGiftPicker();
    saveToLocalStorage();
    render();
    return;
  }

  // 이미지 주소 칸
  if (el.dataset && el.dataset.imageUrl) {
    setPath(state, el.dataset.imageUrl, el.value.trim());
    updateListTitle(el.dataset.imageUrl);
    afterImageChange();
    return;
  }

  // 키 배열 체크박스 (복수 선택): 켜면 추가, 끄면 빼기
  //   data-toggle-order="GAME_DATA 분류" → 그 정의 순서로 정렬
  //   data-excludes="키,키" → 켜면 같이 못 고르는 키를 뺌 (예: Live2D ↔ Animated)
  if (el.dataset && el.dataset.toggleField) {
    const togglePath = el.dataset.toggleField;
    const current = getPath(state, togglePath);
    let list = (Array.isArray(current) ? current : []).filter((key) => key !== el.value);
    if (el.checked) {
      const excludes = (el.dataset.excludes || "").split(",").filter(Boolean);
      list = list.filter((key) => !excludes.includes(key));
      list.push(el.value);
    }
    if (el.dataset.toggleOrder && GAME_DATA[el.dataset.toggleOrder]) {
      const order = Object.keys(GAME_DATA[el.dataset.toggleOrder]);
      list = order.filter((key) => list.includes(key));
    }
    setPath(state, togglePath, list);
    // 같은 묶음 체크박스 다시 채우기 (같이 못 고르는 것이 풀린 걸 보여줌)
    document.querySelectorAll(`[data-toggle-field="${togglePath}"]`).forEach((box) => {
      box.checked = list.includes(box.value);
    });
    updateListTitle(togglePath);
    saveToLocalStorage();
    render();
    return;
  }

  const path = el.dataset && el.dataset.field;
  if (!path) return;

  let value;
  if (el.type === "checkbox") {
    value = el.checked;
  } else if (el.type === "radio") {
    if (!el.checked) return;
    value = el.value;
  } else {
    value = el.value;
  }

  setPath(state, path, value);

  // "따로 설정"을 처음 켤 때 빈 칸이면 공통 옵션을 채워 줌 (주 옵션은 1개라 첫 번째만)
  const customMatch = path.match(/^algorithm\.(\w+)\.slots\.(\d+)\.custom$/);
  if (customMatch && value === true) {
    const zone = state.algorithm[customMatch[1]];
    const slot = zone.slots[Number(customMatch[2])];
    if (!slot.main && !slot.sub.some(Boolean)) {
      slot.main = zone.main.find(Boolean) || "";
      slot.sub = [...zone.sub];
    }
    fillForm();
  }

  if (path.startsWith("algorithm.")) {
    fillAlgorithmPicker(); // 아이콘 미리보기·중복 막기 갱신
  }

  updateListTitle(path); // 목록 카드 머리 글자·안내 갱신 (목록 칸일 때만)
  if (path.startsWith("intimacy.oath.")) fillOathPreview();
  if (path.startsWith("skin.base.")) fillSkinBaseStatus();
  if (path === "profile.storyType") {
    fillStoryCgGroup();
    rebuildEditorPages(); // 메인/전속 CG 페이지가 생기거나 없어짐
  }
  if (path.startsWith("performance.stats.values.") && !path.endsWith(".crit-damage")) state.performance.stats.edited = true;
  if (path.startsWith("performance.stats.") || path === "profile.class" || path === "profile.rarity") fillStatEditor();
  if (path.startsWith("performance.engraving.enhancement.totals.")) state.performance.engraving.enhancement.edited = true;
  // 각인돌파 대상을 고르면, 강화 스킬명이 비어 있을 때만 3.1.2 스킬 이름을 채워 줌 (+ / ++ 는 직접)
  const btMatch = path.match(/^performance\.engraving\.breakthroughs\.(\d)\.target$/);
  if (btMatch) {
    const bt = state.performance.engraving.breakthroughs[Number(btMatch[1])];
    const skill = state.performance.skills[value];
    if (bt && !bt.name.trim() && skill && skill.name.trim()) {
      bt.name = skill.name;
      fillFields(el.closest(".story-slot-body") || document); // 채운 이름을 입력칸에 보여 줌
    }
  }
  if (path.startsWith("performance.stats.") || path.startsWith("performance.engraving.")) fillEngravingEditor();
  if (path.startsWith("sections.")) fillSectionChecks();
  if (path === "overview.video") fillOverviewVideoHint();
  const skillMatch = path.match(/^performance\.skills\.(\w+)\.(levels|name)$/);
  if (skillMatch) {
    fillSkillStatus();
    if (skillMatch[2] === "levels") fillSkillLevels(skillMatch[1]);
  }
  const foldPrefix = path.split(".")[0];
  if (FOLD_EDITORS[foldPrefix]) fillFoldStatus(foldPrefix);

  if (path.startsWith("profile.birthday")) {
    applyBirthdayRules();
    fillForm(); // 일 선택지·비활성 상태 갱신
  }

  saveToLocalStorage();
  render();
}

/* ---------- 5-1. 목록형 입력 공통 ---------- */
// 스토리·대사·인형 관계·스킨처럼 같은 모양 항목이 여러 개인 입력의 공통 동작.
// 문단마다 하는 일: (1) DEFAULT_STATE에 빈 배열 자리 만들기
//                  (2) defineList(경로, 정의)  (3) index.html에 <div data-list-editor="경로">
// 공통이 하는 일: 카드 그리기 · 추가 · 삭제 · ↑↓ 이동 · 불러온 값 정리.
// 항목 칸은 평범한 data-field("경로.번호.필드")라서 입력 처리는 기존 handleInput 그대로.
// 항목의 의미와 문서 모양은 각 문단(정의의 fields, renderer의 SECTION_BODY)이 맡는다.
//
// 정의 (def):
//   item   : 새 항목 기본값이자 항목 모양. 예) { title: "", content: "" }
//            불러올 때 이 모양에 맞춰 정리 (없는 필드 채움, 모르는 필드·종류 다른 값 버림)
//   fixed  : 숫자면 칸 수 고정 (추가·삭제·이동 버튼 없음). 없으면 가변 목록
//   max    : 가변 목록 최대 개수 (없으면 제한 없음)
//   label  : 카드 머리 기본 이름. 예) "스킨" → "스킨 1"
//   title  : (item, index) => 카드 머리에 덧붙일 글자 (선택)
//   fields : (base, item, index) => 입력칸 요소 배열. base = "경로.번호"
//   addLabel : 추가 버튼 글자 (선택)
//   init   : (item) => void — 「추가」로 새로 만들 때만 (예: 고유 id 붙이기)
//   clean  : (item) => item — 불러올 때 항목 모양 정리 뒤 추가로 다듬기 (선택. 예: 키 배열 거르기)
//   fold   : true면 카드를 접고 펼 수 있음 (펼침 상태는 화면 전용, 저장 안 함)
//   sync   : (base, item) => void — 카드를 그린 뒤·항목 칸을 고칠 때마다 호출 (안내 문구 갱신 등, 선택)

function defineList(path, def) {
  LIST_DEFS[path] = { label: "항목", ...def };
}

function newListItem(def) {
  return JSON.parse(JSON.stringify(def.item));
}

// 불러온 값 → 목록 정의에 맞는 배열
//  - 배열이 아니면 빈 목록 / 항목이 객체가 아니면 가변 목록은 버리고, 고정 칸은 빈 칸으로
//  - 항목 안은 def.item 모양으로 정리 (mergeWithDefaults)
function normalizeListValue(raw, def) {
  const list = Array.isArray(raw) ? raw : [];
  if (def.fixed) {
    const out = [];
    for (let i = 0; i < def.fixed; i += 1) {
      out.push(isPlainObject(list[i]) ? (def.clean || ((x) => x))(mergeWithDefaults(def.item, list[i])) : newListItem(def));
    }
    return out;
  }
  const clean = def.clean || ((item) => item);
  const out = list.filter(isPlainObject).map((item) => clean(mergeWithDefaults(def.item, item)));
  return def.max ? out.slice(0, def.max) : out;
}

function getList(path) {
  const list = getPath(state, path);
  return Array.isArray(list) ? list : [];
}

function isBlankItem(item, def) {
  return JSON.stringify(item) === JSON.stringify(newListItem(def));
}

function listAdd(path) {
  const def = LIST_DEFS[path];
  const list = getList(path);
  if (!def || def.fixed || (def.max && list.length >= def.max)) return false;
  const item = newListItem(def);
  if (def.init) def.init(item);
  setPath(state, path, [...list, item]);
  return true;
}

function listRemove(path, index) {
  const def = LIST_DEFS[path];
  const list = getList(path);
  if (!def || def.fixed || index < 0 || index >= list.length) return false;
  setPath(state, path, list.filter((_, i) => i !== index));
  return true;
}

// dir: -1 = 위로, 1 = 아래로. 첫 항목 위·마지막 항목 아래는 아무 일 없음
function listMove(path, index, dir) {
  const def = LIST_DEFS[path];
  const list = getList(path).slice();
  const to = index + dir;
  if (!def || def.fixed || index < 0 || index >= list.length || to < 0 || to >= list.length) return false;
  [list[index], list[to]] = [list[to], list[index]];
  setPath(state, path, list);
  return true;
}

function listCardTitle(def, item, index) {
  const extra = def.title ? def.title(item, index) : "";
  return extra ? `${def.label} ${index + 1} · ${extra}` : `${def.label} ${index + 1}`;
}

function makeListButton(text, action, path, index, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-btn";
  button.textContent = text;
  button.title = title;
  button.dataset.listAction = action;
  button.dataset.listPath = path;
  if (index !== undefined) button.dataset.listIndex = String(index);
  return button;
}

// 목록 하나 다시 그리기 (state 기준). 버튼에는 리스너를 달지 않음 → editorPanel 클릭 위임
function drawList(path) {
  const box = document.querySelector(`[data-list-editor="${path}"]`);
  const def = LIST_DEFS[path];
  if (!box || !def) return;

  const list = getList(path);
  box.innerHTML = "";
  box.classList.add("list-editor");

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "아직 항목이 없어요.";
    box.appendChild(empty);
  }

  list.forEach((item, index) => {
    const card = document.createElement(def.fold ? "details" : "div");
    card.className = "list-card";
    card.dataset.listItem = `${path}.${index}`;
    if (def.fold) {
      card.open = !LIST_FOLDED.has(item); // 접은 항목만 기억 (항목 객체 기준이라 이동해도 따라감)
    }

    const head = document.createElement(def.fold ? "summary" : "div");
    head.className = "list-card-head";
    const title = document.createElement("span");
    title.className = "list-card-title";
    title.dataset.listTitle = `${path}.${index}`;
    title.textContent = listCardTitle(def, item, index);
    head.appendChild(title);

    if (!def.fixed) {
      const tools = document.createElement("span");
      tools.className = "list-card-tools";
      const up = makeListButton("↑", "up", path, index, "위로");
      const down = makeListButton("↓", "down", path, index, "아래로");
      up.disabled = index === 0;
      down.disabled = index === list.length - 1;
      const remove = makeListButton("삭제", "remove", path, index, "이 항목 삭제");
      remove.classList.add("danger");
      tools.append(up, down, remove);
      head.appendChild(tools);
    }

    const body = document.createElement("div");
    body.className = "list-card-body";
    (def.fields ? def.fields(`${path}.${index}`, item, index) : []).forEach((node) => body.appendChild(node));

    card.append(head, body);
    box.appendChild(card);
  });

  if (!def.fixed) {
    const add = makeListButton(def.addLabel || `+ ${def.label} 추가`, "add", path, undefined, "항목 추가");
    add.classList.add("list-add");
    add.disabled = Boolean(def.max && list.length >= def.max);
    box.appendChild(add);
  }

  fillFields(box);
  fillImageFields(box);
  if (def.sync) list.forEach((item, index) => def.sync(`${path}.${index}`, item));
  if (PAGED_LISTS.includes(path)) rebuildEditorPages(path); // 하나씩 쓰기: 항목 수가 바뀌면 페이지도 다시
}

// 접어 둔 목록 카드 (화면 전용). 항목 객체가 사라지면 자동으로 잊힘
const LIST_FOLDED = new WeakSet();

// 카드 접기/펼치기 기억 (editorPanel 하나에서 처리. toggle은 버블링이 없어 capture 사용)
function handleListToggle(event) {
  const card = event.target;
  if (!card.matches || !card.matches("details.list-card[data-list-item]")) return;
  const key = card.dataset.listItem;
  const path = Object.keys(LIST_DEFS).find((p) => key.startsWith(`${p}.`));
  if (!path) return;
  const item = getList(path)[Number(key.slice(path.length + 1))];
  if (!item) return;
  if (card.open) LIST_FOLDED.delete(item);
  else LIST_FOLDED.add(item);
}

function drawAllLists() {
  Object.keys(LIST_DEFS).forEach(drawList);
}

// 입력한 칸이 목록 항목이면 그 카드 머리 글자만 갱신
function updateListTitle(fieldPath) {
  const path = Object.keys(LIST_DEFS).find((p) => fieldPath.startsWith(`${p}.`));
  if (!path) return;
  const index = Number(fieldPath.slice(path.length + 1).split(".")[0]);
  const item = getList(path)[index];
  const title = document.querySelector(`[data-list-title="${path}.${index}"]`);
  if (item && title) title.textContent = listCardTitle(LIST_DEFS[path], item, index);
  if (item && LIST_DEFS[path].sync) LIST_DEFS[path].sync(`${path}.${index}`, item);
}

// 추가·삭제·이동 버튼 (editorPanel 클릭 위임 하나로 처리)
function handleListClick(event) {
  const button = event.target.closest("[data-list-action]");
  if (!button) return;
  event.preventDefault(); // 접는 카드 머리(summary) 안 버튼이 카드를 접지 않게
  if (button.disabled) return;

  const path = button.dataset.listPath;
  const def = LIST_DEFS[path];
  if (!def) return;
  const action = button.dataset.listAction;
  const index = Number(button.dataset.listIndex);

  let changed = false;
  let focusIndex = null;
  if (action === "add") {
    changed = listAdd(path);
  } else if (action === "remove") {
    const item = getList(path)[index];
    if (item && !isBlankItem(item, def) && !confirm(`${listCardTitle(def, item, index)}을(를) 삭제할까요?`)) return;
    changed = listRemove(path, index);
  } else if (action === "up" || action === "down") {
    const dir = action === "up" ? -1 : 1;
    changed = listMove(path, index, dir);
    focusIndex = index + dir;
  }
  if (!changed) return;

  drawList(path);
  // 이동한 항목의 같은 버튼에 초점 유지 (연속 이동 편하게)
  if (focusIndex !== null) {
    const again = document.querySelector(
      `[data-list-action="${action}"][data-list-path="${path}"][data-list-index="${focusIndex}"]`
    );
    if (again && !again.disabled) again.focus();
  }
  saveToLocalStorage();
  render();
}

// 문단 fields에서 쓰는 입력칸 도우미 (라벨 + input/textarea/select)
function listTextField(field, label, options = {}) {
  const wrap = document.createElement("label");
  wrap.className = "list-field";
  const input = document.createElement(options.multiline ? "textarea" : "input");
  if (!options.multiline) input.type = "text";
  else input.rows = options.rows || 4;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.dataset.field = field;
  wrap.append(document.createTextNode(label), input);
  return wrap;
}

function listSelectField(field, label, choices, noneLabel = "선택 안 함") {
  const wrap = document.createElement("label");
  wrap.className = "list-field";
  wrap.append(document.createTextNode(label), makeSelect(field, noneLabel, choices));
  return wrap;
}

/* ---------- 5-2. 고정 칸 접기 입력 (스토리 10칸 · 대사) ---------- */
// 칸마다 접고 펴는 편집 블록(details) + 작성 상태 표시. 펼침 상태는 화면 전용이라 저장하지 않음.
// prefix = state 경로 (story / voice). 칸 정의는 GAME_DATA, 저장은 state[prefix][slot.key] 글자만.
const FOLD_EDITORS = {
  story: {
    boxId: "storyEditor",
    // 입력은 프로필 1~5 → 보이스 1~5 순서로 묶음 (문서는 게임 해금 순서 그대로)
    slots: () => [...GAME_DATA.storySlots.filter((slot) => slot.key.startsWith("profile")), ...GAME_DATA.storySlots.filter((slot) => !slot.key.startsWith("profile"))],
    note: (slot) => getStoryUnlockText(slot),
    rows: 8,
  },
  voice: {
    boxId: "voiceEditor",
    slots: () => GAME_DATA.voiceSlots.filter((slot) => !slot.fixed), // 타이틀 콜은 고정 글이라 입력칸 없음
    note: (slot) => slot.code,
    noteClass: "is-code",
    rows: 3,
  },
};

function buildFoldEditor(prefix) {
  const def = FOLD_EDITORS[prefix];
  const box = document.getElementById(def.boxId);
  box.innerHTML = "";
  def.slots().forEach((slot, index) => {
    const block = document.createElement("details");
    block.className = "story-slot";
    block.dataset.slotKey = slot.key;
    if (index === 0) block.open = true;

    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "story-slot-name";
    name.textContent = slot.label;
    const status = document.createElement("span");
    status.className = "story-slot-status";
    status.dataset.slotStatus = `${prefix}.${slot.key}`;
    summary.append(name, status);

    const body = document.createElement("div");
    body.className = "story-slot-body";
    const note = document.createElement("div");
    note.className = `story-slot-unlock${def.noteClass ? ` ${def.noteClass}` : ""}`;
    note.textContent = def.note(slot);
    const text = document.createElement("textarea");
    text.rows = def.rows;
    text.dataset.field = `${prefix}.${slot.key}`;
    text.setAttribute("aria-label", slot.label);
    body.append(note, text);

    block.append(summary, body);
    box.appendChild(block);
  });
}

// 접힌 칸에서도 작성 여부가 보이게
function fillFoldStatus(prefix) {
  FOLD_EDITORS[prefix].slots().forEach((slot) => {
    const el = document.querySelector(`[data-slot-status="${prefix}.${slot.key}"]`);
    const text = state[prefix][slot.key].trim();
    el.textContent = text ? `작성됨 · ${text.length}자` : "비어 있음";
    el.classList.toggle("is-written", Boolean(text));
  });
}

function setAllFoldOpen(prefix, open) {
  document.querySelectorAll(`#${FOLD_EDITORS[prefix].boxId} .story-slot`).forEach((block) => {
    block.open = open;
  });
}

// 예전 이름 (스토리 전용) — 그대로 사용 가능
function setAllStoryOpen(open) {
  setAllFoldOpen("story", open);
}

// 「모두 펼치기 / 모두 접기」 버튼: data-fold-all="story|voice" data-fold-open="1|0" (editorPanel 클릭 위임)
function handleFoldAllClick(event) {
  const button = event.target.closest("[data-fold-all]");
  if (!button || !FOLD_EDITORS[button.dataset.foldAll]) return;
  setAllFoldOpen(button.dataset.foldAll, button.dataset.foldOpen === "1");
}

/* ---------- 5-3. 작중 행적 (가변 목록) ---------- */

function historyLinkHint(item) {
  const url = item.linkUrl.trim();
  const text = item.linkText.trim();
  if (url && !safeLinkUrl(url)) return ["warn", "http:// 또는 https:// 로 시작하는 주소만 쓸 수 있어요. 문서에 링크가 나오지 않아요."];
  if (url && !text) return ["warn", "대체 텍스트도 넣어야 문서에 링크 문장이 나와요."];
  if (!url && text) return ["warn", "링크 주소도 넣어야 문서에 링크 문장이 나와요."];
  if (url && text) return ["ok", `문서에 「→ 자세한 내용은 ${text} 문서를 참고하십시오.」로 나와요.`];
  return ["", "링크는 선택 사항이에요. 주소와 대체 텍스트를 둘 다 넣으면 안내 문장이 생겨요."];
}

defineList("history.items", {
  label: "작중 행적",
  addLabel: "+ 작중 행적 항목 추가",
  item: { title: "", linkUrl: "", linkText: "", summary: "" },
  title: (item) => item.title.trim(),
  fields: (base) => {
    const linkRow = document.createElement("div");
    linkRow.className = "list-field-row";
    linkRow.append(
      listTextField(`${base}.linkUrl`, "링크 주소"),
      listTextField(`${base}.linkText`, "링크 대체 텍스트")
    );
    const hint = document.createElement("div");
    hint.className = "list-hint";
    hint.dataset.linkHint = base;
    const titleHint = document.createElement("div");
    titleHint.className = "list-hint is-warn";
    titleHint.dataset.titleHint = base;
    titleHint.textContent = "제목이 있어야 문서에 나와요. 지금은 문서·목차에서 빠져 있어요 (적은 내용은 그대로 남아 있어요).";
    return [
      listTextField(`${base}.title`, "제목"),
      titleHint,
      linkRow,
      hint,
      listTextField(`${base}.summary`, "요약", { multiline: true, rows: 5 }),
    ];
  },
  sync: (base, item) => {
    const titleHint = document.querySelector(`[data-title-hint="${base}"]`);
    if (titleHint) titleHint.hidden = Boolean(item.title.trim());
    const hint = document.querySelector(`[data-link-hint="${base}"]`);
    if (!hint) return;
    const [kind, text] = historyLinkHint(item);
    hint.textContent = text;
    hint.className = `list-hint${kind ? ` is-${kind}` : ""}`;
  },
});

/* ---------- 5-4. 이미지 넣기 (주소 또는 파일) ---------- */
// imageField(path, label): [미리보기][파일 넣기][지우기] + 주소 칸 + 안내
//  - 파일: 브라우저 안에서 줄여서(긴 변 1600px) data:image/… 로 state에 저장 → 미리보기·PNG 캡처에 그대로
//  - 주소: http/https 이미지 주소
//  - 리스너는 editorPanel 위임 (change = 파일, input = 주소, click = 지우기)
const IMAGE_MAX_SIDE = 1600;

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function imageField(path, label) {
  const wrap = document.createElement("div");
  wrap.className = "list-field image-field";
  wrap.dataset.imageField = path;
  const title = document.createElement("div");
  title.textContent = label;

  const row = document.createElement("div");
  row.className = "image-field-row";
  const thumb = document.createElement("span");
  thumb.className = "image-thumb";
  thumb.dataset.imageThumb = path;

  const controls = document.createElement("div");
  controls.className = "image-field-controls";
  const fileLabel = document.createElement("label");
  fileLabel.className = "list-btn image-file-btn";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.dataset.imageFile = path;
  fileLabel.append(file, document.createTextNode("이미지 파일 넣기"));
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "list-btn danger";
  clear.textContent = "지우기";
  clear.dataset.imageClear = path;
  const url = document.createElement("input");
  url.type = "text";
  url.dataset.imageUrl = path;
  url.setAttribute("aria-label", "이미지 주소");
  const urlCaption = document.createElement("div");
  urlCaption.className = "image-url-caption";
  urlCaption.textContent = "또는 이미지 주소";
  const buttons = document.createElement("div");
  buttons.className = "image-field-buttons";
  buttons.append(fileLabel, clear);
  controls.append(buttons, urlCaption, url);
  row.append(thumb, controls);

  const hint = document.createElement("div");
  hint.className = "list-hint";
  hint.dataset.imageHint = path;
  wrap.append(title, row, hint);
  return wrap;
}

// state → 이미지 칸 (미리보기·주소·안내)
function fillImageFields(root) {
  root.querySelectorAll("[data-image-field]").forEach((wrap) => {
    const path = wrap.dataset.imageField;
    const value = getPath(state, path) || "";
    const urlInput = wrap.querySelector("[data-image-url]");
    if (document.activeElement !== urlInput) urlInput.value = isDataImage(value) ? "" : value;
    const src = getImageSrc(value);
    const thumb = wrap.querySelector("[data-image-thumb]");
    thumb.innerHTML = "";
    if (src) {
      const im = document.createElement("img");
      im.src = src;
      im.alt = "";
      thumb.appendChild(im);
    }
    const hint = wrap.querySelector("[data-image-hint]");
    let kind = "";
    let text = "파일을 넣거나 이미지 주소를 적어 주세요. (비워 두면 이미지 없이 나와요)";
    if (isDataImage(value) && src) {
      kind = "ok";
      text = `직접 넣은 이미지예요 (약 ${Math.round((value.length * 3) / 4 / 1024)}KB). 자동 저장은 안 돼서 새로고침하면 다시 넣어야 해요 (「JSON 저장」에는 들어가요).`;
    } else if (value && !src) {
      kind = "warn";
      text = "http:// 또는 https:// 로 시작하는 이미지 주소만 쓸 수 있어요. 문서에 이미지가 나오지 않아요.";
    } else if (value) {
      kind = "ok";
      text = "이미지 주소로 넣었어요.";
    }
    hint.textContent = text;
    hint.className = `list-hint${kind ? ` is-${kind}` : ""}`;
  });
}

function afterImageChange() {
  fillOverviewVideoHint();
  fillImageFields(document);
  saveToLocalStorage();
  render();
}

// 파일 → 줄인 data URL (투명 배경 유지를 위해 webp, 안 되면 png)
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
      im.onload = () => {
        const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(im.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(im.naturalHeight * scale));
        canvas.getContext("2d").drawImage(im, 0, 0, canvas.width, canvas.height);
        let data = canvas.toDataURL("image/webp", 0.9);
        if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/png");
        resolve(data);
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function handleImageChange(event) {
  const input = event.target;
  if (input.dataset && input.dataset.exprAdd) {
    addExpressionFiles(input.dataset.exprAdd, [...(input.files || [])]);
    input.value = "";
    return;
  }
  if (input.dataset && input.dataset.exprRefile) {
    refileExpression(input.dataset.exprRefile, input.files && input.files[0]);
    input.value = "";
    return;
  }
  if (!input.dataset || !input.dataset.imageFile) return;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 넣을 수 있어요.");
    return;
  }
  const path = input.dataset.imageFile;
  readImageFile(file)
    .then((data) => {
      setPath(state, path, data);
      updateListTitle(path);
      afterImageChange();
    })
    .catch((error) => alert(`이미지 넣기 실패: ${error.message}`));
}

function handleImageClick(event) {
  const button = event.target.closest("[data-image-clear]");
  if (!button) return;
  setPath(state, button.dataset.imageClear, "");
  afterImageChange();
}

/* ---------- 5-5. 스킨 (기본 3칸 고정 + 스킨 테마 목록) ---------- */

function newSkinId() {
  return `skin-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function cleanSkinEffects(list) {
  const effects = Array.isArray(list) ? list : [];
  const out = [];
  Object.entries(GAME_DATA.skinEffect).forEach(([key, effect]) => {
    if (!effects.includes(key)) return;
    if ((effect.excludes || []).some((other) => out.includes(other))) return; // 같이 못 고르면 앞의 것만
    out.push(key);
  });
  return out;
}

// 적용범위 체크박스 묶음
function skinEffectField(path) {
  const wrap = document.createElement("div");
  wrap.className = "list-field";
  wrap.append(document.createTextNode("적용범위 (여러 개 선택 · Live2D와 Animated는 하나만)"));
  const grid = document.createElement("div");
  grid.className = "skin-effect-grid";
  Object.entries(GAME_DATA.skinEffect).forEach(([key, effect]) => {
    const label = document.createElement("label");
    label.className = "skin-effect-choice";
    label.title = effect.desc;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = key;
    input.dataset.toggleField = path;
    input.dataset.toggleOrder = "skinEffect";
    if (effect.excludes) input.dataset.excludes = effect.excludes.join(",");
    const badge = document.createElement("span");
    badge.className = "skin-effect-badge";
    badge.style.background = effect.color;
    badge.style.color = effect.text;
    badge.textContent = effect.label;
    const desc = document.createElement("small");
    desc.textContent = effect.desc;
    label.append(input, badge, desc);
    grid.appendChild(label);
  });
  wrap.appendChild(grid);
  return wrap;
}

function fixedNote(label, text) {
  const note = document.createElement("div");
  note.className = "skin-fixed-note";
  const b = document.createElement("b");
  b.textContent = label;
  note.append(b, document.createTextNode(` ${text}`));
  return note;
}

// 기본 스킨 3칸 (접는 블록, 고정)
function buildSkinBaseEditor() {
  const box = document.getElementById("skinBaseEditor");
  box.innerHTML = "";
  GAME_DATA.skinBase.forEach((slot, index) => {
    const base = `skin.base.${slot.key}`;
    const block = document.createElement("details");
    block.className = "story-slot";
    if (index === 0) block.open = true;
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "story-slot-name";
    name.textContent = slot.label;
    const status = document.createElement("span");
    status.className = "story-slot-status";
    status.dataset.skinBaseStatus = slot.key;
    summary.append(name, status);

    const body = document.createElement("div");
    body.className = "story-slot-body";
    body.append(
      listTextField(`${base}.name`, "투영 이름"),
      imageField(`${base}.image`, "이미지 (프로필 카드 같은 칸에도 나와요)"),
      listTextField(`${base}.illustrator`, "일러스트레이터"),
      fixedNote("입수방법", slot.acquisition),
      skinEffectField(`${base}.effects`),
      fixedNote("설명", slot.description),
      listTextField(`${base}.quote`, "스킨 대사", { multiline: true, rows: 2 })
    );
    block.append(summary, body);
    box.appendChild(block);
  });
}

function fillSkinBaseStatus() {
  GAME_DATA.skinBase.forEach((slot) => {
    const el = document.querySelector(`[data-skin-base-status="${slot.key}"]`);
    if (!el) return;
    const name = state.skin.base[slot.key].name.trim();
    el.textContent = name || "이름 없음";
    el.classList.toggle("is-written", Boolean(name));
  });
}

defineList("skin.items", {
  label: "스킨 테마",
  addLabel: "+ 스킨 테마 추가",
  fold: true,
  // id: 스킨 보이스 세트가 이 스킨을 가리킬 때 쓰는 고유 표시 (이름을 바꿔도 연결 유지, 화면에 안 보임)
  item: { id: "", theme: "", name: "", image: "", illustrator: "", acquisition: "", effects: [], description: "", quote: "" },
  init: (item) => {
    item.id = newSkinId();
  },
  clean: (item) => ({ ...item, id: item.id || newSkinId(), effects: cleanSkinEffects(item.effects) }),
  title: (item) => [item.theme.trim(), item.name.trim()].filter(Boolean).join(" - "),
  fields: (base) => {
    const row = document.createElement("div");
    row.className = "list-field-row";
    row.append(listTextField(`${base}.theme`, "테마 이름"), listTextField(`${base}.name`, "스킨 이름"));
    const titleHint = document.createElement("div");
    titleHint.className = "list-hint is-warn";
    titleHint.dataset.skinTitleHint = base;
    titleHint.textContent = "테마 이름이나 스킨 이름 중 하나는 있어야 문서에 나와요 (적은 내용은 그대로 남아 있어요).";
    return [
      row,
      titleHint,
      imageField(`${base}.image`, "이미지"),
      listTextField(`${base}.illustrator`, "일러스트레이터"),
      listTextField(`${base}.acquisition`, "입수방법", { multiline: true, rows: 2 }),
      skinEffectField(`${base}.effects`),
      listTextField(`${base}.description`, "설명", { multiline: true, rows: 2 }),
      listTextField(`${base}.quote`, "스킨 대사", { multiline: true, rows: 2 }),
    ];
  },
  sync: (base, item) => {
    const titleHint = document.querySelector(`[data-skin-title-hint="${base}"]`);
    if (titleHint) titleHint.hidden = Boolean(item.theme.trim() || item.name.trim());
  },
});

/* ---------- 5-5b. 친밀도 서약 미리보기 안내 ---------- */
function fillOathPreview() {
  const el = document.getElementById("oathPreview");
  if (!el) return;
  const text = getOathTitleText(state);
  el.textContent = text
    ? `칭호 미리보기: ${text}`
    : "적은 그대로 「칭호 · 수식어   칭호 · 단어」로 나와요.";
}

/* ---------- 5-6. 인형 관계 (가변 목록) ---------- */

defineList("relationship.items", {
  label: "관계",
  addLabel: "+ 관계 추가",
  item: { relation: "", person: "" },
  title: (item) => [item.relation.trim(), stripLinkMarks(item.person).trim()].filter(Boolean).join(" - "),
  fields: (base) => {
    const row = document.createElement("div");
    row.className = "list-field-row";
    row.append(
      listTextField(`${base}.relation`, "관계명"),
      listTextField(`${base}.person`, "인물명")
    );
    const hint = document.createElement("div");
    hint.className = "list-hint";
    hint.dataset.relationHint = base;
    return [row, hint];
  },
  // 인물명 링크 표기 확인: 주소가 잘못됐으면 알려 줌
  sync: (base, item) => {
    const el = document.querySelector(`[data-relation-hint="${base}"]`);
    if (!el) return;
    const marks = [...item.person.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)];
    const bad = marks.filter((m) => !safeLinkUrl(m[2]));
    el.textContent = bad.length
      ? `「${bad[0][1]}」의 주소가 http:// 또는 https:// 로 시작하지 않아서 링크 없이 글자만 나와요.`
      : marks.length
        ? `링크 ${marks.length}개가 걸려요.`
        : "";
    el.classList.toggle("is-warn", bad.length > 0);
    el.classList.toggle("is-ok", !bad.length && marks.length > 0);
  },
});

/* ---------- 5-7. 스킨 보이스 세트 (가변 목록) ---------- */
// 스킨 테마 중 적용범위 「보이스」를 켠 스킨만 고를 수 있음 (기본/확장/완벽 투영은 제외)
// 고른 스킨은 id로 연결 → 스킨 이름을 바꾸면 제목·설명·표 머리가 자동으로 따라감

function emptySkinVoiceLines() {
  return Object.fromEntries(GAME_DATA.skinVoiceSlots.map((slot) => [slot.key, ""]));
}

// 고를 수 있는 스킨: [id, "스킨 이름 (테마 이름)"]
function getVoiceSkinChoices() {
  return state.skin.items
    .filter((item) => item.effects.includes("voice") && (item.name.trim() || item.theme.trim()))
    .map((item) => {
      const name = item.name.trim() || item.theme.trim();
      const theme = item.name.trim() && item.theme.trim() ? ` (${item.theme.trim()})` : "";
      return [item.id, `${name}${theme}`];
    });
}

// 스킨 선택 칸 선택지 다시 채우기 (스킨을 고치거나 추가·삭제할 때마다)
function refreshVoiceSkinSelects() {
  const choices = getVoiceSkinChoices();
  document.querySelectorAll("[data-voice-skin]").forEach((select) => {
    const value = getPath(state, select.dataset.field) || "";
    select.innerHTML = "";
    select.appendChild(new Option("선택 안 함", ""));
    choices.forEach(([id, label]) => select.appendChild(new Option(label, id)));
    select.value = choices.some(([id]) => id === value) ? value : "";
    const hint = document.querySelector(`[data-voice-skin-hint="${select.dataset.voiceSkin}"]`);
    if (hint) {
      const broken = value && !choices.some(([id]) => id === value);
      hint.hidden = !broken && Boolean(choices.length);
      hint.textContent = broken
        ? "고른 스킨이 지워졌거나 「보이스」 체크가 꺼졌어요. 다시 골라 주세요."
        : "스킨 → 스킨 테마에서 적용범위 「보이스」를 켠 스킨만 고를 수 있어요.";
    }
  });
}

defineList("voice.sets", {
  label: "스킨 보이스 세트",
  addLabel: "+ 스킨 보이스 세트 추가",
  fold: true,
  item: { skinId: "", dialogues: GAME_DATA.skinVoiceDialogueMax, lines: emptySkinVoiceLines() },
  clean: (item) => ({
    ...item,
    dialogues: Math.min(GAME_DATA.skinVoiceDialogueMax, Math.max(1, Math.round(Number(item.dialogues) || 1))),
  }),
  title: (item) => {
    const skin = state.skin.items.find((s) => s.id === item.skinId);
    return skin ? skin.name.trim() || skin.theme.trim() : "";
  },
  fields: (base, item) => {
    const skinRow = document.createElement("label");
    skinRow.className = "list-field";
    const select = document.createElement("select");
    select.dataset.field = `${base}.skinId`;
    select.dataset.voiceSkin = base;
    skinRow.append(document.createTextNode("스킨"), select);
    const hint = document.createElement("div");
    hint.className = "list-hint is-warn";
    hint.dataset.voiceSkinHint = base;

    const rows = [skinRow, hint];
    GAME_DATA.skinVoiceSlots.forEach((slot) => {
      if (slot.dialogue && slot.dialogue > item.dialogues) return;
      const field = document.createElement("label");
      field.className = "list-field voice-line";
      const head = document.createElement("span");
      head.className = "voice-line-head";
      const name = document.createElement("b");
      name.textContent = slot.label;
      const code = document.createElement("small");
      code.textContent = slot.code;
      head.append(name, code);
      const text = document.createElement("textarea");
      text.rows = 2;
      text.dataset.field = `${base}.lines.${slot.key}`;
      field.append(head, text);
      rows.push(field);
      // 마지막 메인화면 대사 뒤에 +/− 버튼
      if (slot.dialogue === item.dialogues) {
        const tools = document.createElement("div");
        tools.className = "voice-dialogue-tools";
        const minus = document.createElement("button");
        minus.type = "button";
        minus.className = "list-btn";
        minus.textContent = "− 메인화면 대사";
        minus.dataset.voiceDialogue = base;
        minus.dataset.delta = "-1";
        minus.disabled = item.dialogues <= 1;
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "list-btn";
        plus.textContent = "+ 메인화면 대사";
        plus.dataset.voiceDialogue = base;
        plus.dataset.delta = "1";
        plus.disabled = item.dialogues >= GAME_DATA.skinVoiceDialogueMax;
        const count = document.createElement("small");
        count.textContent = `메인화면 대사 ${item.dialogues}/${GAME_DATA.skinVoiceDialogueMax}칸`;
        tools.append(minus, plus, count);
        rows.push(tools);
      }
    });
    return rows;
  },
});

// 메인화면 대사 칸 +/− (줄일 때 그 칸에 글이 있으면 확인 후 비움)
function handleVoiceDialogueClick(event) {
  const button = event.target.closest("[data-voice-dialogue]");
  if (!button || button.disabled) return;
  const base = button.dataset.voiceDialogue;
  const set = getPath(state, base);
  if (!set) return;
  const delta = Number(button.dataset.delta);
  const next = set.dialogues + delta;
  if (next < 1 || next > GAME_DATA.skinVoiceDialogueMax) return;
  if (delta < 0) {
    const slot = GAME_DATA.skinVoiceSlots.find((s) => s.dialogue === set.dialogues);
    if (set.lines[slot.key].trim() && !confirm(`${slot.label} 칸을 지울까요? 적은 대사도 같이 지워져요.`)) return;
    set.lines[slot.key] = "";
  }
  set.dialogues = next;
  drawList("voice.sets");
  refreshVoiceSkinSelects();
  saveToLocalStorage();
  render();
}

/* ---------- 5-8. 기타 (가변 목록) ---------- */

defineList("etc.items", {
  label: "항목",
  addLabel: "+ 기타 항목 추가",
  item: { text: "" },
  title: (item) => {
    const text = item.text.trim().replace(/\s+/g, " ");
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  },
  fields: (base) => [listTextField(`${base}.text`, "내용", { multiline: true, rows: 3 })],
});

/* ---------- 5-9. 이미지 여러 장 목록 (일러스트 CG 한 항목 안) ---------- */
// imageListField(path, label): path = 이미지 배열 경로. 칸마다 imageField + [↑][↓][삭제], 끝에 [+ 이미지]
// 배열 편집 버튼: data-arr-action="add|up|down|remove" data-arr-path data-arr-index (editorPanel 클릭 위임)
// 감정 표현 이미지 배열도 같은 버튼(↑↓삭제)을 씀

function ownerListPath(path) {
  return Object.keys(LIST_DEFS).find((p) => path.startsWith(`${p}.`));
}

function makeArrButton(text, action, path, index, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-btn";
  button.textContent = text;
  button.title = title;
  button.dataset.arrAction = action;
  button.dataset.arrPath = path;
  if (index !== undefined) button.dataset.arrIndex = String(index);
  return button;
}

function arrTools(path, index, length) {
  const tools = document.createElement("div");
  tools.className = "arr-tools";
  const up = makeArrButton("↑", "up", path, index, "앞으로");
  const down = makeArrButton("↓", "down", path, index, "뒤로");
  const remove = makeArrButton("삭제", "remove", path, index, "이 이미지 삭제");
  remove.classList.add("danger");
  up.disabled = index === 0;
  down.disabled = index === length - 1;
  tools.append(up, down, remove);
  return tools;
}

function imageListField(path, label) {
  const wrap = document.createElement("div");
  wrap.className = "list-field image-list";
  wrap.append(document.createTextNode(label));
  const list = getPath(state, path) || [];
  list.forEach((_, i) => {
    const row = document.createElement("div");
    row.className = "image-list-row";
    row.append(imageField(`${path}.${i}`, `이미지 ${i + 1}`), arrTools(path, i, list.length));
    wrap.appendChild(row);
  });
  const add = makeArrButton("+ 이미지 추가", "add", path, undefined, "이미지 칸 추가");
  add.classList.add("list-add");
  wrap.appendChild(add);
  return wrap;
}

function handleArrClick(event) {
  const button = event.target.closest("[data-arr-action]");
  if (!button || button.disabled) return;
  const path = button.dataset.arrPath;
  const list = getPath(state, path);
  if (!Array.isArray(list)) return;
  const index = Number(button.dataset.arrIndex);
  const action = button.dataset.arrAction;
  if (action === "add") list.push("");
  else if (action === "remove") {
    const value = list[index];
    const filled = typeof value === "string" ? Boolean(value) : Boolean(value && (value.source || value.result));
    if (filled && !confirm("이 이미지를 삭제할까요?")) return;
    list.splice(index, 1);
  } else {
    const to = index + (action === "up" ? -1 : 1);
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
  }
  const owner = ownerListPath(path);
  if (owner) drawList(owner);
  saveToLocalStorage();
  render();
}

/* ---------- 5-10. 8.2 일러스트: 스탠딩 CG · 일러스트 CG ---------- */

defineList("illustration.standing", {
  label: "스탠딩 CG",
  addLabel: "+ 스탠딩 CG 추가",
  fold: true,
  item: { title: "", image: "" },
  title: (item) => item.title.trim(),
  fields: (base) => [listTextField(`${base}.title`, "어떤 때의 스탠딩인지"), imageField(`${base}.image`, "이미지")],
});

function cgListDef(label) {
  return {
    label,
    addLabel: "+ CG 항목 추가",
    fold: true,
    item: { title: "", images: [] },
    clean: (item) => ({ ...item, images: item.images.filter((v) => typeof v === "string") }),
    title: (item) => item.title.trim(),
    fields: (base) => [listTextField(`${base}.title`, "제목"), imageListField(`${base}.images`, "이미지 (여러 장)")],
  };
}
defineList("illustration.cg.story", cgListDef("CG"));
defineList("illustration.cg.event", cgListDef("일반 CG"));

// 등장 스토리를 골랐을 때만 메인/전속 CG 입력 보이기 (선택 안 함이면 숨김, 넣어 둔 내용은 유지)
function fillStoryCgGroup() {
  const group = document.getElementById("cgStoryGroup");
  if (!group) return;
  const item = GAME_DATA.storyType[state.profile.storyType];
  group.hidden = !item;
  const label = document.getElementById("cgStoryLabel");
  if (label && item) label.textContent = `${item.short} CG (${item.label} 일러스트)`;
}

/* ---------- 5-11. 감정 표현 (묶음 + 영역 고르기) ---------- */
// 그림 전체를 보여 주고 정사각형 영역 밖은 반투명하게 → ↑↓←→로 옮기고 ＋/－로 크기 조절
// 영역만 256×256 결과로 만들어 문서에 씀. 원본·영역은 남겨서 언제든 다시 조절
// 마지막으로 맞춘 영역을 기억 → 다음에 넣는 그림(표정만 다른 스탠딩 등)에 같은 위치·크기로 적용
const EXPR_SIZE = 256;
const EXPR_MOVE_STEP = 0.04; // 한 번 누를 때 짧은 변의 4%
const EXPR_ZOOM_STEP = 0.9;
const EXPR_MIN_SIZE = 0.1;

function cleanExprArea(area) {
  const a = isPlainObject(area) ? area : {};
  const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    cx: Math.min(1, Math.max(0, num(a.cx, 0.5))),
    cy: Math.min(1, Math.max(0, num(a.cy, 0.3))),
    size: Math.min(1, Math.max(EXPR_MIN_SIZE, num(a.size, 0.5))),
  };
}

// 영역이 그림 밖으로 나가지 않게 (빈 공간이 안 보이게)
function clampExprArea(item) {
  const area = cleanExprArea(item);
  item.size = area.size;
  if (!(item.w > 0 && item.h > 0)) {
    item.cx = area.cx;
    item.cy = area.cy;
    return item;
  }
  const side = item.size * Math.min(item.w, item.h);
  const hx = side / 2 / item.w;
  const hy = side / 2 / item.h;
  item.cx = Math.min(1 - hx, Math.max(hx, area.cx));
  item.cy = Math.min(1 - hy, Math.max(hy, area.cy));
  return item;
}

function cleanExprImage(raw) {
  const r = isPlainObject(raw) ? raw : {};
  const str = (v) => (typeof v === "string" ? v : "");
  const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return clampExprArea({ source: str(r.source), w: num(r.w), h: num(r.h), cx: r.cx, cy: r.cy, size: r.size, result: str(r.result) });
}

const exprImageCache = new Map();
function loadImage(src) {
  if (!exprImageCache.has(src)) {
    exprImageCache.set(
      src,
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
        im.src = src;
      })
    );
  }
  return exprImageCache.get(src);
}

// 영역 → 256×256 결과 (투명 유지: webp, 안 되면 png)
async function makeExprResult(item) {
  const im = await loadImage(item.source);
  const side = item.size * Math.min(item.w, item.h);
  const sx = item.cx * item.w - side / 2;
  const sy = item.cy * item.h - side / 2;
  const canvas = document.createElement("canvas");
  canvas.width = EXPR_SIZE;
  canvas.height = EXPR_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, sx, sy, side, side, 0, 0, EXPR_SIZE, EXPR_SIZE);
  let data = canvas.toDataURL("image/webp", 0.92);
  if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/png");
  return data;
}

function exprFrameStyle(item) {
  if (!(item.w > 0 && item.h > 0)) return "";
  const side = item.size * Math.min(item.w, item.h);
  const left = ((item.cx * item.w - side / 2) / item.w) * 100;
  const top = ((item.cy * item.h - side / 2) / item.h) * 100;
  return `left:${left}%;top:${top}%;width:${(side / item.w) * 100}%;height:${(side / item.h) * 100}%;`;
}

// 원본 파일 → { source, w, h } (긴 변 1600px까지 줄임)
async function readExprSource(file) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 넣을 수 있어요.");
  const source = await readImageFile(file);
  const im = await loadImage(source);
  return { source, w: im.naturalWidth, h: im.naturalHeight };
}

async function addExpressionFiles(groupPath, files) {
  const group = getPath(state, groupPath);
  if (!group || !files.length) return;
  for (const file of files) {
    try {
      const src = await readExprSource(file);
      const item = clampExprArea({ ...src, ...state.expression.lastArea, result: "" });
      item.result = await makeExprResult(item);
      group.images.push(item);
    } catch (error) {
      alert(`이미지 넣기 실패: ${error.message}`);
    }
  }
  drawList("expression.groups");
  saveToLocalStorage();
  render();
}

// 새로고침 등으로 원본이 빠진 칸에 다시 넣기 (저장해 둔 영역 그대로)
async function refileExpression(path, file) {
  const item = getPath(state, path);
  if (!item || !file) return;
  try {
    Object.assign(item, await readExprSource(file));
    clampExprArea(item);
    item.result = await makeExprResult(item);
  } catch (error) {
    alert(`이미지 넣기 실패: ${error.message}`);
    return;
  }
  drawList("expression.groups");
  saveToLocalStorage();
  render();
}

let exprBusy = Promise.resolve();
function handleExprClick(event) {
  const button = event.target.closest("[data-expr-move]");
  if (!button || button.disabled) return;
  const path = button.dataset.exprMove;
  const item = getPath(state, path);
  if (!item || !item.source) return;
  const short = Math.min(item.w, item.h);
  const dir = button.dataset.dir;
  if (dir === "up") item.cy -= (EXPR_MOVE_STEP * short) / item.h;
  if (dir === "down") item.cy += (EXPR_MOVE_STEP * short) / item.h;
  if (dir === "left") item.cx -= (EXPR_MOVE_STEP * short) / item.w;
  if (dir === "right") item.cx += (EXPR_MOVE_STEP * short) / item.w;
  if (dir === "in") item.size = Math.max(EXPR_MIN_SIZE, item.size * EXPR_ZOOM_STEP);
  if (dir === "out") item.size = Math.min(1, item.size / EXPR_ZOOM_STEP);
  clampExprArea(item);
  state.expression.lastArea = { cx: item.cx, cy: item.cy, size: item.size };
  const frame = document.querySelector(`[data-expr-frame="${path}"]`);
  if (frame) frame.style.cssText = exprFrameStyle(item); // 테두리는 바로 갱신
  exprBusy = exprBusy
    .then(async () => {
      item.result = await makeExprResult(item);
      const thumb = document.querySelector(`[data-expr-result="${path}"]`);
      if (thumb) thumb.src = item.result;
      saveToLocalStorage();
      render();
    })
    .catch(() => {}); // 실패해도 다음 버튼은 계속 동작
}

function exprImageEditor(path, item, index, length) {
  const wrap = document.createElement("div");
  wrap.className = "expr-item";
  wrap.dataset.exprItem = path;

  const stage = document.createElement("div");
  stage.className = "expr-stage";
  const side = document.createElement("div");
  side.className = "expr-side";

  if (item.source) {
    const im = document.createElement("img");
    im.src = item.source;
    im.alt = "";
    const frame = document.createElement("div");
    frame.className = "expr-frame";
    frame.dataset.exprFrame = path;
    frame.style.cssText = exprFrameStyle(item);
    stage.append(im, frame);

    const result = document.createElement("img");
    result.className = "expr-result";
    result.dataset.exprResult = path;
    result.alt = "결과";
    if (item.result) result.src = item.result;
    const pad = document.createElement("div");
    pad.className = "expr-pad";
    // 방향 패드 모양: [＋][↑][－] / [←][↓][→]
    [["in", "＋", "확대 (영역 작게)"], ["up", "↑", "위로"], ["out", "－", "축소 (영역 크게)"], ["left", "←", "왼쪽으로"], ["down", "↓", "아래로"], ["right", "→", "오른쪽으로"]].forEach(
      ([dir, text, title]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "list-btn";
        b.textContent = text;
        b.title = title;
        b.dataset.exprMove = path;
        b.dataset.dir = dir;
        pad.appendChild(b);
      }
    );
    const padCaption = document.createElement("div");
    padCaption.className = "expr-caption";
    padCaption.textContent = "영역 옮기기 · 크기";
    side.append(result, padCaption, pad);
  } else {
    const empty = document.createElement("div");
    empty.className = "expr-missing";
    empty.textContent = "그림이 비어 있어요 (새로고침하면 직접 넣은 그림은 빠져요). 같은 그림을 다시 넣으면 맞춰 둔 위치 그대로 적용돼요.";
    const label = document.createElement("label");
    label.className = "list-btn image-file-btn";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.dataset.exprRefile = path;
    label.append(file, document.createTextNode("다시 넣기"));
    stage.appendChild(empty);
    side.appendChild(label);
  }
  const orderCaption = document.createElement("div");
  orderCaption.className = "expr-caption";
  orderCaption.textContent = "그림 순서";
  side.append(orderCaption, arrTools(path.slice(0, path.lastIndexOf(".")), index, length));
  wrap.append(stage, side);
  return wrap;
}

function exprSourceTitle(source) {
  if (source === "base") return "기본";
  const skin = state.skin.items.find((item) => item.id === source);
  return skin ? skin.name.trim() || skin.theme.trim() : "";
}

// 묶음 대상 선택지 (기본 + 스킨 테마). 다른 묶음이 쓰는 대상은 고를 수 없음
function refreshExprSourceSelects() {
  const skins = state.skin.items.filter((item) => item.name.trim() || item.theme.trim());
  const choices = [["base", "기본"], ...skins.map((item) => [item.id, item.name.trim() || item.theme.trim()])];
  const groups = state.expression.groups;
  document.querySelectorAll("[data-expr-source]").forEach((select) => {
    const index = Number(select.dataset.exprSource);
    const value = groups[index] ? groups[index].source : "";
    const used = groups.map((g, i) => (i === index ? "" : g.source)).filter(Boolean);
    select.innerHTML = "";
    select.appendChild(new Option("선택 안 함", ""));
    choices.forEach(([key, label]) => {
      const option = new Option(label, key);
      option.disabled = used.includes(key);
      select.appendChild(option);
    });
    const known = choices.some(([key]) => key === value);
    select.value = known ? value : "";
    const hint = document.querySelector(`[data-expr-source-hint="${index}"]`);
    if (hint) {
      hint.hidden = known || !value;
      hint.textContent = "연결된 스킨이 지워졌어요. 다시 골라 주세요 (그림은 그대로 있어요).";
    }
  });
}

defineList("expression.groups", {
  label: "감정 표현",
  addLabel: "+ 감정 표현 묶음 추가",
  fold: true,
  item: { source: "", images: [] },
  clean: (item) => ({ ...item, source: typeof item.source === "string" ? item.source : "", images: item.images.map(cleanExprImage) }),
  title: (item) => exprSourceTitle(item.source),
  fields: (base, item, index) => {
    const pick = document.createElement("label");
    pick.className = "list-field";
    const select = document.createElement("select");
    select.dataset.field = `${base}.source`;
    select.dataset.exprSource = String(index);
    pick.append(document.createTextNode("어느 그림의 감정 표현인지"), select);
    const hint = document.createElement("div");
    hint.className = "list-hint is-warn";
    hint.dataset.exprSourceHint = String(index);
    hint.hidden = true;

    const images = document.createElement("div");
    images.className = "expr-list";
    item.images.forEach((image, i) => images.appendChild(exprImageEditor(`${base}.images.${i}`, image, i, item.images.length)));

    const add = document.createElement("label");
    add.className = "list-btn list-add image-file-btn";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.multiple = true;
    file.dataset.exprAdd = base;
    add.append(file, document.createTextNode("+ 그림 파일 넣기 (여러 장 가능)"));
    return [pick, hint, images, add];
  },
});

/* ---------- 5-12. 성능: 스킬 · 평가 ---------- */

function skillTextField(field, label, rows) {
  const wrap = listTextField(field, label, rows ? { multiline: true, rows } : {});
  return wrap;
}

function buildSkillEditor() {
  const box = document.getElementById("skillEditor");
  box.innerHTML = "";
  GAME_DATA.skillSlots.forEach((slot, index) => {
    const base = `performance.skills.${slot.key}`;
    const block = document.createElement("details");
    block.className = "story-slot";
    if (index === 0) block.open = true;
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "story-slot-name";
    name.textContent = slot.label;
    const status = document.createElement("span");
    status.className = "story-slot-status";
    status.dataset.skillStatus = slot.key;
    summary.append(name, status);

    const body = document.createElement("div");
    body.className = "story-slot-body";
    body.append(imageField(`${base}.icon`, "스킬 아이콘"), skillTextField(`${base}.name`, "스킬 이름"));
    if (slot.cooldown) body.append(skillTextField(`${base}.cooldown`, "쿨타임 (초, 숫자만)"));
    if (slot.fixedCooldown) {
      const note = document.createElement("div");
      note.className = "skin-fixed-note";
      note.innerHTML = `<b>쿨타임</b> ${slot.fixedCooldown}초 (고정)`;
      body.append(note);
    }
    body.append(skillTextField(`${base}.desc`, "스킬 설명", 4));
    if (slot.precharge) {
      const row = document.createElement("div");
      row.className = "skill-pre-row";
      row.append(
        skillTextField(`${base}.precharge.base`, "예충전 (초)"),
        skillTextField(`${base}.precharge.star3`, "★3 (초)"),
        skillTextField(`${base}.precharge.star5`, "★5 (초)")
      );
      body.append(row);
    }
    if (slot.cutscene) body.append(imageField(`${base}.cutscene`, "궁극기 컷씬 (움짤 gif도 가능)"));
    body.append(skillTextField(`${base}.levels`, `1레벨 효과 (숫자는 {처음~끝} 등 — 아래 안내 참고, ${slot.levels}레벨까지 자동)`, 4));
    const preview = document.createElement("div");
    preview.className = "skill-level-preview";
    preview.dataset.skillLevels = slot.key;
    body.append(preview);

    block.append(summary, body);
    box.appendChild(block);
  });
}

// 레벨 미리보기 (자동 글 / 직접 고친 글) + 레벨마다 [직접 고치기]·[자동으로 되돌리기]
function fillSkillLevels(onlyKey) {
  GAME_DATA.skillSlots.forEach((slot) => {
    if (onlyKey && slot.key !== onlyKey) return;
    const box = document.querySelector(`[data-skill-levels="${slot.key}"]`);
    if (!box) return;
    const skill = state.performance.skills[slot.key];
    const base = skill.levels.trim();
    const anyOverride = skill.overrides.some((v) => v.trim());
    box.innerHTML = "";
    if (!base && !anyOverride) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const title = document.createElement("div");
    title.className = "skill-level-title";
    title.textContent = "레벨별 미리보기";
    box.appendChild(title);
    for (let i = 0; i < slot.levels; i += 1) {
      const own = skill.overrides[i];
      const row = document.createElement("div");
      row.className = `skill-level-row${own.trim() ? " is-own" : ""}`;
      const num = document.createElement("span");
      num.className = "skill-level-num";
      num.textContent = `Lv.${i + 1}`;
      const text = document.createElement("div");
      text.className = "skill-level-text";
      if (editingLevel === `${slot.key}.${i}`) {
        const area = document.createElement("textarea");
        area.rows = 3;
        area.dataset.field = `performance.skills.${slot.key}.overrides.${i}`;
        area.value = own || makeLevelText(base, i, slot.levels);
        text.appendChild(area);
      } else {
        text.innerHTML = renderMarkup(own.trim() || makeLevelText(base, i, slot.levels), true) || "<i>(비어 있음)</i>";
      }
      const tools = document.createElement("span");
      tools.className = "skill-level-tools";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "list-btn";
      edit.dataset.skillEdit = `${slot.key}.${i}`;
      edit.textContent = editingLevel === `${slot.key}.${i}` ? "완료" : "직접 고치기";
      tools.appendChild(edit);
      if (own.trim()) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "list-btn";
        reset.dataset.skillReset = `${slot.key}.${i}`;
        reset.textContent = "자동으로";
        reset.title = "직접 고친 글을 지우고 자동 글로 되돌리기";
        tools.appendChild(reset);
      }
      row.append(num, text, tools);
      box.appendChild(row);
    }
  });
}

let editingLevel = "";

function handleSkillClick(event) {
  const edit = event.target.closest("[data-skill-edit]");
  const reset = event.target.closest("[data-skill-reset]");
  if (!edit && !reset) return;
  const [key, i] = (edit || reset).dataset[edit ? "skillEdit" : "skillReset"].split(".");
  const skill = state.performance.skills[key];
  if (reset) {
    skill.overrides[Number(i)] = "";
    if (editingLevel === `${key}.${i}`) editingLevel = "";
  } else if (editingLevel === `${key}.${i}`) {
    // 완료: 자동 글과 똑같으면 직접 고친 걸로 남기지 않음
    const slot = GAME_DATA.skillSlots.find((s) => s.key === key);
    if (skill.overrides[Number(i)].trim() === makeLevelText(skill.levels.trim(), Number(i), slot.levels).trim()) skill.overrides[Number(i)] = "";
    editingLevel = "";
  } else {
    editingLevel = `${key}.${i}`;
  }
  fillSkillLevels(key);
  const area = document.querySelector(`[data-field="performance.skills.${key}.overrides.${i}"]`);
  if (area) area.focus();
  saveToLocalStorage();
  render();
}

function fillSkillStatus() {
  GAME_DATA.skillSlots.forEach((slot) => {
    const el = document.querySelector(`[data-skill-status="${slot.key}"]`);
    if (!el) return;
    // 머리에는 표기 기호를 뺀 이름만 (^태그^ 제거, * _ ~ 기호 제거)
    const name = state.performance.skills[slot.key].name
      .replace(/\^[^^\n]*\^/g, "")
      .replace(/\[([^\]\n]+)\]\{[^}\n]+\}/g, "$1")
      .replace(/[*_~\\]/g, "")
      .trim();
    el.textContent = name || "비어 있음";
    el.classList.toggle("is-written", Boolean(name));
  });
}

// 평가: 「+ 평가 추가」 → 글 칸 생김, 「− 평가 삭제」 → 없어짐 (글이 있으면 확인)
function fillReviewEditor() {
  const added = state.performance.review.added;
  document.getElementById("reviewAdd").hidden = added;
  document.getElementById("reviewBox").hidden = !added;
}

function handleReviewClick(event) {
  if (event.target.closest("#reviewAdd")) {
    state.performance.review.added = true;
  } else if (event.target.closest("#reviewRemove")) {
    if (state.performance.review.text.trim() && !confirm("평가를 삭제할까요? 적은 글도 같이 지워져요.")) return;
    state.performance.review = { added: false, text: "" };
    fillForm();
  } else return;
  fillReviewEditor();
  saveToLocalStorage();
  render();
}

// 표기법·레벨 안내 (사전은 GAME_DATA에서 만들어서 항상 최신)
function buildMarkupGuide() {
  const box = document.getElementById("termDictionaryGuide");
  if (!box) return;
  box.innerHTML = "";
  Object.entries(GAME_DATA.termColor).forEach(([kind, info]) => {
    const words = Object.entries(GAME_DATA.termDictionary)
      .filter(([, k]) => k === kind)
      .map(([w]) => w);
    const row = document.createElement("div");
    const label = document.createElement("b");
    label.style.color = info.color;
    label.textContent = info.label;
    row.append(label, document.createTextNode(` ${words.length ? words.join(", ") : "(그 외 모든 단어)"}`));
    box.appendChild(row);
  });
}

/* ---------- 5-13. 성능: 능력치 자동생성 ---------- */
// 자료: data/stat-db.js의 STAT_RAW (공식 인형 93명). 직군 = profile.class, 최초 성급 = profile.rarity
// 공식 (자몽·체리 합의, 비율은 GAME_DATA.statRule):
//   공격력·연산력 : 중앙값 × (1 ± W·t) 삼각 랜덤. 비주력은 ±W/3, 주력×0.9 이하. 쌍두는 두 중앙값 평균 중심, 차이 ≤4%
//   관통          : 중앙값 × (만들어진 공격력/연산력 ÷ 그 중앙값)
//   체력·방어     : 중앙값 × (1 ± tankW·tTank)
//   공속·치명·회피·전투 후 회복 : 같은 직군 실제 인형 1명의 단계별 값 (? 인 값만 다른 인형에서)
//   치명타 피해   : 기본 50% 고정 (직접 바꾼 값은 다시 생성해도 유지)
//   난수는 버튼 한 번에 t, t2, s, tTank, 인형 하나씩 → 모든 단계에 같은 값

function statLabel(key) {
  return GAME_DATA.attribute[key].label;
}

// "1123" / "10%" / "7.5%" → 숫자, "?"·빈칸 → null
function parseStatValue(raw) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(String(raw == null ? "" : raw));
  return m ? Number(m[1]) : null;
}

function rawStat(doll, stageRaw, key) {
  return parseStatValue(doll[`${stageRaw}_${statLabel(key)}`]);
}

function median(values) {
  const list = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

// 단계 자료에 쓸 인형들: init은 같은 직군·같은 최초 성급, 5성은 같은 직군 전체
function statPool(classLabel, stage, rarity) {
  return STAT_RAW.filter((doll) => doll.class === classLabel && (stage.key !== "init" || String(doll.grade) === String(rarity)));
}

function statMedian(classLabel, stage, rarity, key) {
  return median(statPool(classLabel, stage, rarity).map((doll) => rawStat(doll, stage.raw, key)));
}

function triRandom(rand) {
  return rand() + rand() - 1; // -1 ~ 1, 0 근처가 가장 자주
}

function pickOne(list, rand) {
  return list.length ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))] : null;
}

// 숫자 → 저장용 글자 (정수로, 비성장형은 원본 값 그대로)
function statText(value) {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

// 생성: { values, missing } — rand를 넘기면 테스트에서 결과 고정 가능
function generateStats(classKey, rarity, mode, rand = Math.random) {
  const classItem = GAME_DATA.class[classKey];
  const R = GAME_DATA.statRule;
  const t = triRandom(rand);
  const t2 = triRandom(rand);
  const s = triRandom(rand);
  const tTank = triRandom(rand);
  const values = {};
  const classDolls = STAT_RAW.filter((doll) => doll.class === classItem.label);
  // 비성장형용 인형 1명: 같은 최초 성급 우선 (최초 1레벨 값이 그 성급 기준이라), 없으면 같은 직군 아무나
  const sameGrade = classDolls.filter((doll) => String(doll.grade) === String(rarity));
  const doll = pickOne(sameGrade.length ? sameGrade : classDolls, rand);

  GAME_DATA.statStages.forEach((stage) => {
    const out = Object.fromEntries(GAME_DATA.statRows.map((row) => [row.key, ""]));
    values[stage.key] = out;
    if (stage.key === "init" && !rarity) return; // 최초 성급을 모르면 1레벨은 빈칸
    const med = (key) => statMedian(classItem.label, stage, rarity, key);

    // 공격력 · 연산력
    const mA = med("atk");
    const mH = med("hashrate");
    let atk = null;
    let hash = null;
    if (mode === "twin") {
      if (mA != null && mH != null) {
        const base = (mA + mH) / 2;
        const center = base * (1 + R.W * t);
        // 차이를 먼저 정수로 정함 → 작은 숫자(1레벨)에서도 반올림 때문에 4%를 넘지 않음. 같으면 1 차이
        let gap = Math.round(base * R.twinGap * s);
        if (gap === 0) gap = s >= 0 ? 1 : -1;
        atk = Math.round(center + gap / 2);
        hash = atk - gap;
      }
    } else {
      const mainMed = mode === "atk" ? mA : mH;
      const offMed = mode === "atk" ? mH : mA;
      const main = mainMed == null ? null : Math.round(mainMed * (1 + R.W * t));
      let off = offMed == null ? null : Math.round(offMed * (1 + R.W * R.offRatio * t2));
      if (main != null && off != null) off = Math.min(off, Math.round(main * R.offCap));
      atk = mode === "atk" ? main : off;
      hash = mode === "atk" ? off : main;
    }
    out.atk = statText(atk);
    out.hashrate = statText(hash);

    // 관통: 짝 공격 수치의 배율을 따라감
    const mPP = med("physical-penetration");
    const mHP = med("operand-penetration");
    out["physical-penetration"] = statText(mPP != null && atk != null && mA ? Math.round(mPP * (atk / mA)) : null);
    out["operand-penetration"] = statText(mHP != null && hash != null && mH ? Math.round(mHP * (hash / mH)) : null);

    // 체력 · 방어
    ["max-hp", "physical-def", "operand-def"].forEach((key) => {
      const m = med(key);
      out[key] = statText(m == null ? null : Math.round(m * (1 + R.tankW * tTank)));
    });

    // 비성장형: 같은 인형의 이 단계 값, ? 이면 그 값만 같은 풀의 다른 인형에서
    GAME_DATA.statRows
      .filter((row) => row.group === "pick")
      .forEach((row) => {
        let value = doll ? rawStat(doll, stage.raw, row.key) : null;
        if (value == null) {
          const others = statPool(classItem.label, stage, rarity)
            .map((d) => rawStat(d, stage.raw, row.key))
            .filter((v) => v != null);
          value = pickOne(others, rand);
        }
        out[row.key] = statText(value);
      });

    // 고정값 (치명타 피해 50%)
    GAME_DATA.statRows
      .filter((row) => row.group === "fixed")
      .forEach((row) => {
        out[row.key] = row.value;
      });
  });
  return values;
}

function statCanGenerate() {
  return Boolean(GAME_DATA.class[state.profile.class]);
}

function statsHaveValues() {
  const values = state.performance.stats.values;
  return GAME_DATA.statStages.some((stage) => GAME_DATA.statRows.some((row) => String(values[stage.key][row.key]).trim()));
}

function statInitLabel() {
  return state.profile.rarity ? `${state.profile.rarity}성 1레벨` : "최초 1레벨";
}

// 능력치 입력 표 (12줄 × 3단계, 모두 직접 수정 가능)
function buildStatTable() {
  const box = document.getElementById("statTable");
  box.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const head = (text, id) => {
    const el = document.createElement("div");
    el.className = "stat-head";
    el.textContent = text;
    if (id) el.id = id;
    return el;
  };
  grid.append(head("능력치"), head(statInitLabel(), "statInitHead"), head("5성 60레벨"), head("5성 70레벨"));
  GAME_DATA.statRows.forEach((row) => {
    const name = document.createElement("div");
    name.className = "stat-name";
    name.textContent = statLabel(row.key) + (row.unit ? ` (${row.unit})` : "");
    if (row.group === "fixed") {
      const note = document.createElement("small");
      note.textContent = `기본 ${row.value}${row.unit || ""}`;
      name.appendChild(note);
    }
    grid.appendChild(name);
    GAME_DATA.statStages.forEach((stage) => {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.dataset.field = `performance.stats.values.${stage.key}.${row.key}`;
      input.setAttribute("aria-label", `${statLabel(row.key)} ${stage.label || statInitLabel()}`);
      grid.appendChild(input);
    });
  });
  box.appendChild(grid);
}

function fillStatEditor() {
  const stats = state.performance.stats;
  const classItem = GAME_DATA.class[state.profile.class];
  const basis = document.getElementById("statBasis");
  basis.textContent = classItem
    ? `직군 ${classItem.label} · 최초 성급 ${state.profile.rarity ? `★${state.profile.rarity}` : "(레어도 미선택 — 1레벨 칸은 빈칸으로 만들어져요)"} — 프로필 값을 그대로 써요. 공식 인형 93명 자료의 직군 중앙값을 기준으로 조금씩 다르게 만들어요.`
    : "프로필에서 클래스를 먼저 골라 주세요. 그 직군의 공식 인형 자료로 능력치를 만들어요.";
  const button = document.getElementById("statGenerate");
  button.disabled = !statCanGenerate();
  const has = statsHaveValues();
  button.textContent = has ? "다시 생성" : "능력치 자동 생성";
  document.getElementById("statClear").hidden = !has;
  const b = stats.basis;
  document.getElementById("statStale").hidden =
    !has || !b.class || (b.class === state.profile.class && b.rarity === state.profile.rarity && b.mode === stats.mode);
  const initHead = document.getElementById("statInitHead");
  if (initHead) initHead.textContent = statInitLabel();
}

function handleStatClick(event) {
  const stats = state.performance.stats;
  if (event.target.closest("#statGenerate")) {
    if (!statCanGenerate()) return;
    if (stats.edited && statsHaveValues() && !confirm("직접 고친 숫자가 있어요. 다시 생성하면 새 숫자로 바뀌어요. 계속할까요?")) return;
    // 고정값 칸을 직접 바꿔 뒀으면 그 값은 그대로 둠 (비어 있으면 기본값)
    const kept = Object.fromEntries(GAME_DATA.statStages.map((stage) => [stage.key, stats.values[stage.key]["crit-damage"]]));
    stats.values = generateStats(state.profile.class, state.profile.rarity, stats.mode);
    GAME_DATA.statStages.forEach((stage) => {
      if (String(kept[stage.key]).trim() && stats.values[stage.key]["crit-damage"]) stats.values[stage.key]["crit-damage"] = kept[stage.key];
    });
    stats.basis = { class: state.profile.class, rarity: state.profile.rarity, mode: stats.mode };
    stats.edited = false;
  } else if (event.target.closest("#statClear")) {
    if (!confirm("능력치 숫자를 모두 비울까요?")) return;
    GAME_DATA.statStages.forEach((stage) => {
      GAME_DATA.statRows.forEach((row) => {
        stats.values[stage.key][row.key] = "";
      });
    });
    stats.basis = { class: "", rarity: "", mode: "" };
    stats.edited = false;
  } else return;
  fillFields(document.getElementById("statTable"));
  fillStatEditor();
  fillEngravingEditor(); // 각인강화는 5성 70레벨 숫자를 기준으로 함 → 안내 갱신
  saveToLocalStorage();
  render();
}

/* ---------- 5-14. 성능: 무장각인 (각인돌파 · 각인강화) ---------- */
// 각인강화 공식 (자몽·체리 합의, 자료: data/engraving-db.js의 ENGRAVING_REF 25명)
//   버튼 한 번에 기준 인형 1명 → 그 인형의 P(각인 등급) + 특화 보너스(종류·주력과의 관계)를 통째로 사용
//   Lv.30 총량 = round(OC 5성 70레벨 능력치 × P) + 보너스
//   보너스 자리: 기준 인형의 주력과 같은 쪽/반대쪽 관계를 OC 주력에 그대로. 기준 인형이나 OC가 쌍두면 원래 능력치 그대로
//   Lv.1~30은 저장하지 않고 공통 성장곡선으로 출력 때 계산 (renderer.js engravingValue)

// 보너스가 붙을 OC 능력치 키
function engravingBonusTarget(bonus, refMain, mode) {
  if (refMain === "twin" || mode === "twin" || !bonus.side) return bonus.stat;
  const atkSide = (mode === "atk") === (bonus.side === "main");
  if (bonus.kind === "attack") return atkSide ? "atk" : "hashrate";
  if (bonus.kind === "pen") return atkSide ? "physical-penetration" : "operand-penetration";
  return bonus.stat;
}

// s70 = { 키: 숫자 | null } (3.1.1 5성 70레벨). 반환 { totals: { 키: "글자" }, ref } — rand를 넘기면 결과 고정
function generateEngraving(s70, mode, rand = Math.random) {
  const ref = pickOne(ENGRAVING_REF, rand);
  const totals = Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, s70[key] == null ? null : Math.round(s70[key] * ref.P)]));
  ref.bonus.forEach((bonus) => {
    const key = engravingBonusTarget(bonus, ref.main, mode);
    if (totals[key] != null) totals[key] += bonus.amount; // 바탕 숫자가 없으면 보너스도 없음 (빈칸 유지)
  });
  return { totals: Object.fromEntries(Object.entries(totals).map(([key, v]) => [key, statText(v)])), ref };
}

// 3.1.1 능력치의 5성 70레벨 숫자 (각인강화 7개 능력치만)
function engravingBaseValues() {
  const s70 = state.performance.stats.values.s70;
  return Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, parseStatValue(s70[key])]));
}

function engravingHasTotals() {
  const totals = state.performance.engraving.enhancement.totals;
  return GAME_DATA.engravingRows.some((key) => String(totals[key]).trim());
}

function engravingTargetLabel(key) {
  const slot = GAME_DATA.skillSlots.find((s) => s.key === key);
  if (slot) return slot.label;
  return key === GAME_DATA.breakthroughEtc.key ? GAME_DATA.breakthroughEtc.label : "";
}

function buildEngravingEditor() {
  const box = document.getElementById("engravingEditor");
  box.innerHTML = "";
  const base = "performance.engraving";
  box.append(
    listTextField(`${base}.name`, "각인명"),
    imageField(`${base}.image`, "대표 이미지 (없어도 돼요 · 움짤 gif도 가능)"),
    listTextField(`${base}.quote`, "설명 또는 인용문", { multiline: true, rows: 3 })
  );

  const btTitle = document.createElement("div");
  btTitle.className = "engrave-sub-title";
  btTitle.textContent = "각인돌파";
  box.appendChild(btTitle);
  GAME_DATA.breakthroughStages.forEach((stage, i) => {
    const path = `${base}.breakthroughs.${i}`;
    const block = document.createElement("details");
    block.className = "story-slot";
    if (i === 0) block.open = true;
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "story-slot-name";
    name.textContent = `각인돌파 ${stage}`;
    const status = document.createElement("span");
    status.className = "story-slot-status";
    status.dataset.btStatus = String(i);
    summary.append(name, status);

    const body = document.createElement("div");
    body.className = "story-slot-body";
    const targetWrap = document.createElement("label");
    targetWrap.className = "list-field";
    targetWrap.append(document.createTextNode("대상 스킬"));
    const select = document.createElement("select");
    select.dataset.field = `${path}.target`;
    [["", "선택 안 함"], ...GAME_DATA.skillSlots.map((slot) => [slot.key, slot.label]), [GAME_DATA.breakthroughEtc.key, GAME_DATA.breakthroughEtc.label]].forEach(
      ([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
    );
    targetWrap.appendChild(select);
    const hint = document.createElement("div");
    hint.className = "list-hint";
    hint.textContent = "대상을 고르면 강화 스킬명이 비어 있을 때만 그 스킬 이름을 넣어 줘요. + / ++ 는 직접 붙여 주세요.";
    body.append(
      targetWrap,
      hint,
      listTextField(`${path}.name`, "강화 스킬명"),
      listTextField(`${path}.desc`, "효과 설명 (스킬 칸과 같은 표기법)", { multiline: true, rows: 4 })
    );
    block.append(summary, body);
    box.appendChild(block);
  });

  const enhTitle = document.createElement("div");
  enhTitle.className = "engrave-sub-title";
  enhTitle.textContent = "각인강화";
  const basis = document.createElement("div");
  basis.className = "list-guide";
  basis.id = "engraveBasis";
  const generate = document.createElement("button");
  generate.type = "button";
  generate.className = "list-btn list-add stat-generate";
  generate.id = "engraveGenerate";
  const stale = document.createElement("div");
  stale.className = "list-hint is-warn";
  stale.id = "engraveStale";
  stale.hidden = true;
  stale.textContent = "능력치(5성 70레벨)나 공격 방식이 바뀌었어요. 「다시 생성」을 누르면 새 숫자로 만들어요 (지금 숫자는 그대로 있어요).";
  const grid = document.createElement("div");
  grid.className = "engrave-grid";
  GAME_DATA.engravingRows.forEach((key) => {
    const label = document.createElement("label");
    label.className = "list-field";
    label.append(document.createTextNode(statLabel(key)));
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.dataset.field = `${base}.enhancement.totals.${key}`;
    label.appendChild(input);
    grid.appendChild(label);
  });
  const gridNote = document.createElement("div");
  gridNote.className = "list-hint";
  gridNote.textContent = "Lv.30 총 증가량이에요. 숫자를 고치면 Lv.1~30 표가 공식 성장곡선대로 같이 바뀌어요.";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "list-btn danger";
  clear.id = "engraveClear";
  clear.hidden = true;
  clear.textContent = "각인강화 비우기";
  box.append(enhTitle, basis, generate, stale, grid, gridNote, clear);
}

function engravingCanGenerate() {
  return Object.values(engravingBaseValues()).some((v) => v != null);
}

function fillEngravingEditor() {
  const eng = state.performance.engraving;
  eng.breakthroughs.forEach((bt, i) => {
    const el = document.querySelector(`[data-bt-status="${i}"]`);
    if (!el) return;
    const name = bt.name.replace(/\^[^^\n]*\^/g, "").replace(/\[([^\]\n]+)\]\{[^}\n]+\}/g, "$1").replace(/[*_~\\]/g, "").trim();
    const text = [engravingTargetLabel(bt.target), name].filter(Boolean).join(" · ");
    el.textContent = text || "비어 있음";
    el.classList.toggle("is-written", Boolean(name || bt.desc.trim()));
  });
  const can = engravingCanGenerate();
  const has = engravingHasTotals();
  document.getElementById("engraveBasis").textContent = can
    ? "3.1.1 능력치의 5성 70레벨 숫자 × 공식 인형 한 명의 각인 등급(+ 특화 보너스)으로 Lv.30 총량을 만들어요. Lv.1~30은 공식 공통 성장곡선대로 채워져요."
    : "3.1.1 능력치를 먼저 만들어 주세요. 5성 70레벨 숫자를 기준으로 각인강화를 만들어요.";
  const button = document.getElementById("engraveGenerate");
  button.disabled = !can;
  button.textContent = has ? "다시 생성" : "각인강화 자동 생성";
  document.getElementById("engraveClear").hidden = !has;
  const b = eng.enhancement.basis;
  const s70 = state.performance.stats.values.s70;
  const changed = b.mode !== state.performance.stats.mode || GAME_DATA.engravingRows.some((key) => String(b.values[key]) !== String(s70[key]));
  document.getElementById("engraveStale").hidden = !has || !b.mode || !changed;
}

function handleEngravingClick(event) {
  const enh = state.performance.engraving.enhancement;
  const blankRows = () => Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, ""]));
  if (event.target.closest("#engraveGenerate")) {
    if (!engravingCanGenerate()) return;
    if (enh.edited && engravingHasTotals() && !confirm("직접 고친 숫자가 있어요. 다시 생성하면 새 숫자로 바뀌어요. 계속할까요?")) return;
    enh.totals = generateEngraving(engravingBaseValues(), state.performance.stats.mode).totals;
    const s70 = state.performance.stats.values.s70;
    enh.basis = { mode: state.performance.stats.mode, values: Object.fromEntries(GAME_DATA.engravingRows.map((key) => [key, s70[key]])) };
    enh.edited = false;
  } else if (event.target.closest("#engraveClear")) {
    if (!confirm("각인강화 숫자를 모두 비울까요?")) return;
    enh.totals = blankRows();
    enh.basis = { mode: "", values: blankRows() };
    enh.edited = false;
  } else return;
  fillFields(document.getElementById("engravingEditor"));
  fillEngravingEditor();
  saveToLocalStorage();
  render();
}

/* ---------- 6. 미리보기 그리기 ---------- */

// 문서 HTML은 renderer.js의 renderDocument(state)가 만든다.
// 미리보기 / 티스토리 출력 / 이미지 캡처가 모두 이 결과 하나를 쓴다.
const previewEl = document.getElementById("preview");

// 미리보기 전용 색 바꾸기 (화면 밝기 중간·어둡게일 때만)
// 문서 HTML(티스토리 출력·이미지 캡처)은 그대로 두고, 미리보기에 넣기 전에 style 안의 색만 바꿈
//   bg = background 색, fg = 글자색, line = 테두리 색. 표에 없는 색(기업색·배지 등)은 그대로
const PREVIEW_PALETTES = {
  dark: {
    bg: {
      "#ffffff": "#1e2026", "#f0f2f5": "#2a2d34", "#f7f8fa": "#24272e", "#eceff3": "#2c3038",
      "#eeeeee": "#2c2f36", "#f0f0f0": "#2a2d33", "#909090": "#4a4e57", "#cccccc": "#3a3e46", "#d8dde5": "#3a3e46",
      "#e5b8b8": "#5a3a3d", "#b8cce5": "#34465c", "#b8e5c2": "#34573e", // 추천 알고리즘 구역 바탕
    },
    fg: {
      "#222222": "#e2e4e8", "#373a3c": "#d6d9de", "#666666": "#a3a9b3", "#0275d8": "#5aa9f0",
      "#1971c2": "#4dabf7", "#2b8a3e": "#51cf66", "#b08900": "#e0b400", "#7048e8": "#9775fa", "#c2417a": "#f06595", "#d9363e": "#ff6b6b",
    },
    line: { "#cccccc": "#3a3e46", "#d8dde5": "#3a3e46", "#505050": "#5b606a", "#666666": "#a3a9b3", "#999999": "#7d838d" },
  },
  mid: {
    bg: {
      "#ffffff": "#e3e5e9", "#f0f2f5": "#d7dadf", "#f7f8fa": "#dcdfe3", "#eceff3": "#d4d7dc",
      "#eeeeee": "#d6d8dd", "#f0f0f0": "#d8dadf",
    },
    fg: {},
    line: { "#cccccc": "#b9bdc5", "#d8dde5": "#b9bdc5" },
  },
};

function themePreviewHtml(html) {
  const pal = PREVIEW_PALETTES[document.documentElement.dataset.theme];
  if (!pal) return html;
  return html.replace(/style="([^"]*)"/g, (all, style) => {
    const next = style.replace(/(^|;)(\s*)([a-z-]+)(\s*:)([^;]*)/g, (decl, sep, sp, prop, colon, value) => {
      const table = prop.startsWith("background") ? pal.bg : prop === "color" ? pal.fg : prop.startsWith("border") ? pal.line : null;
      if (!table) return decl;
      return sep + sp + prop + colon + value.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => table[hex.toLowerCase()] || hex);
    });
    return `style="${next}"`;
  });
}

function render() {
  previewEl.innerHTML = themePreviewHtml(renderDocument(state));
  if (typeof markEditing === "function" && editingTarget) markEditing(false); // 폰·패드: 쓰는 칸 표시 유지
  refreshVoiceSkinSelects(); // 스킨 이름·보이스 체크가 바뀌면 보이스 세트 선택지도 따라감
  refreshExprSourceSelects();
  ["voice.sets", "expression.groups"].forEach((path) => getList(path).forEach((item, i) => {
    const title = document.querySelector(`[data-list-title="${path}.${i}"]`);
    if (title) title.textContent = listCardTitle(LIST_DEFS[path], item, i);
  }));
}

// 티스토리용 HTML (미리보기와 완전히 같은 결과)
function getOutputHtml() {
  return renderDocument(state);
}

// 이미지 캡처용 파트 목록 (미리보기 DOM 기준)
// 미리보기에서 접어 둔 칸(스토리·목차)이 있어도 캡처에서 빠지지 않게 전부 펼친 뒤 돌려준다.
function getPreviewParts() {
  previewEl.innerHTML = renderDocument(state); // 캡처는 원래 색(흰 바탕)으로 — 끝나면 render()로 화면 색 복귀
  previewEl.querySelectorAll("details").forEach((el) => {
    el.open = true;
  });
  return [...previewEl.querySelectorAll("[data-part]")];
}

/* ---------- 7. 이벤트 연결 / 시작 ---------- */

function refreshAll() {
  applyBirthdayRules();
  drawAllLists();
  fillForm();
  saveToLocalStorage();
  render();
}

editorPanel.addEventListener("input", handleInput);
editorPanel.addEventListener("click", handleListClick);
editorPanel.addEventListener("toggle", handleListToggle, true);
editorPanel.addEventListener("change", handleImageChange);
editorPanel.addEventListener("click", handleImageClick);
editorPanel.addEventListener("click", handleVoiceDialogueClick);
editorPanel.addEventListener("click", handleArrClick);
editorPanel.addEventListener("click", handleExprClick);
editorPanel.addEventListener("click", handleSkillClick);
editorPanel.addEventListener("click", handleReviewClick);
editorPanel.addEventListener("click", handleStatClick);
editorPanel.addEventListener("click", handleEngravingClick);
editorPanel.addEventListener("click", handleFoldAllClick);

document.getElementById("resetButton").addEventListener("click", () => {
  if (!confirm("입력한 내용을 모두 지울까요?\n(저장하지 않은 내용은 되돌릴 수 없습니다)")) return;

  state = freshState();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
  refreshAll();
});


/* ---------- 입력창 페이지 (위치 줄 · 이동 목록 · 이전/다음 · 작성 방식) ---------- */
// 입력칸 묶음(.form-group)마다 index.html에 data-page 키가 있고, 여기서 파트·페이지로 묶어 한 페이지씩 보여 준다.
// 작성 방식 (이 브라우저에만 기억):
//   all   = 한 번에 쓰기: 파트 하나가 한 페이지
//   split = 하나씩 쓰기: 항목 하나가 한 페이지 (대사는 칸 하나씩)
// fixed: "one" = 언제나 한 페이지 / "split" = 언제나 나눔 (스토리는 칸 하나씩)
// 숨김은 .is-off-page 클래스로만 (다른 코드가 쓰는 hidden 속성과 섞이지 않게). 화면 전용이라 state에 넣지 않음.
const EDITOR_PARTS = [
  {
    key: "profile",
    title: "프로필",
    fixed: "split",
    pages: [
      { key: "profile-names", title: "이름" },
      { key: "profile-overview", title: "개요" },
      { key: "profile-info", title: "기본 정보" },
      { key: "profile-class", title: "클래스 · 포지션 · 레어도" },
      { key: "profile-history", title: "이력" },
    ],
  },
  {
    key: "performance",
    title: "성능",
    pages: [
      { key: "perf-stats", title: "능력치" },
      { key: "perf-skill", title: "스킬" },
      { key: "perf-engraving", title: "무장각인" },
      { key: "perf-review", title: "평가" },
    ],
  },
  { key: "algorithm", title: "추천 알고리즘", pages: [{ key: "algorithm", title: "추천 알고리즘", sub: "algo" }] },
  {
    key: "intimacy",
    title: "친밀도",
    pages: [
      { key: "int-skill", title: "친밀도 스킬" },
      { key: "int-gift", title: "선물 반응", sub: "gift" },
      { key: "int-oath", title: "서약" },
    ],
  },
  {
    key: "story",
    title: "스토리",
    fixed: "split",
    pages: [{ key: "story", title: "스토리", slots: "story" }],
  },
  {
    key: "history",
    title: "작중 행적",
    // 등장 스토리(메인/전속)를 고르면 작중 행적 항목이 그 아래로 묶임 → 같은 파트에
    pages: [
      { key: "story-type", title: "등장 스토리" },
      { key: "history", title: "작중 행적" },
    ],
  },
  {
    key: "skin",
    title: "스킨",
    pages: [
      { key: "skin-base", title: "기본 스킨" },
      { key: "skin-theme", title: "스킨 테마", lists: ["skin.items"] },
      { key: "ill-standing", title: "스탠딩 CG", lists: ["illustration.standing"] },
      { key: "ill-cg", title: "일러스트 CG", lists: ["illustration.cg.story", "illustration.cg.event"] },
      { key: "ill-expr", title: "감정 표현", lists: ["expression.groups"] },
    ],
  },
  { key: "relationship", title: "인형 관계", fixed: "one", pages: [{ key: "relationship", title: "인형 관계" }] },
  {
    key: "voice",
    title: "대사",
    pages: [
      { key: "voice", title: "기본 보이스", sub: "voice" },
      { key: "voice-sets", title: "스킨 보이스 세트" },
    ],
  },
  { key: "etc", title: "기타", pages: [{ key: "etc", title: "기타" }] },
];
const WRITE_MODE_KEY = "pnc_wiki_write_mode";
const PAGE_KEY = "pnc_wiki_page";
let writeMode = "split";
let editorPages = [];
let pageIndex = 0;

function storeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 기억 못 해도 지금 화면은 그대로 동작
  }
}

// 목록 항목 페이지 이름 (메인/전속 CG는 프로필의 등장 스토리를 따름, 안 고르면 그 목록은 페이지 없음)
function listPageLabel(path) {
  if (path === "illustration.cg.story") {
    const story = GAME_DATA.storyType[state.profile.storyType];
    return story ? `${story.short} CG` : "";
  }
  return { "skin.items": "스킨 테마", "illustration.standing": "스탠딩 CG", "illustration.cg.event": "일반 CG", "expression.groups": "감정 표현" }[path];
}

// 하나씩 쓰기에서 한 항목을 여러 페이지로 나누기 → [{ id, title, sub }]
//   algo  = 추천 알고리즘 구역 하나 / gift = 선물 티어 하나 / fold = 고정 칸 묶음 / list = 목록 항목 하나 (+ 빈 목록이면 추가용 페이지)
function splitPageParts(pg) {
  if (pg.slots) {
    return FOLD_EDITORS[pg.slots].slots().map((slot) => ({ id: `${pg.key}:${slot.key}`, title: slot.label, sub: { kind: "fold", prefix: pg.slots, keys: [slot.key] } }));
  }
  if (pg.sub === "voice") {
    return GAME_DATA.voiceGroups.map((group) => ({ id: `${pg.key}:${group.key}`, title: group.label, sub: { kind: "fold", prefix: "voice", keys: group.slots } }));
  }
  if (pg.sub === "algo") {
    return ALGORITHM_TYPES.map((type, index) => ({ id: `${pg.key}:${type}`, title: GAME_DATA.algorithmType[type].label, sub: { kind: "algo", index } }));
  }
  if (pg.sub === "gift") {
    return Object.entries(GAME_DATA.giftTier).map(([tier, item]) => ({ id: `${pg.key}:${tier}`, title: `선물 반응 · ${item.label}`, sub: { kind: "gift", tier } }));
  }
  if (pg.lists) {
    const out = [];
    pg.lists.forEach((path) => {
      const label = listPageLabel(path);
      if (!label) return;
      const count = getList(path).length;
      if (!count) out.push({ id: `${path}#empty`, title: label, sub: { kind: "list", path, index: -1, count } });
      for (let i = 0; i < count; i += 1) out.push({ id: `${path}#${i}`, title: `${label} ${i + 1}`, sub: { kind: "list", path, index: i, count } });
    });
    return out;
  }
  return [{ id: pg.key, title: pg.title, sub: null }];
}

// 지금 작성 방식으로 페이지 목록 만들기 → [{ id, part, partTitle, title, groups, sub }]
function buildEditorPages() {
  const pages = [];
  EDITOR_PARTS.forEach((part) => {
    const split = part.fixed === "split" || (part.fixed !== "one" && writeMode === "split");
    if (!split) {
      pages.push({ id: `part:${part.key}`, part: part.key, partTitle: part.title, title: part.title, groups: part.pages.map((pg) => pg.key), sub: null });
      return;
    }
    part.pages.forEach((pg) => {
      splitPageParts(pg).forEach((item) => {
        pages.push({ id: item.id, part: part.key, partTitle: part.title, title: item.title, groups: [pg.key], sub: item.sub });
      });
    });
  });
  return pages;
}

function partPages(page) {
  return editorPages.filter((p) => p.part === page.part);
}

// 이전/다음 버튼 글자: 같은 파트면 항목 이름, 다른 파트로 넘어가면 파트 이름(+ 항목)
function pageStepLabel(page, from) {
  if (page.part !== from.part && page.title !== page.partTitle) return `${page.partTitle} › ${page.title}`;
  return page.title;
}

function renderPageSteps() {
  const page = editorPages[pageIndex];
  const prev = editorPages[pageIndex - 1];
  const next = editorPages[pageIndex + 1];
  const html =
    (prev
      ? `<button type="button" class="page-step-btn" data-page-go="prev">◀ 이전: ${esc(pageStepLabel(prev, page))}</button>`
      : `<span class="page-step-btn is-empty"></span>`) +
    (next
      ? `<button type="button" class="page-step-btn is-next" data-page-go="next">다음: ${esc(pageStepLabel(next, page))} ▶</button>`
      : `<span class="page-step-btn is-empty"></span>`);
  document.querySelectorAll("[data-page-step]").forEach((box) => {
    box.innerHTML = html;
  });
}

function renderPageNavList() {
  const list = document.getElementById("pageNavList");
  const current = editorPages[pageIndex];
  list.innerHTML = EDITOR_PARTS.map((part) => {
    const pages = editorPages.filter((p) => p.part === part.key);
    const first = editorPages.indexOf(pages[0]);
    const partCurrent = current.part === part.key;
    if (pages.length === 1) {
      return `<button type="button" class="page-nav-item is-part${partCurrent ? " is-current" : ""}" data-page-jump="${first}">${esc(part.title)}</button>`;
    }
    return `<div class="page-nav-item is-part is-label${partCurrent ? " has-current" : ""}">${esc(part.title)}</div>${pages
      .map((p) => {
        const i = editorPages.indexOf(p);
        return `<button type="button" class="page-nav-item is-sub${i === pageIndex ? " is-current" : ""}" data-page-jump="${i}">${esc(p.title)}</button>`;
      })
      .join("")}`;
  }).join("");
}

// 페이지 보이기: 그 페이지의 입력칸 묶음만, 칸 단위 페이지(스토리·대사)면 그 칸만 펼쳐서
function showEditorPage(index, { scroll = false } = {}) {
  pageIndex = Math.max(0, Math.min(editorPages.length - 1, index));
  const page = editorPages[pageIndex];
  const sub = page.sub || {};
  // 목록 항목 페이지는 그 목록이 든 묶음만 (같은 항목 안의 다른 목록은 숨김)
  const listBox = sub.kind === "list" ? document.querySelector(`[data-list-editor="${sub.path}"]`) : null;
  const onlyGroup = listBox ? listBox.closest(".form-group") : null;
  editorPanel.querySelectorAll(".form-group[data-page]").forEach((group) => {
    group.classList.toggle("is-off-page", !page.groups.includes(group.dataset.page) || Boolean(onlyGroup && group !== onlyGroup));
  });
  editorPanel.querySelectorAll(".form-section-title").forEach((title) => title.classList.add("is-off-page"));
  // 고정 칸 (스토리·대사): 이 페이지 칸만, 펼쳐서
  Object.keys(FOLD_EDITORS).forEach((prefix) => {
    const box = document.getElementById(FOLD_EDITORS[prefix].boxId);
    const on = sub.kind === "fold" && sub.prefix === prefix;
    box.querySelectorAll(":scope > .story-slot").forEach((block) => {
      const mine = on && sub.keys.includes(block.dataset.slotKey);
      block.classList.toggle("is-off-page", on && !mine);
      if (mine) block.open = true;
    });
    const tools = box.closest(".form-group").querySelector(".story-tools");
    if (tools) tools.classList.toggle("is-off-page", on); // 모두 펼치기/접기는 일부 칸만 보일 때 필요 없음
  });
  // 추천 알고리즘 구역
  document.querySelectorAll("#algorithmPicker > .algo-zone").forEach((zone, i) => {
    zone.classList.toggle("is-off-page", sub.kind === "algo" && i !== sub.index);
  });
  // 선물 티어
  document.querySelectorAll("#giftPicker [data-gift-tier]").forEach((el) => {
    el.classList.toggle("is-off-page", sub.kind === "gift" && el.dataset.giftTier !== sub.tier);
  });
  // 목록 항목 하나
  document.querySelectorAll("[data-list-editor] > [data-list-item]").forEach((card) => {
    card.classList.toggle("is-off-page", Boolean(listBox && card.parentElement === listBox && card.dataset.listItem !== `${sub.path}.${sub.index}`));
  });

  const pages = partPages(page);
  const single = page.title === page.partTitle;
  const partEl = document.getElementById("pageLocPart");
  partEl.textContent = page.partTitle;
  partEl.classList.toggle("is-alone", single);
  document.getElementById("pageLocSep").hidden = single;
  document.getElementById("pageLocTitle").textContent = single ? "" : page.title;
  document.getElementById("pageLocCount").textContent = pages.length > 1 ? `${pages.indexOf(page) + 1} / ${pages.length}` : "";
  renderPageSteps();
  renderPageNavList();
  renderMobileTabs();
  storeSet(PAGE_KEY, page.id);
  if (scroll) {
    editorPanel.scrollTop = 0; // 새 페이지는 맨 위부터
    // 입력창 머리가 화면 위로 올라가 있으면 다시 보이게 (상단 줄 아래)
    const top = editorPanel.getBoundingClientRect().top;
    if (top < 56) window.scrollTo({ top: window.scrollY + top - 76 });
  }
}

// 작성 방식 바꾸기: 지금 보던 칸이 들어 있는 페이지로 이어서
function setWriteMode(mode, { keepPlace = true } = {}) {
  const before = keepPlace ? editorPages[pageIndex] : null;
  writeMode = mode === "all" ? "all" : "split";
  document.querySelectorAll("[data-write-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.writeMode === writeMode));
  });
  editorPages = buildEditorPages();
  let index = 0;
  if (before) {
    const sameSlot = before.sub && before.sub.kind === "fold"
      ? editorPages.findIndex((p) => p.sub && p.sub.kind === "fold" && p.sub.prefix === before.sub.prefix && p.sub.keys.includes(before.sub.keys[0]))
      : -1;
    index = sameSlot > -1 ? sameSlot : Math.max(0, editorPages.findIndex((p) => p.groups.includes(before.groups[0])));
  }
  showEditorPage(index);
  editorPanel.scrollTop = 0;
  // 한 번에 쓰기로 바꾸면 보던 항목 위치로 스크롤
  if (before && writeMode === "all") {
    const group = editorPanel.querySelector(`.form-group[data-page="${before.groups[0]}"]:not(.is-off-page)`);
    if (group && editorPages[index].groups.length > 1) {
      const nav = document.getElementById("pageNav").offsetHeight;
      editorPanel.scrollTop += group.getBoundingClientRect().top - editorPanel.getBoundingClientRect().top - nav;
    }
  }
}

// 페이지 목록 다시 만들기 (목록 항목 추가·삭제, 등장 스토리 변경 때). 보던 페이지 유지,
// 목록에 항목이 늘었으면 새 항목 페이지로 이동
function rebuildEditorPages(changedPath) {
  if (!editorPages.length) return; // 시작 전
  const cur = editorPages[pageIndex];
  editorPages = buildEditorPages();
  const listPage = (path, index) => editorPages.findIndex((p) => p.sub && p.sub.kind === "list" && p.sub.path === path && p.sub.index === index);
  let index = editorPages.findIndex((p) => p.id === cur.id);
  if (cur.sub && cur.sub.kind === "list" && (!changedPath || cur.sub.path === changedPath)) {
    const count = getList(cur.sub.path).length;
    if (count > cur.sub.count) index = listPage(cur.sub.path, count - 1); // 추가 → 새 항목으로
    else if (count < cur.sub.count || index < 0) index = Math.max(listPage(cur.sub.path, Math.min(cur.sub.index, count - 1)), listPage(cur.sub.path, -1));
  }
  if (index < 0) index = Math.max(0, editorPages.findIndex((p) => p.groups.includes(cur.groups[0])));
  showEditorPage(index);
}

const PAGED_LISTS = ["skin.items", "illustration.standing", "illustration.cg.story", "illustration.cg.event", "expression.groups"];

function handlePageClick(event) {
  const go = event.target.closest("[data-page-go]");
  const jump = event.target.closest("[data-page-jump]");
  if (go) showEditorPage(pageIndex + (go.dataset.pageGo === "next" ? 1 : -1), { scroll: true });
  else if (jump) {
    document.getElementById("pageNav").open = false;
    showEditorPage(Number(jump.dataset.pageJump), { scroll: true });
  }
}

function initEditorPages() {
  const saved = storeGet(PAGE_KEY); // 먼저 읽기 (페이지를 보이면 그 자리로 덮어써짐)
  writeMode = storeGet(WRITE_MODE_KEY) === "all" ? "all" : "split";
  setWriteMode(writeMode, { keepPlace: false });
  const index = editorPages.findIndex((p) => p.id === saved);
  if (index > 0) showEditorPage(index);
}

editorPanel.addEventListener("click", handlePageClick);
document.querySelector(".mode-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-write-mode]");
  if (!button || button.dataset.writeMode === writeMode) return;
  storeSet(WRITE_MODE_KEY, button.dataset.writeMode);
  setWriteMode(button.dataset.writeMode);
});

/* ---------- 작성함 체크 (무장각인 · 작중 행적) / 개요 이미지·동영상 / 관계 빠른 추가 ---------- */

// 체크를 끄면 그 묶음의 입력칸은 숨기고 체크박스만 남김 (써 둔 내용은 그대로)
function fillSectionChecks() {
  document.querySelectorAll(".section-check input[data-field]").forEach((box) => {
    box.closest(".form-group").classList.toggle("is-unchecked", !box.checked);
  });
}

function fillOverviewVideoHint() {
  const el = document.getElementById("overviewVideoHint");
  const raw = state.overview.video.trim();
  const ok = Boolean(youtubeId(raw));
  el.textContent = !raw
    ? ""
    : !ok
      ? "유튜브 영상 주소(youtube.com/watch?v=… 또는 youtu.be/…)만 쓸 수 있어요. 지금 주소는 문서에 나오지 않아요."
      : state.overview.image
        ? "대표 이미지가 있어서 이미지가 먼저 나와요 (동영상 썸네일은 이미지를 지우면 나와요)."
        : "영상 썸네일이 나오고, 누르면 유튜브로 이동해요.";
  el.classList.toggle("is-warn", Boolean(raw) && !ok);
  el.classList.toggle("is-ok", ok);
}

function handlePresetClick(event) {
  const button = event.target.closest("[data-relation-preset]");
  if (!button) return;
  state.relationship.items.push({ relation: button.dataset.relationPreset, person: "" });
  drawList("relationship.items");
  saveToLocalStorage();
  render();
  // 새 카드의 인물명 칸으로 바로
  const field = document.querySelector(`[data-field="relationship.items.${state.relationship.items.length - 1}.person"]`);
  if (field) field.focus();
}

editorPanel.addEventListener("click", handlePresetClick);
document.getElementById("overviewImageField").appendChild(imageField("overview.image", "대표 이미지 (움짤 gif도 가능)"));

/* ---------- 폰 · 패드 화면 (픽크루 방식) ---------- */
// 위 미리보기 / 가운데 파트·항목 탭 / 아래 입력. 화면 배치는 style.css의 같은 조건(@media)이 맡고,
// 여기서는 탭 그리기 · 비율 끌기 · 키보드 · 쓰는 칸 따라가기 · ☰ 메뉴만.
const MOBILE_QUERY = window.matchMedia("(max-width: 1199px), (hover: none) and (pointer: coarse)");
const SPLIT_KEY = "pnc_wiki_split";
const previewPanel = document.getElementById("previewPanel");
let editingTarget = null; // 지금 쓰는 칸 → 미리보기에서 찾는 함수

function isMobileLayout() {
  return MOBILE_QUERY.matches;
}

function renderMobileTabs() {
  const page = editorPages[pageIndex];
  if (!page) return;
  const parts = document.getElementById("tabParts");
  const subs = document.getElementById("tabSubs");
  parts.innerHTML = EDITOR_PARTS.map((part) => {
    const first = editorPages.findIndex((p) => p.part === part.key);
    return first < 0 ? "" : `<button type="button" data-page-jump="${first}" class="${part.key === page.part ? "is-current" : ""}">${esc(part.title)}</button>`;
  }).join("");
  const own = editorPages.filter((p) => p.part === page.part);
  subs.innerHTML = own.length > 1
    ? own.map((p) => {
        const i = editorPages.indexOf(p);
        return `<button type="button" data-page-jump="${i}" class="${i === pageIndex ? "is-current" : ""}">${esc(p.title)}</button>`;
      }).join("")
    : "";
  // 고른 탭이 보이게 옆으로 밀어 줌
  [parts, subs].forEach((row) => {
    const cur = row.querySelector(".is-current");
    if (cur) row.scrollLeft = cur.offsetLeft - row.clientWidth / 2 + cur.offsetWidth / 2;
  });
}

document.getElementById("mobileTabs").addEventListener("click", (event) => {
  const jump = event.target.closest("[data-page-jump]");
  if (!jump) return;
  showEditorPage(Number(jump.dataset.pageJump), { scroll: true });
  followPage();
});

// 앱 높이 = 실제로 보이는 높이 (키보드가 올라오면 줄어듦)
function fitAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  if (window.visualViewport) window.scrollTo(0, 0);
}
(window.visualViewport || window).addEventListener("resize", fitAppHeight);
fitAppHeight();

// 위아래 비율 끌기 (탭 줄 위 손잡이)
(function setupSplit() {
  const workspace = document.querySelector(".workspace");
  const saved = Number(storeGet(SPLIT_KEY));
  if (saved >= 15 && saved <= 80) workspace.style.setProperty("--split", `${saved}%`);
  const handle = document.getElementById("splitHandle");
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const move = (e) => {
      const box = workspace.getBoundingClientRect();
      const pct = Math.max(15, Math.min(80, ((e.clientY - box.top) / box.height) * 100));
      workspace.style.setProperty("--split", `${pct.toFixed(1)}%`);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      const value = parseFloat(workspace.style.getPropertyValue("--split"));
      if (value) storeSet(SPLIT_KEY, String(Math.round(value)));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
})();

// ☰ 메뉴
const appHeader = document.querySelector(".app-header");
document.getElementById("menuToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const open = !appHeader.classList.contains("is-menu-open");
  appHeader.classList.toggle("is-menu-open", open);
  document.getElementById("menuToggle").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!appHeader.classList.contains("is-menu-open")) return;
  if (event.target.closest("#headerTools, #menuToggle, .export-backdrop")) return;
  appHeader.classList.remove("is-menu-open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
});

// ---- 쓰는 칸 → 문서 위치 ----
// 하위 문단 제목으로 앵커 찾기 (예: 성능 › 평가)
function anchorByTitle(sectionKey, title) {
  const section = getActiveSections(state).find((s) => s.key === sectionKey);
  if (!section) return null;
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.title === title) return n.anchor;
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  };
  return walk(section.subs);
}

const byId = (id) => (id ? document.getElementById(id) : null);
const sectionEl = (key) => byId(`pncwiki-s-${key}`);

// 입력칸 경로 → 미리보기 안의 요소 (없으면 그 문단)
function previewTargetFor(path) {
  if (!path) return null;
  const head = path.split(".");
  if (path === "profile.name" || path.startsWith("profile.names")) return previewEl.querySelector('[data-part="top"]');
  if (path.startsWith("overview.")) return sectionEl("overview");
  if (path === "profile.history") return sectionEl("profile");
  if (path === "profile.storyType") return sectionEl("history") || sectionEl("story");
  if (head[0] === "profile") return previewEl.querySelector('[data-part="info"]');
  if (path.startsWith("performance.stats")) return previewEl.querySelector(".pncwiki-stats") || sectionEl("performance");
  if (path.startsWith("performance.skills.")) {
    const cards = getSkillCards(state);
    const i = cards.findIndex((c) => c.slot.key === head[2]);
    return previewEl.querySelectorAll(".pncwiki-skill")[i] || sectionEl("performance");
  }
  if (path.startsWith("performance.engraving") || path === "sections.weapon") return byId(anchorByTitle("performance", "무장각인")) || sectionEl("performance");
  if (path.startsWith("performance.review")) return byId(anchorByTitle("performance", "평가")) || sectionEl("performance");
  if (head[0] === "algorithm") {
    const zones = sectionEl("algorithm") ? sectionEl("algorithm").querySelectorAll(":scope > div") : [];
    return zones[ALGORITHM_TYPES.indexOf(head[1])] || sectionEl("algorithm");
  }
  if (path.startsWith("intimacy.oath")) return previewEl.querySelector(".pncwiki-oath") || sectionEl("intimacy");
  if (head[0] === "intimacy") return sectionEl("intimacy");
  if (head[0] === "story") {
    const i = GAME_DATA.storySlots.findIndex((slot) => slot.key === head[1]);
    return previewEl.querySelectorAll(".pncwiki-story-slot")[i] || sectionEl("story");
  }
  if (head[0] === "history" || path === "sections.history") return sectionEl("history");
  if (head[0] === "skin") return sectionEl("skin");
  if (head[0] === "illustration" || head[0] === "expression") return byId(anchorByTitle("skin", "일러스트")) || sectionEl("skin");
  if (head[0] === "relationship") return sectionEl("relationship");
  if (head[0] === "voice") {
    if (head[1] === "sets") return byId(anchorByTitle("voice", (getVoiceSets(state)[Number(head[2])] || {}).headingText)) || sectionEl("voice");
    const slot = GAME_DATA.voiceSlots.find((s) => s.key === head[1]);
    if (slot) {
      const code = [...previewEl.querySelectorAll(".pncwiki-voice")][0];
      const row = code && [...code.children].find((r) => r.textContent.includes(slot.code));
      if (row) return row;
    }
    return sectionEl("voice");
  }
  if (head[0] === "etc") return sectionEl("etc");
  return null;
}

// 페이지 첫 칸 기준 (탭으로 넘어갔을 때)
function followPage() {
  if (!isMobileLayout()) return;
  const first = editorPanel.querySelector(".form-group:not(.is-off-page) [data-field], .form-group:not(.is-off-page) [data-image-url], .form-group:not(.is-off-page) [data-list-editor]");
  const path = first ? first.dataset.field || first.dataset.imageUrl || first.dataset.listEditor : "";
  editingTarget = path;
  markEditing(true);
}

// 표시 + (필요하면) 그 위치로 미리보기 스크롤
function markEditing(scroll) {
  previewEl.querySelectorAll(".pncwiki-editing").forEach((el) => el.classList.remove("pncwiki-editing"));
  if (!isMobileLayout() || !editingTarget) return;
  const target = previewTargetFor(editingTarget);
  if (!target) return;
  target.classList.add("pncwiki-editing");
  const top = target.getBoundingClientRect().top - previewPanel.getBoundingClientRect().top;
  const inView = top >= 0 && top < previewPanel.clientHeight - 40;
  if (scroll || !inView) previewPanel.scrollTo({ top: previewPanel.scrollTop + top - 12, behavior: scroll ? "smooth" : "auto" });
}

const TYPING_SELECTOR = 'input[type="text"], input:not([type]), textarea';

editorPanel.addEventListener("focusin", (event) => {
  const el = event.target;
  if (!isMobileLayout()) return;
  const path = el.dataset.field || el.dataset.imageUrl || "";
  if (path) {
    editingTarget = path;
    markEditing(true);
  }
  if (el.matches(TYPING_SELECTOR)) document.body.classList.add("is-typing");
});

editorPanel.addEventListener("focusout", () => {
  setTimeout(() => {
    const active = document.activeElement;
    if (!active || !active.matches || !active.matches(TYPING_SELECTOR) || !editorPanel.contains(active)) document.body.classList.remove("is-typing");
  }, 50);
});

/* ---------- 화면 밝기 (밝게 / 중간 / 어둡게) ---------- */
// 화면 전용 설정이라 문서 state·JSON에는 넣지 않고 이 브라우저에만 기억
const THEME_KEY = "pnc_wiki_theme";

function applyTheme(theme) {
  const name = ["light", "mid", "dark"].includes(theme) ? theme : "light";
  if (name === "light") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = name;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === name));
  });
  return name;
}

document.querySelector(".theme-switch").addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-choice]");
  if (!button) return;
  const name = applyTheme(button.dataset.themeChoice);
  render(); // 미리보기 문서 색도 바로 바꿈
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch {
    // 저장 못 해도 지금 화면에는 적용됨
  }
});
applyTheme(document.documentElement.dataset.theme || "light");

document.getElementById("loadJsonInput").addEventListener("change", (event) => {
  loadJsonFile(event.target.files[0]);
  event.target.value = "";
});

buildOptionGroups();
buildPositionPicker();
buildAlgorithmPicker();
buildIntimacySlots();
buildGiftPicker();
Object.keys(FOLD_EDITORS).forEach(buildFoldEditor);
buildSkinBaseEditor();
buildSkillEditor();
buildStatTable();
buildEngravingEditor();
buildMarkupGuide();
state = freshState(); // 문단 목록 등록(defineList)이 끝난 뒤 빈 문서 만들기
loadFromLocalStorage();
refreshAll();
initEditorPages();
