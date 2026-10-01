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
  // label = 짧은 이름 (입력 UI, 피험 인형 프로필 카드)
  // fullLabel = 정식 명칭 (상단 정보 표). 없으면 label을 씀
  // color = 상단 정보 표 로고 칸 배경색
  // (fullLabel·color 출처: 나무위키 「템플릿:뉴럴 클라우드 인형」)
  company: {
    "42lab": { label: "42LAB", color: "#909090", icon: "company/42lab.png" },
    svarog: { label: "스바로그", fullLabel: "스바로그 중공업", color: "#a40000", icon: "company/svarog.png" },
    ultimatelife: { label: "얼티라이프", fullLabel: "얼티라이프 홀딩스", color: "#30dff3", icon: "company/ultimatelife.png" },
    uas: { label: "UAS", fullLabel: "유니버설 애니씽 서비스", color: "#ff8400", icon: "company/uas.png" },
    cybermedia: { label: "사이버미디어", color: "#601986", icon: "company/cybermedia.png" },
    sanctifier: { label: "정화자", color: "#0b1016", icon: "company/sanctifier.png" },
    entropics: { label: "엔트로피", color: "#7640ca", icon: "company/entropics.png" },
    alternatives: { label: "특수", color: "#726e6d", icon: "company/alternatives.png" },
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

  // 성우 국가 (국기는 이모지 대신 이미지 — 환경마다 다르게 보이는 문제 방지)
  // JSON에는 국가 키만 저장: voiceActor.country = "jp"
  // 국기 파일은 svg (확대해도 깨지지 않음)
  country: {
    jp: { label: "일본", icon: "flag/jp.svg" },
    kr: { label: "한국", icon: "flag/kr.svg" },
    cn: { label: "중국", icon: "flag/cn.svg" },
    us: { label: "미국", icon: "flag/us.svg" },
  },

  // 능력치 (능력치 표, 알고리즘 옵션 등에 공용)
  attribute: {
    "max-hp": { label: "최대체력", icon: "attributes/max-hp.png" },
    atk: { label: "공격력", icon: "attributes/atk.png" },
    hashrate: { label: "연산력", icon: "attributes/hashrate.png" },
    "physical-def": { label: "물리방어", icon: "attributes/physical-def.png" },
    "operand-def": { label: "연산방어", icon: "attributes/operand-def.png" },
    "attack-speed": { label: "공격속도", icon: "attributes/attack-speed.png" },
    "crit-rate": { label: "치명률", icon: "attributes/crit-rate.png" },
    "crit-damage": { label: "치명타 피해", icon: "attributes/crit-damage.png" },
    "physical-penetration": { label: "물리관통", icon: "attributes/physical-penetration.png" },
    "operand-penetration": { label: "연산관통", icon: "attributes/operand-penetration.png" },
    "dodge-rate": { label: "회피율", icon: "attributes/dodge-rate.png" },
    "post-battle-hp": { label: "전투 후 회복", icon: "attributes/post-battle-hp.png" },
    "skill-haste": { label: "충전속도", icon: "attributes/skill-haste.png" },
    "debuff-resistance": { label: "효과저항", icon: "attributes/debuff-resistance.png" },
    backlash: { label: "피해반사", icon: "attributes/backlash.png" },
    "damage-boost": { label: "주는 피해량 증폭", icon: "attributes/damage-boost.png" },
    "injury-mitigation": { label: "피해 차감", icon: "attributes/injury-mitigation.png" },
    "healing-effect": { label: "치료 효과", icon: "attributes/healing-effect.png" },
  },

  // 선물 등급. 테두리 색은 화면에서 직접 그림 (색은 나중에 게임 화면 보고 조정)
  // color = 테두리, bg = 이미지 칸 안쪽 배경 (나무위키 선물 카드 참고)
  giftTier: {
    1: { label: "1티어", color: "#2f8fd8", bg: "#2f6b86" },
    2: { label: "2티어", color: "#9b5bd6", bg: "#6a4a82" },
    3: { label: "3티어", color: "#f08a1e", bg: "#8a5626" },
  },

  // 선물 호불호 아이콘 (gift 폴더)
  giftReaction: {
    like: { label: "좋아함", icon: "gift/like.png" },
    neutral: { label: "보통", icon: "gift/neutral.png" },
    hate: { label: "싫어함", icon: "gift/hate.png" },
  },

  gift: {
    // 1티어
    bun: { label: "찐빵", tier: 1, icon: "gift/bun.png" },
    "fast-food": { label: "패스트 푸드", tier: 1, icon: "gift/fast-food.png" },
    "petit-four": { label: "케익 조각", tier: 1, icon: "gift/petit-four.png" },
    honey: { label: "벌꿀", tier: 1, icon: "gift/honey.png" },
    oden: { label: "오뎅", tier: 1, icon: "gift/oden.png" },
    "plushie-charm": { label: "봉제 열쇠고리", tier: 1, icon: "gift/plushie-charm.png" },
    "digital-toy-brick": { label: "디지털 블럭", tier: 1, icon: "gift/digital-toy-brick.png" },
    "practice-shinai": { label: "연습용 죽도", tier: 1, icon: "gift/practice-shinai.png" },
    // 2티어
    "a-dozen-buns": { label: "찐빵 찜통", tier: 2, icon: "gift/a-dozen-buns.png" },
    "working-meal": { label: "직장인 세트", tier: 2, icon: "gift/working-meal.png" },
    "extra-large-cake": { label: "신호등 케익", tier: 2, icon: "gift/extra-large-cake.png" },
    "chocolate-sundae": { label: "초콜릿 선디", tier: 2, icon: "gift/chocolate-sundae.png" },
    "strawberry-cake": { label: "딸기 케익", tier: 2, icon: "gift/strawberry-cake.png" },
    "cartoon-doll": { label: "카툰 인형", tier: 2, icon: "gift/cartoon-doll.png" },
    "spaceship-in-a-bottle": { label: "보틀셔틀", tier: 2, icon: "gift/spaceship-in-a-bottle.png" },
    "army-knife": { label: "컴뱃 나이프", tier: 2, icon: "gift/army-knife.png" },
    // 3티어
    "a-basket-of-buns": { label: "찐빵 한박스", tier: 3, icon: "gift/a-basket-of-buns.png" },
    "meal-for-two": { label: "커플 세트", tier: 3, icon: "gift/meal-for-two.png" },
    "deluxe-cake": { label: "디럭스 케익", tier: 3, icon: "gift/deluxe-cake.png" },
    coffee: { label: "커피", tier: 3, icon: "gift/coffee.png" },
    "afternoon-tea": { label: "티타임 세트", tier: 3, icon: "gift/afternoon-tea.png" },
    "teddy-bear": { label: "곰돌이 인형", tier: 3, icon: "gift/teddy-bear.png" },
    "model-kit": { label: "프라모델", tier: 3, icon: "gift/model-kit.png" },
    "antique-sword": { label: "소장용 명검", tier: 3, icon: "gift/antique-sword.png" },
  },
  // 추천 알고리즘 구역. tint = 이미지 줄 배경, accent = 알고리즘 아이콘 칸 배경
  // (색 출처: 나무위키 「템플릿:뉴럴 클라우드 인형」 추천 알고리즘 표)
  algorithmType: {
    offense: { label: "공격성", tint: "#e5b8b8", accent: "#bf3937" },
    stability: { label: "안정성", tint: "#b8cce5", accent: "#3e7ac2" },
    special: { label: "특이성", tint: "#b8e5c2", accent: "#48b961" },
  },

  // 구역별로 고를 수 있는 옵션 종류 (attribute 키). 수치는 다루지 않음.
  // main = 주 옵션 후보, sub = 부 옵션 후보 (사용자 제공 「주요 수치」「부가 수치」 표 기준)
  algorithmOptionRules: {
    offense: {
      main: ["atk", "hashrate", "physical-penetration", "operand-penetration"],
      sub: [
        "max-hp", "atk", "hashrate", "physical-def", "operand-def",
        "physical-penetration", "operand-penetration", "crit-rate", "crit-damage",
        "post-battle-hp", "debuff-resistance", "damage-boost",
      ],
    },
    stability: {
      main: ["max-hp", "physical-def", "operand-def", "post-battle-hp"],
      sub: [
        "max-hp", "atk", "hashrate", "physical-def", "operand-def",
        "physical-penetration", "operand-penetration", "crit-rate", "crit-damage",
        "post-battle-hp", "debuff-resistance", "injury-mitigation",
      ],
    },
    special: {
      main: ["physical-def", "operand-def", "crit-rate", "crit-damage", "healing-effect", "skill-haste"],
      sub: [
        "max-hp", "atk", "hashrate", "physical-def", "operand-def",
        "physical-penetration", "operand-penetration", "crit-rate", "crit-damage",
        "dodge-rate", "post-battle-hp", "debuff-resistance", "healing-effect", "skill-haste",
      ],
    },
  },

  // 추천 알고리즘. set2 / set3 = 2세트·3세트 효과 (출처: 나무위키 「뉴럴 클라우드/알고리즘」, 설명 문단 제외)
  algorithm: {
    // 공격성
    "limit-value": { label: "역치초과 반응", type: "offense", set2: "주는 피해량 +5%", set3: "자신보다 최대체력이 높은 적에게 피해를 줄 때, 추가로 해당 피해량의 (6%+적 최대체력/자신 최대체력×3%)만큼의 파생피해를 준다. 피해 유형은 원래 피해량 유형과 동일하고, 최대치는 20%.", icon: "algorithm/limit-value.png" },
    feedforward: { label: "예측", type: "offense", set2: "기초 공격력 +15%", icon: "algorithm/feedforward.png" },
    progression: { label: "점진", type: "offense", set2: "기초 연산력 +15%", icon: "algorithm/progression.png" },
    deduction: { label: "추론", type: "offense", set2: "공격속도 +30", icon: "algorithm/deduction.png" },
    surplus: { label: "증폭", type: "offense", set2: "주는 피해량 +5%", icon: "algorithm/surplus.png" },
    puncture: { label: "송곳", type: "offense", set2: "물리/연산관통 +80", icon: "algorithm/puncture.png" },
    permeate: { label: "드릴", type: "offense", set2: "물리/연산관통 +20%", icon: "algorithm/permeate.png" },
    "lower-limit": { label: "최소 역치", type: "offense", set2: "체력흡수 +10%", set3: "체력이 15% 미만일 때 10초간 공격속도 +50, 공격력 +10%, 피해차감 +30%. 전투마다 1회 발동 가능.", icon: "algorithm/lower-limit.png" },
    "data-repair": { label: "데이터 복원", type: "offense", set2: "효과저항 +50", set3: "피해를 줄 때 피해량의 10%만큼 자신의 체력을 회복함.", icon: "algorithm/data-repair.png" },
    "mlr-matrix": { label: "이질 회귀", type: "offense", set2: "주는 피해량 +5%", set3: "적 유닛을 쓰러뜨리면 해당 전투 동안 상대의 공격력, 연산력, 체력 상한의 12%를 탈취하고 그만큼 회복한다. (중복 시 최고치로 갱신)", icon: "algorithm/mlr-matrix.png" },
    stack: { label: "연산자 중첩", type: "offense", set2: "기초 연산력 +15%", set3: "일반공격 3회마다 추격포를 하나 생성한다, 최대 4회 중첩. 스택마다 일반공격 시 추가로 자신 연산력 10%만큼의「파생」연산피해를 준다.", icon: "algorithm/stack.png" },
    polybore: { label: "증압 관통", type: "offense", set2: "물리/연산관통 +20%", set3: "전투 시작 시 스킬 충전 속도가 반으로 감소, 감소한 충전 속도 1%마다 주는 피해량 1.2% 상승.", icon: "algorithm/polybore.png" },
    hyperpulse: { label: "펄스 첨예화", type: "offense", set2: "주는 피해량 +5%", set3: "전투 시작 시 공격/연산력 +10%, 1초마다 추가로 공격/연산력 3% 상승, 최대 10중첩, 스킬 발동 3초 후 해제.", icon: "algorithm/hyperpulse.png" },
    // 안정성
    perception: { label: "감지", type: "stability", set2: "기초 체력 +15%", icon: "algorithm/perception.png" },
    rationality: { label: "이성", type: "stability", set2: "기초 방어력 +15%", icon: "algorithm/rationality.png" },
    connection: { label: "연결", type: "stability", set2: "효과저항 +50", icon: "algorithm/connection.png" },
    lattice: { label: "펜스", type: "stability", set2: "연산방어 +15%", icon: "algorithm/lattice.png" },
    twinform: { label: "쌍구축", type: "stability", set2: "물리/연산방어 +10%", icon: "algorithm/twinform.png" },
    threshold: { label: "확대", type: "stability", set2: "최대체력 +2500", icon: "algorithm/threshold.png" },
    encapsulate: { label: "코드 캡슐화", type: "stability", set2: "피해차감 +5%", set3: "지원 능력을 얻어 현재 체력이 가장 낮은 아군이 받는 피해량의 30%를 대신 받는다.", icon: "algorithm/encapsulate.png" },
    iteration: { label: "머신러닝", type: "stability", set2: "피해반사 +5%", set3: "전투 종료 시 쓰러지지 않았을 경우 최대 체력의 15%만큼 체력을 회복한다.", icon: "algorithm/iteration.png" },
    overflow: { label: "오버플로우", type: "stability", set2: "5초당 회복 +2%", set3: "전투 시작 시 자신에게 물리 방어력 500%만큼의 보호막을 생성한다.", icon: "algorithm/overflow.png" },
    reflection: { label: "열축적 반사", type: "stability", set2: "피해반사 +5%", set3: "반사 피해를 줄 때 추가로 자신 최대체력 1.2%만큼의 순수피해를 준다. 스킬 발동 시, 자신 주위 2칸 안의 적을 3초간 도발하며, 도발 기간 자신의 피해반사 수치가 10% 상승한다.", icon: "algorithm/reflection.png" },
    resolve: { label: "낮은값 저항", type: "stability", set2: "피해차감 +5%", set3: "체력이 50% 미만일 때 피해차감 10%를 얻는다. 이후 감소한 10% 체력마다 피해차감 5%를 얻는다. 체력이 변화할 때마다 효과를 갱신한다.", icon: "algorithm/resolve.png" },
    buildup: { label: "방벽 중첩", type: "stability", set2: "물리/연산방어 +10%", set3: "전투 시작 시,물리/연산방어 +35%. 스킬 발동 후 5초간 추가로 +35%", icon: "algorithm/buildup.png" },
    acclimate: { label: "반응 쿠션", type: "stability", set2: "기초 체력 +15%", set3: "아군 인형 체력이 30% 미만이 될 경우, 그 아군 인형에게 착용자 최대체력 35%만큼의 보호막을 부여하고 5초간 은신시킨다.(전투당 1회 발동)", icon: "algorithm/acclimate.png" },
    // 특이성
    cluster: { label: "집속", type: "special", set2: "치명률 +10%", icon: "algorithm/cluster.png" },
    inspiration: { label: "계몽", type: "special", set2: "5초당 회복 +2%", icon: "algorithm/inspiration.png" },
    convolution: { label: "합성곱", type: "special", set2: "치명타 피해 +20%", icon: "algorithm/convolution.png" },
    stratagem: { label: "게임론", type: "special", set2: "회피 +8%", icon: "algorithm/stratagem.png" },
    rapidity: { label: "키네틱", type: "special", set2: "공격속도 +30", icon: "algorithm/rapidity.png" },
    fastload: { label: "퀵로드", type: "special", set2: "충전속도 +10%", icon: "algorithm/fastload.png" },
    increment: { label: "축적", type: "special", set2: "치료효과 +7.5%", icon: "algorithm/increment.png" },
    paradigm: { label: "행렬 구조", type: "special", set2: "공격속도 +30", set3: "치명타 4회마다 적에게 현재 체력 8%만큼의 순수피해를 준다. 단 연산력의 2배를 넘지 않음.", icon: "algorithm/paradigm.png" },
    "loop-gain": { label: "양성 피드백", type: "special", set2: "치료효과 +7.5%", set3: "아군을 치료할 때 4초간 대상이 받는 치료량을 20% 상승시킨다.", icon: "algorithm/loop-gain.png" },
    "delta-v": { label: "벡터 가속", type: "special", set2: "충전속도 +10%", set3: "일반공격 3회마다 스킬 충전량 +1초.", icon: "algorithm/delta-v.png" },
    exploit: { label: "취약점 확장", type: "special", set2: "충전속도 +10%", set3: "디버프 효과를 지닌 적에게 주는 피해량 10% 상승. 대상이 가진 디버프 종류마다 자신이 주는 피해량 2% 상승. 최대 3회 중첩", icon: "algorithm/exploit.png" },
    delivery: { label: "메모리 방출", type: "special", set2: "충전속도 +10%", set3: "스킬 발동 후, 모든 인형의 공격/연산력 +20%, 지속 7초, 중첩 불가능.", icon: "algorithm/delivery.png" },
    flush: { label: "신속 정리", type: "special", set2: "충전속도 +10%", set3: "적에게 디버프를 부여할 때 그 적이 받는 피해량 +16% 상승, 지속 6초, 중첩 불가능.", icon: "algorithm/flush.png" },
    "s-v-m": { label: "서포트 벡터", type: "special", set2: "치료효과 +7.5%", set3: "치료효과 +10%, 치료 대상의 체력이 45% 미만일 경우 치료효과 +30%.", icon: "algorithm/s-v-m.png" },
  },
  // 친밀도 스킬. values = Lv1~Lv5 수치, unit = 단위
  // 문장 예: "공격력 55 상승." / "회피율 8% 상승."
  intimacyBase: "intimacy/inti-base.png", // 아이콘 뒤 배경

  intimacy: {
    "output-enhancement": { label: "출력강화", stat: "공격력", values: [7, 16, 27, 40, 55], unit: "", icon: "intimacy/output-enhancement.png" },
    "code-stability": { label: "코드안정", stat: "체력", values: [170, 380, 650, 960, 1320], unit: "", icon: "intimacy/code-stability.png" },
    "mental-activity": { label: "멘탈활성", stat: "연산력", values: [7, 16, 27, 40, 55], unit: "", icon: "intimacy/mental-activity.png" },
    "mutual-support": { label: "상호엄호", stat: "회피율", values: [1, 2.5, 4, 6, 8], unit: "%", icon: "intimacy/mutual-support.png" },
    "cooperation-bash": { label: "협력강타", stat: "치명률", values: [1, 2.5, 4, 6, 8], unit: "%", icon: "intimacy/cooperation-bash.png" },
    "victory-encouragement": { label: "필승격려", stat: "치명타 피해", values: [1.5, 3.5, 6, 8.5, 12], unit: "%", icon: "intimacy/victory-encouragement.png" },
    "healing-solidarity": { label: "치유연대", stat: "치료효과", values: [0.5, 1, 2, 3.5, 5], unit: "%", icon: "intimacy/healing-solidarity.png" },
    "core-acceleration": { label: "코어가속", stat: "충전속도", values: [1, 2.5, 4, 6, 8], unit: "%", icon: "intimacy/core-acceleration.png" },
    "shoulder-strap": { label: "어깨동무", stat: "피해차감", values: [0.5, 1, 2, 3.5, 5], unit: "%", icon: "intimacy/shoulder-strap.png" },
    fortification: { label: "진형강화", stat: "모든 피해량", values: [0.5, 1, 2, 3.5, 5], unit: "%", icon: "intimacy/fortification.png" },
    "friendship-shield": { label: "우정방패", stat: "방어력", values: [7, 16, 27, 40, 55], unit: "", icon: "intimacy/friendship-shield.png" },
    "light-of-one-mind": { label: "한마음의 빛", stat: "최대 체력", values: [1, 2.5, 4, 6, 8], unit: "%", oath: true, icon: "intimacy/light-of-one-mind.png" },
  },
  // 무장각인 (겹쳐 쓰는 이미지)
  // base 배경 → (무장각인 아이콘) → level1~3 틀
  // arma1~3 = 각인돌파 단계 배지, numeral1~3 = 로마숫자만
  arma: {
    base: "arma/base.png",
    frame: { 1: "arma/level1.png", 2: "arma/level2.png", 3: "arma/level3.png" },
    breakthrough: { 1: "arma/arma1.png", 2: "arma/arma2.png", 3: "arma/arma3.png" },
    numeral: { 1: "arma/1.png", 2: "arma/2.png", 3: "arma/3.png" },
  },
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

// 키 → 정식 명칭. fullLabel이 없으면 label.
function getFullLabel(category, key) {
  const item = getItem(category, key);
  return item ? item.fullLabel || item.label : "";
}

// 키 → 이미지 전체 주소. 이미지가 없으면 빈 문자열.
function getIconUrl(category, key) {
  const item = getItem(category, key);
  return item && item.icon ? assetUrl(item.icon) : "";
}

// 알고리즘 세트 효과 [{ label: "2세트", text }, ...]
function getAlgorithmSets(key) {
  const item = getItem("algorithm", key);
  if (!item) return [];
  return [["2세트", item.set2], ["3세트", item.set3]]
    .filter(([, text]) => text)
    .map(([label, text]) => ({ label, text }));
}

// 구역(type)에 고를 수 있는 알고리즘 키 목록
function getAlgorithmsOfType(type) {
  return Object.keys(GAME_DATA.algorithm).filter((key) => GAME_DATA.algorithm[key].type === type);
}

// 구역의 주/부 옵션 후보 (kind = "main" | "sub")
function getAllowedOptions(type, kind) {
  const rule = GAME_DATA.algorithmOptionRules[type];
  return rule && Array.isArray(rule[kind]) ? rule[kind] : [];
}

// 친밀도 스킬 효과 문장. 예: getIntimacyText("output-enhancement", 5) → "공격력 55 상승."
function getIntimacyText(key, level) {
  const item = getItem("intimacy", key);
  if (!item) return "";
  const value = item.values[level - 1];
  if (value === undefined) return "";
  return `${item.stat} ${value}${item.unit} 상승.`;
}
