import { useEffect, useRef, useState } from "react";
import { last14, todayStr, dowOf, computeStreak } from "../lib/dates.js";
import { burst, stampSound, vibrate, floatText } from "../lib/fx.js";
import Reactions from "./Reactions.jsx";

export default function StampGoalCard({
  goal,
  isMine,
  checkinSet,
  reactions,
  excuses,
  me,
  onToggleCheckin,
  onToggleReaction,
  onDelete,
  onPeekExcuse,
}) {
  const [stampingKey, setStampingKey] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const days = last14();
  // 못 찍은 날 남긴 이유 — 칸에 ✕로 표시하고, 누르면 이유가 보인다
  const excuseByDate = new Map(
    (excuses || []).filter((x) => x.goalId === goal.id).map((x) => [x.date, x.text])
  );
  const streak = computeStreak(goal.id, checkinSet);
  const badge = streak > 0 ? `연속 ${streak}일` : "오늘부터";

  // 손으로 찍은 느낌 — 날짜별로 늘 같은, 살짝 비뚤어진 각도
  const sealRot = (key) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return (Math.abs(h) % 13) - 6;
  };

  const stamp = (d, e) => {
    const key = `${goal.id}_${d}`;
    if (!checkinSet.has(key)) {
      setStampingKey(key);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStampingKey(null), 400);
      // 게임 손맛: 파티클 + 효과음 + 진동 + XP 플로팅
      const r = e.currentTarget.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      burst(cx, cy);
      stampSound();
      vibrate(20);
      floatText(cx, cy - 16, "+10 XP");
      if (d === todayStr(0)) {
        // 오늘 도장으로 이어지는 연속 기록이면 콤보 표시
        const chain = computeStreak(goal.id, checkinSet); // 찍기 전 = 어제까지의 연속
        if (chain >= 1) {
          setTimeout(() => floatText(cx, cy - 44, `🔥 ${chain + 1}일 연속!`, "#a97a24"), 220);
        }
      }
    }
    onToggleCheckin(goal.id, d);
  };

  return (
    <div className={`goal-card ${stampingKey ? "pop" : ""}`}>
      <div className="goal-top">
        <div className="goal-title">
          <span className="icon">{goal.icon}</span>
          {goal.title}
        </div>
        <div className={`streak-badge ${badge.startsWith("오늘부터") ? "zero" : ""}`}>{badge}</div>
      </div>
      <div className="stamp-row">
        {days.map((d) => {
          const key = `${goal.id}_${d}`;
          const isToday = d === todayStr(0);
          const isYesterday = d === todayStr(-1);
          const filled = checkinSet.has(key);
          const excuse = !filled ? excuseByDate.get(d) : null;
          // 어제 깜빡한 도장은 소급해서 찍을 수 있게
          const clickable = isMine && (isToday || isYesterday);
          return (
            <div className="stamp-cell" key={d}>
              <span className="dow">{dowOf(d)}</span>
              <button
                type="button"
                className={[
                  "stamp-circle",
                  filled ? "filled" : "",
                  excuse ? "excused" : "",
                  isToday ? "today" : "",
                  clickable ? "clickable" : "",
                  stampingKey === key ? "stamping" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!clickable && !excuse}
                onClick={(e) => (clickable ? stamp(d, e) : excuse && onPeekExcuse(d, excuse))}
                aria-label={`${d} ${filled ? "완료" : excuse ? "못 찍음 — 이유 있음" : "미완료"}`}
                title={
                  excuse && !clickable
                    ? excuse
                    : isYesterday && isMine
                      ? "어제 것도 소급해서 찍을 수 있어요"
                      : undefined
                }
              >
                {filled && (
                  <span className="seal-char" style={{ transform: `rotate(${sealRot(key)}deg)` }}>
                    {dowOf(d)}
                  </span>
                )}
                {!filled && excuse && <span className="excuse-mark">✕</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="goal-foot">
        <Reactions goal={goal} isMine={isMine} reactions={reactions} me={me} onToggle={onToggleReaction} />
        {isMine && (
          <button className="delete-goal" onClick={() => onDelete(goal)} type="button">
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
