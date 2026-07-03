import { useState } from "react";
import { ddayLabel } from "../lib/dates.js";
import { burst, bigBurst, stampSound, fanfareSound, vibrate, floatText } from "../lib/fx.js";
import Reactions from "./Reactions.jsx";

export default function MilestoneGoalCard({
  goal,
  isMine,
  current,
  reactions,
  me,
  onAddProgress,
  onToggleReaction,
  onDelete,
}) {
  const [amount, setAmountRaw] = useState(1);
  const setAmount = (v) => setAmountRaw(Math.max(1, Math.min(999, v || 1)));

  const pct = Math.min(100, Math.round((current / goal.target) * 100));
  const done = current >= goal.target;
  const dday = ddayLabel(goal.deadline);

  const record = (delta, e) => {
    onAddProgress(goal.id, delta);
    if (delta <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    burst(cx, cy, 14);
    stampSound();
    vibrate(15);
    floatText(cx, cy - 16, `+${delta} ${goal.unit}`);
    if (current < goal.target && current + delta >= goal.target) {
      // 목표 달성 순간 — 팡파레
      setTimeout(() => {
        bigBurst();
        fanfareSound();
        vibrate([30, 50, 60]);
      }, 250);
    }
  };

  return (
    <div className={`goal-card ${done ? "milestone-done" : ""}`}>
      <div className="goal-top">
        <div className="goal-title">
          <span className="icon">{goal.icon}</span>
          {goal.title}
          <span className="type-tag">기간 목표</span>
        </div>
        <div className={`streak-badge ${done ? "done" : ""}`}>
          {done ? "달성! 🎉" : dday || "기한 없음"}
        </div>
      </div>
      <div className="milestone-bar">
        <div className="milestone-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="milestone-meta">
        <span className="milestone-count">
          {current} / {goal.target} {goal.unit}
        </span>
        <span className="milestone-pct">{pct}%</span>
      </div>
      <div className="goal-foot">
        <Reactions goal={goal} isMine={isMine} reactions={reactions} me={me} onToggle={onToggleReaction} />
        <div className="foot-right">
          {isMine && !done && (
            <div className="progress-controls">
              <button type="button" className="amt-btn" onClick={(e) => record(-amount, e)} title="기록 되돌리기">
                −
              </button>
              <input
                type="number"
                min="1"
                max="999"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                aria-label="기록할 수량"
              />
              <button type="button" className="amt-btn plus" onClick={(e) => record(amount, e)} title="진행 기록하기">
                +
              </button>
            </div>
          )}
          {isMine && (
            <button className="delete-goal" onClick={() => onDelete(goal)} type="button">
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
