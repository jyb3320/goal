import { useEffect, useRef, useState } from "react";
import { last14, todayStr, dowOf, weekDates, computeStreak, computeWeeklyStreak } from "../lib/dates.js";
import { burst, stampSound, vibrate, floatText } from "../lib/fx.js";
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
                onClick={(e) => clickable && stamp(d, e)}
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
