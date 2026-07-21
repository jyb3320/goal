import { useEffect, useRef, useState } from "react";
import { last14, todayStr, dowOf, computeStreak } from "../lib/dates.js";
import { burst, stampSound, vibrate, floatText } from "../lib/fx.js";
import Reactions from "./Reactions.jsx";
import { domainOf } from "../lib/life.js";

export default function StampGoalCard({
  goal,
  isMine,
  checkinSet,
  checkins,
  reactions,
  excuses,
  me,
  season,
  onToggleCheckin,
  onToggleReaction,
  onUpdateGoal,
  onDelete,
  onPeekExcuse,
}) {
  const [stampingKey, setStampingKey] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [minInput, setMinInput] = useState(goal.minimumVersion || "");
  const [cueInput, setCueInput] = useState(goal.cue || "");
  const [savingSetup, setSavingSetup] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const days = last14();
  // 못 찍은 날 남긴 이유 — 칸에 ✕로 표시하고, 누르면 이유가 보인다
  const excuseByDate = new Map(
    (excuses || []).filter((x) => x.goalId === goal.id).map((x) => [x.date, x.text])
  );
  // 최소 버전만 수행한 날 — 연속엔 포함되지만 옅은 도장으로 정직하게 구분
  const minByDate = new Set(
    (checkins || []).filter((c) => c.goalId === goal.id && c.min).map((c) => c.date)
  );
  const streak = computeStreak(goal.id, checkinSet);
  const badge = streak > 0 ? `연속 ${streak}일` : "오늘부터";
  const today = todayStr(0);
  const todayStamped = checkinSet.has(`${goal.id}_${today}`);

  // 손으로 찍은 느낌 — 날짜별로 늘 같은, 살짝 비뚤어진 각도
  const sealRot = (key) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return (Math.abs(h) % 13) - 6;
  };

  const celebrate = (e, min) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    burst(cx, cy, min ? 12 : 20);
    stampSound();
    vibrate(min ? 12 : 20);
    floatText(cx, cy - 16, min ? "최소 달성 · 연속 유지" : "+10 XP", min ? "#6b6151" : undefined);
    if (!min && e.currentTarget.className.includes("stamp-circle")) {
      const chain = computeStreak(goal.id, checkinSet);
      if (chain >= 1) setTimeout(() => floatText(cx, cy - 44, `🔥 ${chain + 1}일 연속!`, "#a97a24"), 220);
    }
  };

  const stamp = (d, e) => {
    const key = `${goal.id}_${d}`;
    if (!checkinSet.has(key)) {
      setStampingKey(key);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStampingKey(null), 400);
      celebrate(e, false);
    }
    onToggleCheckin(goal.id, d);
  };

  const stampMinimum = (e) => {
    if (todayStamped) return;
    celebrate(e, true);
    onToggleCheckin(goal.id, today, true);
  };

  const saveSetup = async () => {
    if (savingSetup) return;
    setSavingSetup(true);
    const ok = await onUpdateGoal(goal.id, {
      minimumVersion: minInput.trim(),
      cue: cueInput.trim(),
    });
    if (ok) setEditOpen(false);
    setSavingSetup(false);
  };

  return (
    <div className={`goal-card ${stampingKey ? "pop" : ""}`}>
      <div className="goal-top">
        <div className="goal-title">
          <span className="icon">{goal.icon}</span>
          {goal.title}
          {goal.domainKey && <span className="life-domain-tag">{domainOf(goal.domainKey)?.label}</span>}
        </div>
        <div className={`streak-badge ${badge.startsWith("오늘부터") ? "zero" : ""}`}>{badge}</div>
      </div>
      {goal.cue && <div className="goal-cue" title="실행 신호">🕘 {goal.cue}</div>}
      {season && (
        <div className="goal-thread" title={`이 도장이 12주 시즌 '${season.title}'에 쌓여요`}>
          <span className="thread-line" aria-hidden="true" />
          旬 {season.title}에 기여
        </div>
      )}
      <div className="stamp-row">
        {days.map((d) => {
          const key = `${goal.id}_${d}`;
          const isToday = d === today;
          const isYesterday = d === todayStr(-1);
          const filled = checkinSet.has(key);
          const isMinDay = filled && minByDate.has(d);
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
                  isMinDay ? "min" : "",
                  excuse ? "excused" : "",
                  isToday ? "today" : "",
                  clickable ? "clickable" : "",
                  stampingKey === key ? "stamping" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!clickable && !excuse}
                onClick={(e) => (clickable ? stamp(d, e) : excuse && onPeekExcuse(d, excuse))}
                aria-label={`${d} ${filled ? (isMinDay ? "최소 달성" : "완료") : excuse ? "못 찍음 — 이유 있음" : "미완료"}`}
                title={
                  excuse && !clickable
                    ? excuse
                    : isMinDay
                      ? "최소 버전으로 이어간 날"
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

      {isMine && goal.minimumVersion && (
        <div className="min-row">
          <span className="min-label">🌙 바쁜 날 최소치 · {goal.minimumVersion}</span>
          {!todayStamped && (
            <button type="button" className="min-stamp-btn" onClick={stampMinimum}>
              오늘은 최소만
            </button>
          )}
        </div>
      )}

      {isMine && !goal.minimumVersion && !editOpen && (
        <button type="button" className="min-setup-trigger" onClick={() => setEditOpen(true)}>
          + 바쁜 날 최소치 정하기
        </button>
      )}

      {isMine && editOpen && (
        <div className="min-setup">
          <p className="consistency-hint">무너지지 않게, 힘든 날의 최소 버전과 실행 신호를 정해두세요.</p>
          <label>
            <span>바쁜 날 최소치</span>
            <input
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              placeholder="예: 운동화만 신고 5분 걷기"
              maxLength={80}
              autoFocus
            />
          </label>
          <label>
            <span>언제·어디서</span>
            <input
              value={cueInput}
              onChange={(e) => setCueInput(e.target.value)}
              placeholder="예: 아침 기상 직후, 현관에서"
              maxLength={60}
            />
          </label>
          <div className="min-setup-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditOpen(false)}>
              취소
            </button>
            <button type="button" className="btn-primary" onClick={saveSetup} disabled={savingSetup || !minInput.trim()}>
              {savingSetup ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      )}

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
