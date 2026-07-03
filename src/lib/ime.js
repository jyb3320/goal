// 한글 조합(IME) 확정용 Enter에는 반응하지 않게 — 조합 중 Enter로 중복 추가/전송되는 것 방지
export function onEnter(e, fn) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) fn();
}
