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

function emptyAlgorithmZone() {
  return { main: ["", ""], sub: ["", ""], slots: emptyAlgorithmSlots() };
}

function emptyAlgorithmSlots() {
  return [emptyAlgorithmSlot(), emptyAlgorithmSlot(), emptyAlgorithmSlot()];
}
const CURRENT_VERSION = 4;
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
  },
  overview: {
    quote: "",
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
    // 서약 칭호·설명. 칭호 가운데 "{이름}의"는 profile.name에서 자동 (저장 안 함)
    oath: {
      titlePrefix: "", // 칭호 수식어
      titleSuffix: "", // 칭호 단어
      description: "", // 서약 설명 (한 줄)
    },
  },
  // 스토리: 고정 10칸의 본문만 (칸 이름·순서·개방 Lv은 GAME_DATA.storySlots)
  story: Object.fromEntries(GAME_DATA.storySlots.map((slot) => [slot.key, ""])),
  // 작중 행적: 하위 문단 목록. 번호(7.1 …)는 renderer가 계산, 저장하지 않음
  history: {
    items: [], // { title, linkUrl, linkText, summary }
  },
  // 스킨: 자유 목록. 번호(8.1 …)는 renderer가 계산, 적용범위는 GAME_DATA.skinEffect 키 배열
  skin: {
    items: [], // { type, name, image, illustrator, acquisition, effects: [], description }
  },
  // 인형 관계: 자유 목록 (관계명·인물명 모두 직접 입력. 예시는 입력 화면 안내일 뿐)
  relationship: {
    items: [], // { relation, person }
  },
  // 대사(기본 보이스): 고정 21칸의 대사만 (칸 이름·코드·순서는 GAME_DATA.voiceSlots)
  voice: Object.fromEntries(GAME_DATA.voiceSlots.map((slot) => [slot.key, ""])),
  // 켜고 끌 수 있는 문단만. (고정 문단은 SECTION_DEFS의 fixed — 작중 행적은 필수 문단)
  sections: {
    weapon: true,
    story: true,
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
  // 다음에 구조가 바뀌면 여기에 4: (old) => ({ ... }) 추가
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

  // 목록형 입력: 등록된 목록마다 항목 모양 정리
  Object.keys(LIST_DEFS).forEach((path) => {
    setPath(st, path, normalizeListValue(getPath(st, path), LIST_DEFS[path]));
  });
  return st;
}

/* ---------- 4. 저장 ---------- */

function toSaveData() {
  return { app: APP_ID, version: CURRENT_VERSION, ...state };
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSaveData()));
  } catch {
    // 저장 공간 문제 등 — 작업은 계속 가능
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

function makeFileName() {
  const name = state.profile.name.trim().replace(/[\\/:*?"<>|]/g, "") || "pnc_wiki";
  const now = new Date();
  const ymd =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  return `${name}_${ymd}.json`;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(toSaveData(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = makeFileName();
  a.click();

  URL.revokeObjectURL(url);
}

function loadJsonFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    let nextState;

    try {
      nextState = normalizeData(JSON.parse(event.target.result));
    } catch (error) {
      // 실패하면 현재 작업은 그대로 둔다
      alert(`불러오기 실패: ${error instanceof SyntaxError ? "올바른 JSON 파일이 아닙니다." : error.message}`);
      return;
    }

    state = nextState;
    refreshAll();
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
    title.textContent = tierItem.label;
    title.style.color = tierItem.color;
    box.appendChild(title);

    Object.entries(GAME_DATA.gift)
      .filter(([, gift]) => String(gift.tier) === tier)
      .forEach(([key, gift]) => {
        const row = document.createElement("div");
        row.className = "gift-row";

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

  // 키 배열 체크박스 (복수 선택): 켜면 추가, 끄면 빼기. 순서는 각 목록 clean이 정리
  if (el.dataset && el.dataset.toggleField) {
    const togglePath = el.dataset.toggleField;
    const current = getPath(state, togglePath);
    const list = (Array.isArray(current) ? current : []).filter((key) => key !== el.value);
    if (el.checked) list.push(el.value);
    const listPath = Object.keys(LIST_DEFS).find((p) => togglePath.startsWith(`${p}.`));
    setPath(state, togglePath, list);
    if (listPath && LIST_DEFS[listPath].clean) {
      const index = Number(togglePath.slice(listPath.length + 1).split(".")[0]);
      const items = getList(listPath);
      items[index] = LIST_DEFS[listPath].clean(items[index]);
    }
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
  if (path.startsWith("intimacy.oath.") || path === "profile.name") fillOathPreview();
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
  setPath(state, path, [...list, newListItem(def)]);
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
  if (def.sync) list.forEach((item, index) => def.sync(`${path}.${index}`, item));
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

/* ---------- 5-2. 고정 칸 접기 입력 (스토리 10칸 · 대사 21칸) ---------- */
// 칸마다 접고 펴는 편집 블록(details) + 작성 상태 표시. 펼침 상태는 화면 전용이라 저장하지 않음.
// prefix = state 경로 (story / voice). 칸 정의는 GAME_DATA, 저장은 state[prefix][slot.key] 글자만.
const FOLD_EDITORS = {
  story: {
    boxId: "storyEditor",
    slots: () => GAME_DATA.storySlots,
    note: (slot) => getStoryUnlockText(slot),
    rows: 8,
  },
  voice: {
    boxId: "voiceEditor",
    slots: () => GAME_DATA.voiceSlots,
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
      listTextField(`${base}.linkUrl`, "링크 주소", { placeholder: "https://" }),
      listTextField(`${base}.linkText`, "링크 대체 텍스트", { placeholder: "예) Remnant서사" })
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

/* ---------- 5-4. 스킨 (가변 목록) ---------- */

function skinImageHint(item) {
  const url = item.image.trim();
  if (!url) return ["", "이미지 주소를 넣으면 문서에 큰 이미지로 나와요 (비워 두면 이미지 없이)."];
  if (!safeLinkUrl(url)) return ["warn", "http:// 또는 https:// 로 시작하는 이미지 주소만 쓸 수 있어요. 문서에 이미지가 나오지 않아요."];
  return ["ok", "문서에 이미지로 나와요."];
}

defineList("skin.items", {
  label: "스킨",
  addLabel: "+ 스킨 추가",
  fold: true,
  item: { type: "", name: "", image: "", illustrator: "", acquisition: "", effects: [], description: "" },
  // 적용범위: 아는 키만, 중복 없이, GAME_DATA 순서로
  clean: (item) => ({
    ...item,
    effects: Object.keys(GAME_DATA.skinEffect).filter((key) => item.effects.includes(key)),
  }),
  title: (item) => [item.type.trim(), item.name.trim()].filter(Boolean).join(" - "),
  fields: (base) => {
    const typeField = listTextField(`${base}.type`, "투영 종류", { placeholder: "예) 기본 투영" });
    typeField.querySelector("input").setAttribute("list", "skinTypeOptions");
    const row = document.createElement("div");
    row.className = "list-field-row";
    row.append(typeField, listTextField(`${base}.name`, "투영 이름"));

    const titleHint = document.createElement("div");
    titleHint.className = "list-hint is-warn";
    titleHint.dataset.skinTitleHint = base;
    titleHint.textContent = "투영 종류나 투영 이름 중 하나는 있어야 문서에 나와요 (적은 내용은 그대로 남아 있어요).";

    const imageHint = document.createElement("div");
    imageHint.className = "list-hint";
    imageHint.dataset.skinImageHint = base;


    const effects = document.createElement("div");
    effects.className = "list-field";
    effects.append(document.createTextNode("적용범위 (여러 개 선택 가능)"));
    const grid = document.createElement("div");
    grid.className = "skin-effect-grid";
    Object.entries(GAME_DATA.skinEffect).forEach(([key, effect]) => {
      const label = document.createElement("label");
      label.className = "skin-effect-choice";
      label.title = effect.desc;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      input.dataset.toggleField = `${base}.effects`;
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
    effects.appendChild(grid);

    return [
      row,
      titleHint,
      listTextField(`${base}.image`, "이미지 주소", { placeholder: "https://" }),
      imageHint,
      listTextField(`${base}.illustrator`, "일러스트레이터"),
      listTextField(`${base}.acquisition`, "입수방법", { multiline: true, rows: 2 }),
      effects,
      listTextField(`${base}.description`, "기본 설명", { multiline: true, rows: 3 }),
    ];
  },
  sync: (base, item) => {
    const titleHint = document.querySelector(`[data-skin-title-hint="${base}"]`);
    if (titleHint) titleHint.hidden = Boolean(item.type.trim() || item.name.trim());
    const hint = document.querySelector(`[data-skin-image-hint="${base}"]`);
    if (!hint) return;
    const [kind, text] = skinImageHint(item);
    hint.textContent = text;
    hint.className = `list-hint${kind ? ` is-${kind}` : ""}`;
  },
});

/* ---------- 5-5. 친밀도 서약 미리보기 안내 ---------- */
// 입력 칸 아래에 칭호가 어떻게 조립되는지 글로 보여줌 (이름은 프로필에서 자동)
function fillOathPreview() {
  const el = document.getElementById("oathPreview");
  if (!el) return;
  const text = getOathTitleText(state);
  el.textContent = text ? `칭호 미리보기: ${text}` : "칭호 수식어·단어를 넣으면 「수식어 · 이름의  단어」로 조립돼요. 이름은 프로필 이름을 자동으로 써요.";
}

/* ---------- 5-6. 인형 관계 (가변 목록) ---------- */

defineList("relationship.items", {
  label: "관계",
  addLabel: "+ 관계 추가",
  item: { relation: "", person: "" },
  title: (item) => [item.relation.trim(), item.person.trim()].filter(Boolean).join(" - "),
  fields: (base) => {
    const row = document.createElement("div");
    row.className = "list-field-row";
    row.append(
      listTextField(`${base}.relation`, "관계명", { placeholder: "예) 절친" }),
      listTextField(`${base}.person`, "인물명", { placeholder: "예) 페르시카" })
    );
    return [row];
  },
});

/* ---------- 6. 미리보기 그리기 ---------- */

// 문서 HTML은 renderer.js의 renderDocument(state)가 만든다.
// 미리보기 / 티스토리 출력 / 이미지 캡처가 모두 이 결과 하나를 쓴다.
const previewEl = document.getElementById("preview");

function render() {
  previewEl.innerHTML = renderDocument(state);
}

// 티스토리용 HTML (미리보기와 완전히 같은 결과)
function getOutputHtml() {
  return renderDocument(state);
}

// 이미지 캡처용 파트 목록 (미리보기 DOM 기준)
// 미리보기에서 접어 둔 칸(스토리·목차)이 있어도 캡처에서 빠지지 않게 전부 펼친 뒤 돌려준다.
function getPreviewParts() {
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

document.getElementById("saveJsonButton").addEventListener("click", downloadJson);

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
state = freshState(); // 문단 목록 등록(defineList)이 끝난 뒤 빈 문서 만들기
loadFromLocalStorage();
refreshAll();
