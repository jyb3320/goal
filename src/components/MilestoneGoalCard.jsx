import { useState } from "react";
import { ddayLabel, todayStr } from "../lib/dates.js";
import { burst, bigBurst, stampSound, fanfareSound, vibrate, floatText } from "../lib/fx.js";
import Reactions from "./Reactions.jsx";
import { domainOf } from "../lib/life.js";

export default function MilestoneGoalCard({
  goal,
  isMine,
  current,
  reactions,
  me,
  season,
  onAddProgress,
  onSaveFailureReason,
  onToggleReaction,
  onDelete,
}) {
  const [amount, setAmountRaw] = useState(1);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [savingReason, setSavingReason] = useState(false);
  const setAmount = (v) => setAmountRaw(Math.max(1, Math.min(999, v || 1)));

  const pct = Math.min(100, Math.round((current / goal.target) * 100));
  const done = current >= goal.target;
  const expired = goal.type === "milestone" && !done && goal.deadline && todayStr(0) > goal.deadline;
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

  const saveFailureReason = async (e) => {
    e.preventDefault();
    const text = failureReason.trim();
    if (!text || savingReason) return;
    setSavingReason(true);
    const ok = await onSaveFailureReason(goal.id, text);
    if (ok) {
      setFailureReason("");
      setReasonOpen(false);
    }
    setSavingReason(false);
  };

  return (
    <div className={`goal-card ${done ? "milestone-done" : ""} ${expired ? "milestone-expired" : ""}`}>
      <div className="goal-top">
        <div className="goal-title">
          <span className="icon">{goal.icon}</span>
          {goal.title}
          <span className="type-tag">기간 목표</span>
          {goal.domainKey && <span className="life-domain-tag">{domainOf(goal.domainKey)?.label}</span>}
        </div>
        <div className={`streak-badge ${done ? "done" : ""}`}>
          {done ? "달성! 🎉" : expired ? "실패 이유 필요" : dday || "기한 없음"}
        </div>
      </div>
      {season && (
        <div className="goal-thread" title={`이 목표가 12주 시즌 '${season.title}'에 쌓여요`}>
          <span className="thread-line" aria-hidden="true" />
          旬 {season.title}에 기여
        </div>
      )}
      {expired && (
        <div className="expired-note">
          마감일이 지났어요. 실패 이유를 남기면 현황판에서 정리되고 기록-반성 노트에 보관돼요.
        </div>
      )}
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
          {isMine && !done && !expired && (
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
          {isMine && expired && (
            <button className="failure-trigger" onClick={() => setReasonOpen((v) => !v)} type="button">
              실패 이유 기록
            </button>
          )}
          {isMine && (
            <button className="delete-goal" onClick={() => onDelete(goal)} type="button">
              삭제
            </button>
          )}
        </div>
      </div>
      {isMine && expired && reasonOpen && (
        <form className="failure-form" onSubmit={saveFailureReason}>
          <textarea
            value={failureReason}
            onChange={(e) => setFailureReason(e.target.value)}
            placeholder="왜 달성하지 못했는지 짧게 남겨주세요."
            maxLength={300}
            autoFocus
          />
          <div className="failure-actions">
            <button type="button" onClick={() => setReasonOpen(false)}>
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={!failureReason.trim() || savingReason}>
              {savingReason ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
