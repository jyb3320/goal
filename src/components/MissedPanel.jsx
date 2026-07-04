import { useState } from "react";

// 어제 못 찍은 매일 목표 — 소급해서 도장을 찍거나, 왜 못 했는지 이유를 남긴다.
// 이유는 기록 탭의 반성 노트에 쌓인다. 지나칠 수 없게 닫기 버튼은 없다.
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
        <strong>어제 못 찍은 도장 {goals.length}개</strong>
        <span>마저 찍거나, 왜 못 했는지 한 줄 남겨주세요. 기록 탭의 반성 노트에 쌓여요.</span>
      </div>
      <ul>
        {goals.map((g) => (
          <li key={g.id}>
            <div className="missed-row">
              <span className="missed-goal">
                <span className="icon">{g.icon}</span>
                {g.title}
              </span>
              <button type="button" className="missed-stamp" onClick={() => onStamp(g.id)}>
                사실 했어요 — 도장 찍기
              </button>
            </div>
            <form className="missed-form" onSubmit={(e) => submit(e, g)}>
              <input
                value={texts[g.id] || ""}
                onChange={(e) => setTexts({ ...texts, [g.id]: e.target.value })}
                placeholder="왜 못 했을까? (예: 야근, 컨디션 난조)"
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
