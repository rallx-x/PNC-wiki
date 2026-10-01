/* =========================================================
   PNC WIKI Generator — script.js
   구조:
   1. 기본 설정 / 기본값(DEFAULT_STATE)
   2. state 도구 (경로 읽기·쓰기, 기본값 병합)
   3. 불러오기 / 버전 변환(migration)
   4. 저장 (localStorage, JSON 파일)
   5. 입력 폼 ↔ state 연결 (data-field)
   6. 미리보기 그리기
   7. 이벤트 연결 / 시작
   ========================================================= */

/* ---------- 1. 기본 설정 / 기본값 ---------- */

const APP_ID = "pnc_wiki_generator";
const CURRENT_VERSION = 1;
const STORAGE_KEY = "pnc_wiki_generator_autosave";

// 사용자가 입력·선택하는 값만 둔다. (표시 이름, 번호 등 계산 가능한 값은 저장하지 않음)
// 필드를 "추가"할 때는 여기에만 넣으면 된다. 버전은 올리지 않아도 됨.
const DEFAULT_STATE = {
  profile: {
    name: "",
    job: "",
    model: "",
    company: "", // GAME_DATA.company 키
    class: "", // GAME_DATA.class 키
    birthday: {
      month: "", // "1" ~ "12"
      day: "", // "1" ~ "31"
      unknown: false,
    },
    history: "",
  },
  overview: {
    quote: "",
  },
  // 켜고 끌 수 있는 문단만. (고정 문단은 SECTION_DEFS의 fixed)
  sections: {
    weapon: true,
    story: true,
    appearance: true,
  },
};

// 문단 순서·제목. 번호와 목차는 이 목록으로 자동 계산한다.
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
    if (!isPlainObject(cur[key])) cur[key] = {};
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
  // 나중에 v1 → v2가 필요하면 여기에 1: (old) => ({ ... }) 추가
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

  return mergeWithDefaults(DEFAULT_STATE, converted);
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
}

// 폼 → state (입력할 때마다)
function handleInput(event) {
  const el = event.target;
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

  if (path.startsWith("profile.birthday")) {
    applyBirthdayRules();
    fillForm(); // 일 선택지·비활성 상태 갱신
  }

  saveToLocalStorage();
  render();
}

/* ---------- 6. 미리보기 그리기 ---------- */

const preview = {
  name: document.getElementById("previewName"),
  topName: document.getElementById("topPreviewName"),
  job: document.getElementById("previewJob"),
  model: document.getElementById("previewModel"),
  company: document.getElementById("previewCompany"),
  classType: document.getElementById("previewClass"),
  birthday: document.getElementById("previewBirthday"),
  history: document.getElementById("previewHistory"),
  quote: document.getElementById("previewQuote"),
};

const tocList = document.getElementById("tocList");

function valueOrDash(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : "-";
}

function getBirthdayText(birthday) {
  if (birthday.unknown) return "불명";

  const month = birthday.month ? `${birthday.month}월` : "";
  const day = birthday.day ? `${birthday.day}일` : "";

  return [month, day].filter(Boolean).join(" ");
}

// 아이콘 + 이름 표시. 아이콘이 없으면 이름만.
// (로고가 흰색이라 어두운 배경 위에 올림)
function renderIconValue(target, category, key) {
  const label = getLabel(category, key);
  const iconUrl = getIconUrl(category, key);

  target.textContent = "";

  if (iconUrl) {
    const badge = document.createElement("span");
    badge.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-right:8px;background:#2b2b2b;border-radius:4px;vertical-align:middle;";

    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = label;
    img.style.cssText = "width:24px;height:24px;object-fit:contain;";

    badge.appendChild(img);
    target.appendChild(badge);
  }

  target.appendChild(document.createTextNode(valueOrDash(label)));
}

function renderProfile() {
  const p = state.profile;
  const name = valueOrDash(p.name);

  preview.name.textContent = name;
  preview.topName.textContent = name;
  preview.job.textContent = valueOrDash(p.job);
  preview.model.textContent = valueOrDash(p.model);
  renderIconValue(preview.company, "company", p.company);
  renderIconValue(preview.classType, "class", p.class);
  preview.birthday.textContent = valueOrDash(getBirthdayText(p.birthday));
  preview.history.textContent = valueOrDash(p.history);
}

function renderOverview() {
  const quote = state.overview.quote.trim();
  preview.quote.textContent = quote ? `“${quote}”` : "“”";
}

function isSectionEnabled(section) {
  return section.fixed || state.sections[section.key] !== false;
}

function renderSections() {
  if (!tocList) return;

  tocList.innerHTML = "";
  let number = 1;

  SECTION_DEFS.forEach((section) => {
    const sectionEl = document.getElementById(section.key);
    const enabled = isSectionEnabled(section);

    if (sectionEl) {
      sectionEl.hidden = !enabled;
    }
    if (!enabled) return;

    const numberEl = sectionEl && sectionEl.querySelector(".section-number");
    if (numberEl) {
      numberEl.textContent = `${number}.`;
    }

    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${section.key}`;
    a.textContent = `${number}. ${section.title}`;
    li.appendChild(a);
    tocList.appendChild(li);

    number += 1;
  });
}

function render() {
  renderProfile();
  renderOverview();
  renderSections();
}

/* ---------- 7. 이벤트 연결 / 시작 ---------- */

function refreshAll() {
  applyBirthdayRules();
  fillForm();
  saveToLocalStorage();
  render();
}

editorPanel.addEventListener("input", handleInput);

// 목차 접기/펼치기 (미리보기 화면용)
const wikiToc = document.getElementById("wikiToc");
const tocToggleButton = document.getElementById("tocToggleButton");
const tocArrow = tocToggleButton ? tocToggleButton.querySelector(".toc-arrow") : null;

if (tocToggleButton && wikiToc) {
  tocToggleButton.addEventListener("click", () => {
    const isCollapsed = wikiToc.classList.toggle("is-collapsed");
    tocToggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    if (tocArrow) {
      tocArrow.textContent = isCollapsed ? "▷" : "▽";
    }
  });
}

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

loadFromLocalStorage();
refreshAll();
