import { useEffect, useRef, useState } from "react";
import { last14, todayStr, dowOf, weekDates, computeStreak, computeWeeklyStreak } from "../lib/dates.js";
import Reactions from "./Reactions.jsx";

export default function StampGoalCard({
  goal,
  isMine,
  checkinSet,
  reactions,
  me,
  onToggleCheckin,
  onToggleReaction,
  onDelete,
}) {
  const [stampingKey, setStampingKey] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const days = last14();
  const isWeekly = goal.type === "weekly";
  const thisWeek = weekDates(0);
  const weekDone = thisWeek.filter((d) => checkinSet.has(`${goal.id}_${d}`)).length;
  const badge = isWeekly
    ? (() => {
        const streak = computeWeeklyStreak(goal, checkinSet);
        const base = `이번 주 ${Math.min(weekDone, goal.targetPerWeek)}/${goal.targetPerWeek}`;
        return streak > 0 ? `${base} · ${streak}주 연속` : base;
      })()
    : (() => {
        const streak = computeStreak(goal.id, checkinSet);
        return streak > 0 ? `연속 ${streak}일` : "오늘부터";
      })();

  const stamp = (d) => {
    const key = `${goal.id}_${d}`;
    if (!checkinSet.has(key)) {
      setStampingKey(key);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStampingKey(null), 400);
    }
    onToggleCheckin(goal.id, d);
  };

  return (
    <div className="goal-card">
      <div className="goal-top">
        <div className="goal-title">
          <span className="icon">{goal.icon}</span>
          {goal.title}
          {isWeekly && <span className="type-tag">주 {goal.targetPerWeek}회</span>}
        </div>
        <div className={`streak-badge ${badge.startsWith("오늘부터") ? "zero" : ""}`}>{badge}</div>
      </div>
      <div className="stamp-row">
        {days.map((d) => {
          const key = `${goal.id}_${d}`;
          const isToday = d === todayStr(0);
          const isYesterday = d === todayStr(-1);
          const filled = checkinSet.has(key);
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
                  isToday ? "today" : "",
                  clickable ? "clickable" : "",
                  stampingKey === key ? "stamping" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!clickable}
                onClick={() => clickable && stamp(d)}
                aria-label={`${d} ${filled ? "완료" : "미완료"}`}
                title={isYesterday && isMine ? "어제 것도 소급해서 찍을 수 있어요" : undefined}
              />
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
