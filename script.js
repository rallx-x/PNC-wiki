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
  },
  // 켜고 끌 수 있는 문단만. (고정 문단은 SECTION_DEFS의 fixed)
  sections: {
    weapon: true,
    story: true,
    appearance: true,
  },
};

// 문단 순서·제목(SECTION_DEFS)과 문서 그리기는 renderer.js에 있음.

const MAX_POSITIONS = 2; // 포지션 최대 선택 수
const INTIMACY_SLOTS = 3; // 선택 친밀도 스킬 칸 수 (서약 스킬 제외)

let state = cloneDefaults();

/* ---------- 2. state 도구 ---------- */

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
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
    state = cloneDefaults();
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
function fillForm() {
  buildBirthdayDayOptions();

  document.querySelectorAll("[data-field]").forEach((el) => {
    const value = getPath(state, el.dataset.field);

    if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else if (el.type === "radio") {
      el.checked = el.value === value;
    } else {
      el.value = value == null ? "" : value;
    }
  });

  const unknown = state.profile.birthday.unknown;
  birthdayMonthSelect.disabled = unknown;
  birthdayDaySelect.disabled = unknown;

  fillGiftPicker();
  fillPositionPicker();
  fillAlgorithmPicker();
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

  if (path.startsWith("profile.birthday")) {
    applyBirthdayRules();
    fillForm(); // 일 선택지·비활성 상태 갱신
  }

  saveToLocalStorage();
  render();
}

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
function getPreviewParts() {
  return [...previewEl.querySelectorAll("[data-part]")];
}

/* ---------- 7. 이벤트 연결 / 시작 ---------- */

function refreshAll() {
  applyBirthdayRules();
  fillForm();
  saveToLocalStorage();
  render();
}

editorPanel.addEventListener("input", handleInput);

document.getElementById("resetButton").addEventListener("click", () => {
  if (!confirm("입력한 내용을 모두 지울까요?\n(저장하지 않은 내용은 되돌릴 수 없습니다)")) return;

  state = cloneDefaults();
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
loadFromLocalStorage();
refreshAll();
