import { useState } from "react";

// 어제 못 찍은 매일 목표 — "두 번은 놓치지 않기" 복구 지점.
// 소급 도장(다 했거나 최소만 했거나)을 찍거나, 왜 못 했는지 이유를 남긴다.
// 이유는 기록 탭의 실행 복기에 쌓인다. 지나칠 수 없게 닫기 버튼은 없다.
export default function MissedPanel({ goals, onStamp, onSaveReason }) {
  const [texts, setTexts] = useState({});

  const submit = (e, goal) => {
    e.preventDefault();
    const text = (texts[goal.id] || "").trim();
    if (!text) return;
    onSaveReason(goal.id, text);
  };

  return (
    <section className="missed-panel" aria-label="어제 못 찍은 도장">
      <div className="missed-head">
        <strong>어제 놓친 도장 {goals.length}개 — 두 번은 놓치지 말기</strong>
        <span>한 번 거른 건 괜찮아요. 최소로라도 이어가면 연속이 살아요. 아니면 왜 못 했는지 한 줄 남겨요.</span>
      </div>
      <ul>
        {goals.map((g) => (
          <li key={g.id}>
            <div className="missed-row">
              <span className="missed-goal">
                <span className="icon">{g.icon}</span>
                {g.title}
              </span>
              <div className="missed-actions">
                <button type="button" className="missed-stamp" onClick={() => onStamp(g.id, false)}>
                  다 했어요
                </button>
                {g.minimumVersion && (
                  <button type="button" className="missed-stamp minimum" onClick={() => onStamp(g.id, true)} title={g.minimumVersion}>
                    최소는 했어요
                  </button>
                )}
              </div>
            </div>
            <form className="missed-form" onSubmit={(e) => submit(e, g)}>
              <input
                value={texts[g.id] || ""}
                onChange={(e) => setTexts({ ...texts, [g.id]: e.target.value })}
                placeholder="정말 못 했다면 이유 한 줄 (예: 야근, 컨디션 난조)"
                maxLength={100}
              />
              <button type="submit" className="btn-primary" disabled={!(texts[g.id] || "").trim()}>
                남기기
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
