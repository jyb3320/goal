import { useMemo, useState } from "react";
import { fmtDate, todayStr, DOW } from "../lib/dates.js";

const MIN_OFFSET = -12; // 서버가 도장 기록을 약 1년만 원본으로 보관

// 월간 달력 히트맵 + 목표별 합계 + 반성 노트
export default function HistoryView({ goals, checkins, progress, excuses, me, otherName }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [who, setWho] = useState(me);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // 월요일 시작
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const today = todayStr(0);

  const { countByDate, goalTotals } = useMemo(() => {
    const myGoals = goals.filter((g) => g.owner === who);
    const ids = new Set(myGoals.map((g) => g.id));
    const countByDate = new Map();
    const perGoal = new Map();
    for (const c of checkins) {
      if (!ids.has(c.goalId) || !c.date.startsWith(monthPrefix)) continue;
      countByDate.set(c.date, (countByDate.get(c.date) || 0) + 1);
      perGoal.set(c.goalId, (perGoal.get(c.goalId) || 0) + 1);
    }
    const progressByGoal = new Map();
    for (const p of progress) {
      const g = myGoals.find((x) => x.id === p.goalId);
      if (!g || !p.date.startsWith(monthPrefix)) continue;
      progressByGoal.set(p.goalId, (progressByGoal.get(p.goalId) || 0) + p.amount);
    }
    const goalTotals = myGoals
      .map((g) =>
        g.type === "milestone"
          ? { goal: g, label: `+${Math.max(0, progressByGoal.get(g.id) || 0)} ${g.unit}` }
          : { goal: g, label: `도장 ${perGoal.get(g.id) || 0}개` }
      )
      .filter((t) => !t.label.startsWith("도장 0") && !t.label.startsWith("+0 "));
    return { countByDate, goalTotals };
  }, [goals, checkins, progress, who, monthPrefix]);

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = fmtDate(new Date(year, month, d));
    cells.push({ d, date, count: countByDate.get(date) || 0, future: date > today });
  }

  const heat = (n) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4);
  const monthTotal = [...countByDate.values()].reduce((s, n) => s + n, 0);

  // 이 달의 반성 노트 — 못 찍은 날 남긴 이유들 (최신순)
  const monthExcuses = useMemo(() => {
    const goalById = new Map(goals.map((g) => [g.id, g]));
    return (excuses || [])
      .filter((x) => x.owner === who && x.date.startsWith(monthPrefix))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((x) => ({ ...x, goal: goalById.get(x.goalId) || null }));
  }, [excuses, goals, who, monthPrefix]);

  const failedMilestones = useMemo(() => {
    return goals
      .filter((g) => {
        const failedDate = g.failedDate || (g.failedAt || "").slice(0, 10);
        return g.owner === who && g.type === "milestone" && g.status === "failed" && failedDate.startsWith(monthPrefix);
      })
      .sort((a, b) => ((a.failedDate || a.failedAt || "") < (b.failedDate || b.failedAt || "") ? 1 : -1));
  }, [goals, who, monthPrefix]);

  return (
    <div className="history">
      <div className="history-controls">
        <div className="history-who">
          <button type="button" className={who === me ? "selected" : ""} onClick={() => setWho(me)}>
            나
          </button>
          {otherName && (
            <button
              type="button"
              className={who === otherName ? "selected" : ""}
              onClick={() => setWho(otherName)}
            >
              {otherName}
            </button>
          )}
        </div>
        <div className="history-month">
          <button
            type="button"
            onClick={() => setMonthOffset(monthOffset - 1)}
            disabled={monthOffset <= MIN_OFFSET}
            aria-label="이전 달"
          >
            ‹
          </button>
          <span>
            {year}년 {month + 1}월
          </span>
          <button
            type="button"
            onClick={() => setMonthOffset(monthOffset + 1)}
            disabled={monthOffset >= 0}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      <div className="history-grid">
        {DOW.slice(1).concat(DOW[0]).map((d) => (
          <span key={d} className="history-dow">
            {d}
          </span>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <span key={`e${i}`} />
          ) : (
            <span
              key={c.date}
              className={[
                "history-cell",
                `h${heat(c.count)}`,
                c.date === today ? "today" : "",
                c.future ? "future" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={`${c.date} · 도장 ${c.count}개`}
            >
              {c.d}
            </span>
          )
        )}
      </div>

      <div className="history-total">
        이번 달 도장 {monthTotal}개
        {monthOffset <= MIN_OFFSET && " · 기록은 최근 1년까지만 보관돼요"}
      </div>

      {goalTotals.length > 0 && (
        <ul className="history-goals">
          {goalTotals.map(({ goal, label }) => (
            <li key={goal.id}>
              <span className="icon">{goal.icon}</span>
              <span className="history-goal-title">{goal.title}</span>
              <span className="history-goal-count">{label}</span>
            </li>
          ))}
        </ul>
      )}

      {monthExcuses.length > 0 && (
        <div className="reflect">
          <div className="reflect-head">
            <span className="reflect-title">반성 노트</span>
            <span className="reflect-count">못 찍은 날 {monthExcuses.length}번</span>
          </div>
          <ul className="reflect-list">
            {monthExcuses.map((x) => (
              <li key={x.id}>
                <span className="reflect-date">{parseInt(x.date.slice(8), 10)}일</span>
                <span className="reflect-goal">
                  {x.goal ? `${x.goal.icon} ${x.goal.title}` : "(지운 목표)"}
                </span>
                <span className="reflect-text">{x.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failedMilestones.length > 0 && (
        <div className="reflect failed-reflect">
          <div className="reflect-head">
            <span className="reflect-title">실패한 기간 목표</span>
            <span className="reflect-count">{failedMilestones.length}개 기록</span>
          </div>
          <ul className="failed-list">
            {failedMilestones.map((goal) => {
              const failedDate = goal.failedDate || (goal.failedAt || "").slice(0, 10);
              const finalAmount = Math.max(0, goal.finalAmount || 0);
              const target = Math.max(1, goal.target || 1);
              const pct = Math.min(100, Math.round((finalAmount / target) * 100));
              return (
                <li key={goal.id}>
                  <div className="failed-row">
                    <span className="reflect-date">{parseInt(failedDate.slice(8), 10)}일</span>
                    <strong className="failed-title">
                      {goal.icon} {goal.title}
                    </strong>
                    <span className="failed-rate">
                      {finalAmount} / {target} {goal.unit} · {pct}%
                    </span>
                  </div>
                  <div className="failed-meta">
                    마감일 {goal.originalDeadline || goal.deadline || "-"} · 실패 이유
                  </div>
                  <p>{goal.failureReason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
