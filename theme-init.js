// 화면 밝기: 그리기 전에 먼저 적용 (깜빡임 방지). 이 브라우저에만 기억
// (보안 규칙상 페이지 안에 직접 쓴 스크립트는 막아 두어서 별도 파일로 둠)
try {
  const theme = localStorage.getItem("pnc_wiki_theme");
  if (theme === "mid" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {}
