/* =========================================================
   PNC WIKI Generator — data/engraving-db.js
   무장각인 > 각인강화 생성용 기준표 (자몽 Raw 43명에서 뽑은 25명)

   공식 인형의 각인강화 Lv.30 총량 = 그 인형의 5성 70레벨 능력치 × P + 특화 보너스
     P      : 각인 등급 (7개 능력치 공통 비율)
     main   : 그 인형의 주력 (5성70 공격력/연산력, 차이 5% 이내면 twin)
     bonus  : 특화 보너스 (Lv.30에 더해지는 고정 수치)
       kind   attack(공격력·연산력) / pen(관통)
       stat   원래 붙은 능력치 (GAME_DATA.attribute 키)
       side   주력과의 관계 main(같은 쪽) / off(반대쪽) / null(쌍두 — 절대 방향 그대로)

   제외 (Raw는 그대로 보존, 여기서만 뺌):
     표 복사 오기로 보임 — 브이·초코(=드셰브니), 진(=안토니나), 한나(=클루카이), 퍼즐(≈람)
     능력치 Raw와 비율이 고르지 않음 — 미요, 클로토, 린드, 성환, 아비게일, 뱅크시, 튜링,
       운디네, 플로렌스, 대연, 쿠로, 허블
     능력치 Raw에 없음 — 암흑성 허블
   ========================================================= */

const ENGRAVING_REF = [
  { name: "수춘", class: "수위", P: 0.2, main: "hash", bonus: [] },
  { name: "크로크", class: "수위", P: 0.2, main: "hash", bonus: [] },
  { name: "이블린", class: "수위", P: 0.2, main: "hash", bonus: [] },
  { name: "첼시", class: "전사", P: 0.141, main: "twin", bonus: [] },
  { name: "펜", class: "전사", P: 0.2, main: "hash", bonus: [] },
  { name: "아키", class: "전사", P: 0.2, main: "atk", bonus: [] },
  { name: "센타우레이시", class: "전사", P: 0.2, main: "atk", bonus: [] },
  { name: "하츠치리", class: "전사", P: 0.2, main: "atk", bonus: [{ kind: "attack", stat: "atk", side: "main", amount: 75 }] },
  { name: "나시타", class: "전사", P: 0.15, main: "atk", bonus: [{ kind: "attack", stat: "atk", side: "main", amount: 100 }] },
  { name: "강우", class: "전사", P: 0.105, main: "atk", bonus: [{ kind: "attack", stat: "atk", side: "main", amount: 103 }] },
  { name: "페르시카 - 집도", class: "전사", P: 0.2, main: "hash", bonus: [] },
  { name: "마이", class: "해결사", P: 0.2, main: "hash", bonus: [] },
  { name: "그루브", class: "해결사", P: 0.139, main: "hash", bonus: [] },
  { name: "안토니나", class: "해결사", P: 0.142, main: "twin", bonus: [] },
  { name: "드셰브니", class: "해결사", P: 0.139, main: "twin", bonus: [{ kind: "attack", stat: "hashrate", side: null, amount: 60 }] },
  { name: "윌로우", class: "해결사", P: 0.25, main: "twin", bonus: [] },
  { name: "노라", class: "해결사", P: 0.2, main: "twin", bonus: [{ kind: "pen", stat: "physical-penetration", side: null, amount: 100 }] },
  { name: "뒤펭", class: "해결사", P: 0.2, main: "hash", bonus: [{ kind: "attack", stat: "hashrate", side: "main", amount: 20 }] },
  { name: "보름", class: "해결사", P: 0.2, main: "hash", bonus: [] },
  { name: "임호텝", class: "치료사", P: 0.2, main: "hash", bonus: [] },
  { name: "드 레이시", class: "치료사", P: 0.2, main: "hash", bonus: [] },
  { name: "람", class: "사수", P: 0.15, main: "atk", bonus: [{ kind: "pen", stat: "physical-penetration", side: "main", amount: 100 }] },
  { name: "프레넬", class: "사수", P: 0.18, main: "twin", bonus: [{ kind: "attack", stat: "hashrate", side: null, amount: 27 }, { kind: "pen", stat: "operand-penetration", side: null, amount: 150 }] },
  { name: "전지", class: "사수", P: 0.2, main: "atk", bonus: [] },
  { name: "클루카이", class: "사수", P: 0.15, main: "hash", bonus: [{ kind: "pen", stat: "physical-penetration", side: "off", amount: 100 }] },
];
