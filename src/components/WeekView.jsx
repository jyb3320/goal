import { useMemo, useState } from "react";
import { todayStr, weekDates } from "../lib/dates.js";
import { formatDeadline, goalKind, repeatLabel, repeatTypeOf, weekProgress } from "../lib/goals.js";

function KpiPanel({ kpis, season, weekStart, onSaveKpi, onRecordKpi }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", type: "number", unit: "", formula: "" });
  const [values, setValues] = useState({});
  const save = async () => {
    const ok = await onSaveKpi({ ...draft, seasonId: season?.id || "" });
    if (ok) { setDraft({ title: "", type: "number", unit: "", formula: "" }); setOpen(false); }
  };
  return <section className="week-card">
    <header><div><span>指標</span><h3>이번 주 KPI</h3></div><button type="button" onClick={() => setOpen((value) => !value)}>{open ? "닫기" : "+ 지표"}</button></header>
    {open && <div className="kpi-create"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 저장률" /><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option value="number">숫자</option><option value="percentage">백분율</option><option value="money">금액</option><option value="yesno">Yes/No</option><option value="formula">직접 계산식</option><option value="cumulative">누적 수치</option></select><input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="단위" /><input value={draft.formula} onChange={(e) => setDraft({ ...draft, formula: e.target.value })} placeholder="계산식 (선택)" /><button type="button" className="btn-primary" disabled={!draft.title.trim()} onClick={save}>지표 저장</button></div>}
    <div className="kpi-list">{kpis.length === 0 ? <p className="mini-empty">복기할 숫자를 등록해두세요.</p> : kpis.map((kpi) => {
      const entries = [...(kpi.entries || [])].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      const recent = entries.slice(-4);
      const nums = recent.map((item) => Number(item.value)).filter(Number.isFinite);
      const trend = nums.length < 2 ? "데이터 부족" : nums.at(-1) > nums.at(-2) ? "상승 ↑" : nums.at(-1) < nums.at(-2) ? "하락 ↓" : "유지 →";
      const current = entries.find((entry) => entry.weekStart === weekStart)?.value || "";
      return <article key={kpi.id}><div><strong>{kpi.title}</strong><span>{trend}</span>{kpi.formula && <small>{kpi.formula}</small>}</div><div className="kpi-entry"><input value={values[kpi.id] ?? current} onChange={(e) => setValues({ ...values, [kpi.id]: e.target.value })} placeholder={kpi.type === "yesno" ? "Yes / No" : `이번 주 값 ${kpi.unit || ""}`} /><button type="button" onClick={() => onRecordKpi(kpi.id, values[kpi.id] ?? current, weekStart)}>기록</button></div></article>;
    })}</div>
  </section>;
}

export default function WeekView({ state, me, progressSum, checkins, activeSeason, onEdit, onAction, onAdd, onOpenReview, onSaveKpi, onRecordKpi }) {
  const days = weekDates(0);
  const weekStart = days[0];
  const weekEnd = days[6];
  const goals = state.goals.filter((goal) => goal.owner === me && goal.status !== "failed");
  const commitments = goals.filter((goal) => goal.scheduledWeek === weekStart || (goal.repeatType === "none" && goal.startDate >= weekStart && goal.startDate <= weekEnd));
  const routines = goals.filter((goal) => goalKind(goal) === "routine" && repeatTypeOf(goal) !== "none");
  const milestones = goals.filter((goal) => goalKind(goal) === "milestone" && goal.status !== "completed");
  const projects = goals.filter((goal) => goalKind(goal) === "project" && goal.status !== "completed");
  const overdue = goals.filter((goal) => goal.deadline && goal.deadline < todayStr(0) && goal.status !== "completed");
  const kpis = state.kpis.filter((kpi) => kpi.owner === me && (!activeSeason || !kpi.seasonId || kpi.seasonId === activeSeason.id));
  const seasonProgress = useMemo(() => {
    const linked = goals.filter((goal) => activeSeason && goal.seasonId === activeSeason.id && goal.kind === "milestone");
    return linked.map((goal) => ({ goal, current: progressSum[goal.id] || 0 }));
  }, [goals, activeSeason, progressSum]);

  return <div className="week-view">
    <header className="week-hero"><div><p>이번 주 약속</p><h2>{weekStart.slice(5).replace("-", ".")} — {weekEnd.slice(5).replace("-", ".")}</h2><span>오늘과 12주 사이, 실제로 끝낼 약속만 모았습니다.</span></div><button type="button" onClick={onAdd}>+ 이번 주 목표</button></header>
    <div className="week-grid">
      <section className="week-card commitments"><header><div><span>約</span><h3>이번 주 약속</h3></div><b>{commitments.length}</b></header>{commitments.length === 0 ? <p className="mini-empty">이번 주에 끝낼 행동을 추가하세요.</p> : commitments.map((goal) => <article key={goal.id}><button type="button" className={goal.status === "completed" ? "checked" : ""} onClick={() => onAction(goal, goal.status === "completed" ? "resume" : "complete")}>{goal.status === "completed" ? "✓" : ""}</button><div><strong>{goal.title}</strong><span>{repeatLabel(goal)} {goal.deadline ? `· ${formatDeadline(goal.deadline)}` : ""}</span></div><button type="button" onClick={() => onEdit(goal)}>수정</button></article>)}</section>
      <section className="week-card routines"><header><div><span>循</span><h3>주간 루틴</h3></div></header>{routines.map((goal) => { const p = weekProgress(goal, checkins); return <article key={goal.id}><div><strong>{goal.title}</strong><span>{p.count}/{p.target}회 · {repeatLabel(goal)}</span></div><div className="week-progress"><i style={{ width: `${p.pct}%` }} /></div></article>; })}</section>
      <section className="week-card"><header><div><span>作</span><h3>프로젝트와 기간 목표</h3></div></header>{[...projects, ...milestones].length === 0 ? <p className="mini-empty">진행 중인 결과물이 없습니다.</p> : [...projects, ...milestones].map((goal) => <article key={goal.id} className="week-result-row"><div><strong>{goal.title}</strong><span>{goal.kind === "project" ? `${(goal.subtasks || []).filter((task) => task.done).length}/${(goal.subtasks || []).length}개 작업` : `${progressSum[goal.id] || 0}/${goal.target} ${goal.unit}`} · {formatDeadline(goal.deadline)}</span></div><button type="button" onClick={() => onEdit(goal)}>수정</button></article>)}</section>
      {activeSeason && <section className="week-card season-week-progress"><header><div><span>旬</span><h3>12주 진행</h3></div></header><strong>{activeSeason.title}</strong>{seasonProgress.length === 0 ? <p className="mini-empty">시즌에 연결된 수량 목표가 없습니다.</p> : seasonProgress.map(({ goal, current }) => <p key={goal.id}>{goal.title} <b>{current}/{goal.target} {goal.unit}</b></p>)}</section>}
      {overdue.length > 0 && <section className="week-card overdue"><header><div><span>遲</span><h3>미뤄진 목표</h3></div></header>{overdue.map((goal) => <article key={goal.id}><div><strong>{goal.title}</strong><span>{formatDeadline(goal.deadline)} · 마감 지남</span></div><div><button type="button" onClick={() => onEdit(goal)}>날짜 연장</button><button type="button" onClick={() => onAction(goal, "week")}>이번 주 이월</button></div></article>)}</section>}
      <KpiPanel kpis={kpis} season={activeSeason} weekStart={weekStart} onSaveKpi={onSaveKpi} onRecordKpi={onRecordKpi} />
    </div>
    <button type="button" className="week-review-cta" onClick={onOpenReview}>이번 주 실행과 지표 복기하기 →</button>
  </div>;
}
