import { useState } from "react";
import { dowOf } from "../lib/dates.js";

// 최근 며칠 못 찍은 매일 목표 — "두 번은 놓치지 않기" 복구 지점.
// 어제 것은 소급 도장(다 했거나 최소만 했거나)을 찍거나 이유를 남긴다.
// 그 이전 날은 도장은 못 찍고 이유만 남긴다 — 성과는 소급하지 않되 기록은 잃지 않는다.
// 이유는 기록 탭의 실행 복기에 쌓인다. 지나칠 수 없게 닫기 버튼은 없다.
function dayLabel(date, yesterday) {
  if (date === yesterday) return "어제";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)} (${dowOf(date)})`;
}

export default function MissedPanel({ days, yesterday, onStamp, onSaveReason }) {
  const [texts, setTexts] = useState({});

  const keyOf = (date, goalId) => `${date}_${goalId}`;

  const submit = (e, date, goal) => {
    e.preventDefault();
    const key = keyOf(date, goal.id);
    const text = (texts[key] || "").trim();
    if (!text) return;
    onSaveReason(goal.id, date, text);
  };

  const total = days.reduce((sum, day) => sum + day.goals.length, 0);
  const olderDays = days.filter((day) => day.date !== yesterday).length;

  return (
    <section className="missed-panel" aria-label="최근 못 찍은 도장">
      <div className="missed-head">
        <strong>놓친 도장 {total}개 — 두 번은 놓치지 말기</strong>
        <span>
          {olderDays > 0
            ? "비운 날도 그냥 넘어가지 않아요. 어제 건 최소로라도 이어가면 연속이 살고, 지난 날은 왜 못 했는지만 남겨두면 돼요."
            : "한 번 거른 건 괜찮아요. 최소로라도 이어가면 연속이 살아요. 아니면 왜 못 했는지 한 줄 남겨요."}
        </span>
      </div>
      {days.map(({ date, goals }) => (
        <div className="missed-day" key={date}>
          <div className="missed-day-head">
            <span className="missed-day-label">{dayLabel(date, yesterday)}</span>
            {date !== yesterday && <span className="missed-day-note">도장은 지났어요 · 이유만</span>}
          </div>
          <ul>
            {goals.map((g) => {
              const key = keyOf(date, g.id);
              return (
                <li key={key}>
                  <div className="missed-row">
                    <span className="missed-goal">
                      <span className="icon">{g.icon}</span>
                      {g.title}
                    </span>
                    {date === yesterday && (
                      <div className="missed-actions">
                        <button type="button" className="missed-stamp" onClick={() => onStamp(g.id, false)}>
                          다 했어요
                        </button>
                        {g.minimumVersion && (
                          <button
                            type="button"
                            className="missed-stamp minimum"
                            onClick={() => onStamp(g.id, true)}
                            title={g.minimumVersion}
                          >
                            최소는 했어요
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <form className="missed-form" onSubmit={(e) => submit(e, date, g)}>
                    <input
                      value={texts[key] || ""}
                      onChange={(e) => setTexts({ ...texts, [key]: e.target.value })}
                      placeholder={
                        date === yesterday
                          ? "정말 못 했다면 이유 한 줄 (예: 야근, 컨디션 난조)"
                          : "이날 왜 못 했는지 한 줄 (예: 여행, 몸살)"
                      }
                      maxLength={100}
                    />
                    <button type="submit" className="btn-primary" disabled={!(texts[key] || "").trim()}>
                      남기기
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
