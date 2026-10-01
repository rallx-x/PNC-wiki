// 뉴럴 클라우드 공용 게임 데이터
// - 사용자 JSON에는 여기의 "키"만 저장된다. (예: "42lab", "medic")
// - 키는 한 번 정하면 바꾸지 않는다. (기존 저장 파일이 깨짐)
// - icon은 assets 폴더 기준 경로. 실제 주소는 assetUrl()이 만들어 준다.

// 이미지 주소 앞부분. 저장소 이름·계정이 바뀌면 이 한 줄만 고치면 된다.
// (티스토리에 붙여넣어도 깨지지 않도록 항상 전체 주소를 쓴다)
const ASSET_BASE = "https://rallx-x.github.io/PNC-wiki/assets/";

function assetUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : ASSET_BASE + path;
}

const GAME_DATA = {
  company: {
    "42lab": { label: "42LAB", icon: "company/42lab.png" },
    svarog: { label: "스바로그", icon: "company/svarog.png" },
    ultimatelife: { label: "얼티라이프", icon: "company/ultimatelife.png" },
    uas: { label: "UAS", icon: "company/uas.png" },
    cybermedia: { label: "사이버미디어", icon: "company/cybermedia.png" },
    sanctifier: { label: "정화자", icon: "company/sanctifier.png" },
    entropics: { label: "엔트로피", icon: "company/entropics.png" },
    alternatives: { label: "특수", icon: "company/alternatives.png" },
  },

  class: {
    guard: { label: "수위", icon: "class/guard.png" },
    warrior: { label: "전사", icon: "class/warrior.png" },
    specialist: { label: "해결사", icon: "class/specialist.png" },
    medic: { label: "치료사", icon: "class/medic.png" },
    sniper: { label: "사수", icon: "class/sniper.png" },
  },

  position: {
    attack: { label: "공격", icon: "position/attack.png" },
    support: { label: "보조", icon: "position/support.png" },
    defense: { label: "수비", icon: "position/defense.png" },
    assassin: { label: "암살", icon: "position/assassin.png" },
    control: { label: "제어", icon: "position/control.png" },
    healing: { label: "회복", icon: "position/healing.png" },
  },

  gift: {},
  algorithm: {},
  intimacy: {},
  engraving: {},
  ui: {},
};

// 키 → 표시 이름. 없는 키면 빈 문자열.
function getItem(category, key) {
  return (GAME_DATA[category] && GAME_DATA[category][key]) || null;
}

function getLabel(category, key) {
  const item = getItem(category, key);
  return item ? item.label : "";
}

// 키 → 이미지 전체 주소. 이미지가 없으면 빈 문자열.
function getIconUrl(category, key) {
  const item = getItem(category, key);
  return item && item.icon ? assetUrl(item.icon) : "";
}
