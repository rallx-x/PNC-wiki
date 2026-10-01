// 뉴럴 클라우드 공용 게임 데이터
// - 사용자 JSON에는 여기의 "키"만 저장된다. (예: "42lab", "medic")
// - 키는 한 번 정하면 바꾸지 않는다. (기존 저장 파일이 깨짐)
// - icon(이미지)은 이미지 호스팅 테스트 후 추가 예정.

const GAME_DATA = {
  company: {
    "42lab": { label: "42LAB" },
    svarog: { label: "스바로그" },
    ultimatelife: { label: "얼티라이프" },
    uas: { label: "UAS" },
    cybermedia: { label: "사이버미디어" },
  },

  class: {
    guard: { label: "수위" },
    warrior: { label: "전사" },
    specialist: { label: "해결사" },
    medic: { label: "치료사" },
    sniper: { label: "사수" },
  },

  gift: {},
  algorithm: {},
  intimacy: {},
  engraving: {},
  ui: {},
};

// 키 → 표시 이름. 없는 키면 빈 문자열.
function getLabel(category, key) {
  const item = GAME_DATA[category] && GAME_DATA[category][key];
  return item ? item.label : "";
}
