import { useEffect, useMemo, useState } from "react";
import { todayStr, weekDates } from "../lib/dates.js";
import { formatDeadline, goalKind, repeatLabel, repeatTypeOf, weekProgress } from "../lib/goals.js";
import { fiveDayReviewPeriod } from "../lib/reviewPeriods.js";

const PORTRAITS = ["/people/portrait-1.jpeg", "/people/portrait-2.png"];

function KpiPanel({ kpis, season, weekStart, readOnly, ownerName, onSaveKpi, onRecordKpi }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", type: "number", unit: "", formula: "" });
  const [values, setValues] = useState({});
  const save = async () => {
    const ok = await onSaveKpi({ ...draft, seasonId: season?.id || "" });
    if (ok) {
      setDraft({ title: "", type: "number", unit: "", formula: "" });
      setOpen(false);
    }
  };

  return (
    <section className="week-card">
      <header>
        <div><span>指標</span><h3>{readOnly ? `${ownerName}의 KPI` : "이번 주 KPI"}</h3></div>
        {!readOnly && <button type="button" onClick={() => setOpen((value) => !value)}>{open ? "닫기" : "+ 지표"}</button>}
      </header>
      {open && !readOnly && (
        <div className="kpi-create">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 저장률" />
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            <option value="number">숫자</option><option value="percentage">백분율</option><option value="money">금액</option>
            <option value="yesno">Yes/No</option><option value="formula">직접 계산식</option><option value="cumulative">누적 수치</option>
          </select>
          <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="단위" />
          <input value={draft.formula} onChange={(e) => setDraft({ ...draft, formula: e.target.value })} placeholder="계산식 (선택)" />
          <button type="button" className="btn-primary" disabled={!draft.title.trim()} onClick={save}>지표 저장</button>
        </div>
      )}
      <div className="kpi-list">
        {kpis.length === 0 ? <p className="mini-empty">{readOnly ? "등록한 KPI가 없습니다." : "복기할 숫자를 등록해두세요."}</p> : kpis.map((kpi) => {
          const entries = [...(kpi.entries || [])].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
          const recent = entries.slice(-4);
          const nums = recent.map((item) => Number(item.value)).filter(Number.isFinite);
          const trend = nums.length < 2 ? "데이터 부족" : nums.at(-1) > nums.at(-2) ? "상승 ↑" : nums.at(-1) < nums.at(-2) ? "하락 ↓" : "유지 →";
          const current = entries.find((entry) => entry.weekStart === weekStart)?.value ?? "";
          return (
            <article key={kpi.id}>
              <div><strong>{kpi.title}</strong><span>{trend}</span>{kpi.formula && <small>{kpi.formula}</small>}</div>
              {readOnly
                ? <b className="friend-kpi-value">{current === "" ? "아직 기록 전" : `${current}${kpi.unit ? ` ${kpi.unit}` : ""}`}</b>
                : <div className="kpi-entry"><input value={values[kpi.id] ?? current} onChange={(e) => setValues({ ...values, [kpi.id]: e.target.value })} placeholder={kpi.type === "yesno" ? "Yes / No" : `이번 주 값 ${kpi.unit || ""}`} /><button type="button" onClick={() => onRecordKpi(kpi.id, values[kpi.id] ?? current, weekStart)}>기록</button></div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PersonTab({ name, index, selected, stats, onClick }) {
  return (
    <button type="button" className={selected ? "selected" : ""} onClick={onClick} aria-pressed={selected}>
      <img src={PORTRAITS[index] || PORTRAITS[0]} alt="" />
      <span><strong>{name}</strong><small>이번 주 도장 {stats.stamps}개</small></span>
      <b>{stats.rate}%</b>
    </button>
  );
}

function ReviewCard({ review, ownerName }) {
  const rows = [
    ["이번 주 요약", review?.summary || review?.did || review?.facts],
    ["잘한 선택", review?.wins || review?.goodConditions],
    ["선택을 이어갈 방법", review?.winsReasonPlan],
    ["피하거나 미룬 일", review?.avoidance || review?.blockers],
    ["회피한 이유", review?.avoidanceReason],
    ["시간과 돈의 사용", review?.timeMoney],
    ["가장 신경 쓰이는 일", review?.worry],
    ["다음 주에도 유지할 것", review?.keep],
    ["중단하거나 줄일 것", review?.reduce],
    ["다음 주 약속 세 가지", review?.promises],
    ["다음 주 우선순위", review?.priority],
  ].filter(([, value]) => value);

  return (
    <section className="week-card friend-review-card">
      <header><div><span>省</span><h3>{ownerName}의 주간 복기</h3></div><b>{review ? "작성 완료" : "아직 작성 전"}</b></header>
      {!review ? <p className="mini-empty">복기가 올라오면 서로의 생각과 다음 약속까지 볼 수 있어요.</p> : (
        <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      )}
    </section>
  );
}

export default function WeekView({
  state,
  me,
  progressSum,
  checkins,
  activeSeason,
  onEdit,
  onAction,
  onAdd,
  onOpenReview,
  onSaveKpi,
  onRecordKpi,
  onCheer,
  onPoke,
}) {
  const days = weekDates(0);
  const weekStart = days[0];
  const weekEnd = days[6];
  const otherName = state.users.find((user) => user !== me) || "";
  const [selectedOwner, setSelectedOwner] = useState(me);
  useEffect(() => {
    if (!state.users.includes(selectedOwner)) setSelectedOwner(me);
  }, [state.users, selectedOwner, me]);

  const statsByOwner = useMemo(() => Object.fromEntries(state.users.map((owner) => {
    const ownerGoals = state.goals.filter((goal) => goal.owner === owner && goal.status !== "failed");
    const ids = new Set(ownerGoals.map((goal) => goal.id));
    const stamps = checkins.filter((item) => ids.has(item.goalId) && days.includes(item.date)).length;
    const planned = ownerGoals.filter((goal) => {
      if (goal.startDate && goal.startDate > weekEnd) return false;
      if (goal.deadline && goal.deadline < weekStart) return false;
      return goalKind(goal) !== "milestone";
    }).reduce((sum, goal) => sum + weekProgress(goal, checkins).target, 0);
    return [owner, { stamps, planned, rate: planned ? Math.min(100, Math.round((stamps / planned) * 100)) : 0 }];
  })), [state.users, state.goals, checkins, days, weekStart, weekEnd]);

  const readOnly = selectedOwner !== me;
  const goals = state.goals.filter((goal) => goal.owner === selectedOwner && goal.status !== "failed");
  const selectedSeason = state.seasons.find((season) => season.owner === selectedOwner && season.status === "active")
    || (!readOnly ? activeSeason : null);
  const commitments = goals.filter((goal) => goal.scheduledWeek === weekStart || (goal.repeatType === "none" && goal.startDate >= weekStart && goal.startDate <= weekEnd));
  const routines = goals.filter((goal) => goalKind(goal) === "routine" && repeatTypeOf(goal) !== "none");
  const milestones = goals.filter((goal) => goalKind(goal) === "milestone" && goal.status !== "completed");
  const projects = goals.filter((goal) => goalKind(goal) === "project" && goal.status !== "completed");
  const overdue = goals.filter((goal) => goal.deadline && goal.deadline < todayStr(0) && goal.status !== "completed");
  const kpis = state.kpis.filter((kpi) => kpi.owner === selectedOwner && (!selectedSeason || !kpi.seasonId || kpi.seasonId === selectedSeason.id));
  const reviewPeriod = fiveDayReviewPeriod(todayStr(0));
  const weeklyReview = state.weeklyReviews.find((review) => review.owner === selectedOwner && review.weekStart === reviewPeriod.start)
    || state.weeklyReviews.find((review) => review.owner === selectedOwner && review.weekStart === weekStart);
  const seasonProgress = useMemo(() => {
    const linked = goals.filter((goal) => selectedSeason && goal.seasonId === selectedSeason.id && goal.kind === "milestone");
    return linked.map((goal) => ({ goal, current: progressSum[goal.id] || 0 }));
  }, [goals, selectedSeason, progressSum]);

  const cheer = (goal) => onCheer(goal.id);

  return (
    <div className={`week-view ${readOnly ? "friend-week-view" : ""}`}>
      <header className="week-hero">
        <div>
          <p>둘이 공유하는 이번 주</p>
          <h2>{weekStart.slice(5).replace("-", ".")} — {weekEnd.slice(5).replace("-", ".")}</h2>
          <span>서로의 약속을 보고 응원하고, 필요하면 다정하게 견제합니다.</span>
        </div>
        {!readOnly && <button type="button" onClick={onAdd}>+ 이번 주 목표</button>}
      </header>

      <div className="week-people" aria-label="이번 주 사용자 선택">
        {state.users.map((user, index) => (
          <PersonTab
            key={user}
            name={user}
            index={index}
            selected={selectedOwner === user}
            stats={statsByOwner[user] || { stamps: 0, rate: 0 }}
            onClick={() => setSelectedOwner(user)}
          />
        ))}
        {!otherName && <p>친구가 들어오면 이곳에서 서로의 주간 계획을 나란히 볼 수 있어요.</p>}
      </div>

      {readOnly && (
        <div className="friend-week-banner">
          <div><strong>{selectedOwner}의 이번 주를 보는 중</strong><span>수정은 못 하지만 내용은 전부 볼 수 있어요.</span></div>
          <button type="button" onClick={onPoke}>🚪 콕 찌르기</button>
        </div>
      )}

      <div className="week-grid">
        <section className="week-card commitments">
          <header><div><span>約</span><h3>{readOnly ? `${selectedOwner}의 약속` : "이번 주 약속"}</h3></div><b>{commitments.length}</b></header>
          {commitments.length === 0 ? <p className="mini-empty">이번 주에 등록한 약속이 없습니다.</p> : commitments.map((goal) => (
            <article key={goal.id}>
              <button type="button" className={goal.status === "completed" ? "checked" : ""} disabled={readOnly} onClick={() => !readOnly && onAction(goal, goal.status === "completed" ? "resume" : "complete")}>{goal.status === "completed" ? "✓" : ""}</button>
              <div><strong>{goal.title}</strong><span>{repeatLabel(goal)} {goal.deadline ? `· ${formatDeadline(goal.deadline)}` : ""}</span></div>
              {readOnly ? <button type="button" onClick={() => cheer(goal)}>🔥 응원</button> : <button type="button" onClick={() => onEdit(goal)}>수정</button>}
            </article>
          ))}
        </section>

        <section className="week-card routines">
          <header><div><span>循</span><h3>주간 루틴</h3></div></header>
          {routines.length === 0 ? <p className="mini-empty">등록한 반복 루틴이 없습니다.</p> : routines.map((goal) => {
            const progress = weekProgress(goal, checkins);
            return <article key={goal.id}><div><strong>{goal.title}</strong><span>{progress.count}/{progress.target}회 · {repeatLabel(goal)}</span><div className="week-progress"><i style={{ width: `${progress.pct}%` }} /></div></div>{readOnly && <button type="button" onClick={() => cheer(goal)}>🔥</button>}</article>;
          })}
        </section>

        <section className="week-card">
          <header><div><span>作</span><h3>프로젝트와 기간 목표</h3></div></header>
          {[...projects, ...milestones].length === 0 ? <p className="mini-empty">진행 중인 결과물이 없습니다.</p> : [...projects, ...milestones].map((goal) => (
            <article key={goal.id} className="week-result-row">
              <div><strong>{goal.title}</strong><span>{goal.kind === "project" ? `${(goal.subtasks || []).filter((task) => task.done).length}/${(goal.subtasks || []).length}개 작업` : `${progressSum[goal.id] || 0}/${goal.target} ${goal.unit}`} · {formatDeadline(goal.deadline)}</span></div>
              {readOnly ? <button type="button" onClick={() => cheer(goal)}>🔥 응원</button> : <button type="button" onClick={() => onEdit(goal)}>수정</button>}
            </article>
          ))}
        </section>

        {selectedSeason && (
          <section className="week-card season-week-progress">
            <header><div><span>旬</span><h3>12주 진행</h3></div></header>
            <strong>{selectedSeason.title}</strong>
            {selectedSeason.focusArea && <small>{selectedSeason.focusArea}</small>}
            {seasonProgress.length === 0 ? <p className="mini-empty">시즌에 연결된 수량 목표가 없습니다.</p> : seasonProgress.map(({ goal, current }) => <p key={goal.id}>{goal.title} <b>{current}/{goal.target} {goal.unit}</b></p>)}
          </section>
        )}

        {overdue.length > 0 && (
          <section className="week-card overdue">
            <header><div><span>遲</span><h3>미뤄진 목표</h3></div></header>
            {overdue.map((goal) => <article key={goal.id}><div><strong>{goal.title}</strong><span>{formatDeadline(goal.deadline)} · 마감 지남</span></div>{readOnly ? <button type="button" onClick={onPoke}>콕 찌르기</button> : <div><button type="button" onClick={() => onEdit(goal)}>날짜 연장</button><button type="button" onClick={() => onAction(goal, "week")}>이번 주 이월</button></div>}</article>)}
          </section>
        )}

        <KpiPanel kpis={kpis} season={selectedSeason} weekStart={weekStart} readOnly={readOnly} ownerName={selectedOwner} onSaveKpi={onSaveKpi} onRecordKpi={onRecordKpi} />
        {readOnly && <ReviewCard review={weeklyReview} ownerName={selectedOwner} />}
      </div>

      {readOnly
        ? <div className="friend-week-actions"><button type="button" onClick={onPoke}>🚪 이번 주 약속 잊지 말라고 콕 찌르기</button></div>
        : <button type="button" className="week-review-cta" onClick={onOpenReview}>이번 주 실행과 지표 복기하기 →</button>}
    </div>
  );
}
