import { useEffect, useMemo, useState } from "react";
import { currentMonth } from "../lib/life.js";
import { weekDates, weekDatesOf } from "../lib/dates.js";
import { pastWeeklyReviews } from "../lib/reviews.js";

const WEEK_FIELDS = [
  ["summary", "1. 이번 주 요약", "이번 주에 있었던 중요한 일과 흐름을 간단히 적기"],
  ["wins", "2. 잘한 선택", "이번 주에 내린 선택 중 잘했다고 생각하는 것"],
  ["winsReasonPlan", "그렇게 생각한 이유, 앞으로 어떻게 지속해 나갈 것인지", "그 선택이 좋았던 이유와 계속 이어갈 방법", "followup"],
  ["avoidance", "3. 피하거나 미룬 일", "알면서도 피했거나 뒤로 미룬 일"],
  ["avoidanceReason", "회피한 이유", "그 일을 피하게 된 상황이나 마음", "followup"],
  ["timeMoney", "4. 시간과 돈의 사용", "이번 주 시간과 돈을 어디에 썼는지 돌아보기"],
  ["worry", "5. 지금 가장 신경 쓰이는 일", "지금 머릿속을 가장 많이 차지하는 일"],
  ["keep", "6. 다음 주에도 유지할 것은?", "효과가 있었고 계속 이어가고 싶은 것"],
  ["reduce", "7. 중단하거나 줄일 것은?", "덜어내거나 멈추고 싶은 일"],
  ["promises", "8. 다음 주 약속 세 가지", "한 줄에 하나씩, 구체적이고 확인 가능한 약속"],
  ["priority", "다음 주 우선순위", "세 가지 약속 중 가장 먼저 지킬 것", "followup"],
];

const LEGACY_WEEK_FIELDS = [
  ["facts", "실제로 있었던 일"],
  ["honestTalk", "솔직하게 나눌 이야기"],
  ["did", "실제로 한 일"],
  ["goodConditions", "잘된 조건"],
  ["blockers", "막힌 이유"],
];

const WEEK_HISTORY_FIELDS = [...WEEK_FIELDS, ...LEGACY_WEEK_FIELDS];

const MONTH_FIELDS = [
  ["improvement", "실제로 나아진 것", "느낌이 아니라 달라진 행동과 결과"],
  ["postponed", "말만 하고 계속 미룬 것", "반복되는 회피를 정직하게 보기"],
  ["pattern", "이번 달 반복된 패턴", "잘된 조건과 무너진 조건"],
  ["stillImportant", "목표가 여전히 중요한가", "남의 기대가 아니라 지금도 내가 원하는가"],
  ["stop", "중단하거나 덜어낼 것", "더 하는 것만큼 중요하게 결정하기"],
  ["nextFocus", "다음 달 집중할 방향", "삶 전체에서 가장 효과가 큰 변화"],
];

function ReviewForm({ fields, initial, periodKey, onSave, submitLabel }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [createPromises, setCreatePromises] = useState(true);
  useEffect(() => setDraft(initial || {}), [initial]);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave({ ...draft, ...periodKey, createPromises });
    setSaving(false);
  };
  return (
    <form className="review-form" onSubmit={submit}>
      {fields.map(([key, label, placeholder, kind]) => <label key={key} className={kind === "followup" ? "review-followup" : ""}><span>{kind === "followup" && <i aria-hidden="true">↳</i>}{label}</span><textarea value={draft[key] || ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} rows={3} /></label>)}
      {"weekStart" in periodKey && <label className="sheet-check"><input type="checkbox" checked={createPromises} onChange={(e) => setCreatePromises(e.target.checked)} /><span>다음 주 약속 세 가지를 다음 주 목표로 자동 생성</span></label>}
      <button className="btn-primary life-save" type="submit" disabled={saving}>{saving ? "기록 중…" : submitLabel}</button>
    </form>
  );
}

function ReviewRead({ review, fields, empty }) {
  if (!review) return <div className="life-empty">{empty}</div>;
  return <div className="review-read">{fields.filter(([key]) => review[key]).map(([key, label, , kind]) => <article key={key} className={kind === "followup" ? "review-followup" : ""}><span>{kind === "followup" && <i aria-hidden="true">↳</i>}{label}</span><p>{review[key]}</p></article>)}</div>;
}

function WeeklyReviewArchive({ reviews, me, otherName, currentWeekStart }) {
  const [owner, setOwner] = useState(me);
  useEffect(() => setOwner(me), [me]);
  const history = useMemo(
    () => pastWeeklyReviews(reviews, owner, currentWeekStart),
    [reviews, owner, currentWeekStart]
  );

  return (
    <section className="life-paper weekly-review-archive">
      <div className="life-section-head">
        <div><span>冊</span><h3>지난 주간 복기</h3></div>
        <p>지나간 주의 선택과 배움을 다시 펼쳐봅니다.</p>
      </div>
      <div className="weekly-review-owner" aria-label="복기 작성자 선택">
        <button type="button" className={owner === me ? "selected" : ""} onClick={() => setOwner(me)}>내 기록</button>
        {otherName && <button type="button" className={owner === otherName ? "selected" : ""} onClick={() => setOwner(otherName)}>{otherName} 기록</button>}
      </div>
      {history.length === 0 ? (
        <div className="life-empty">아직 지나간 주간 복기가 없어요.</div>
      ) : (
        <div className="weekly-review-list">
          {history.map((review, index) => {
            const weekEnd = weekDatesOf(review.weekStart)[6];
            return (
              <details key={review.id || `${review.owner}-${review.weekStart}`} open={index === 0}>
                <summary>
                  <span>{review.weekStart.slice(5).replace("-", ".")} — {weekEnd.slice(5).replace("-", ".")}</span>
                  <strong>{review.summary || review.did || review.wins || review.facts || "기록한 복기 열기"}</strong>
                  <i aria-hidden="true">⌄</i>
                </summary>
                <ReviewRead review={review} fields={WEEK_HISTORY_FIELDS} empty="기록 내용이 없어요." />
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DecisionLog({ decisions, me, otherName, onAdd, onUpdate, onDelete }) {
  const EMPTY = { title: "", context: "", options: "", expectation: "", fear: "", reason: "", reviewDate: "" };
  const [draft, setDraft] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const sorted = [...decisions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onAdd(draft);
    if (ok) { setDraft(EMPTY); setOpen(false); }
    setSaving(false);
  };

  return (
    <section className="life-paper">
      <div className="life-section-head"><div><span>決</span><h3>중요한 결정 기록</h3></div><button type="button" className="text-action" onClick={() => setOpen((value) => !value)}>{open ? "닫기" : "+ 결정 기록"}</button></div>
      {open && <form className="decision-form" onSubmit={submit}>
        <label><span>무슨 결정을 하는가</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label><span>현재 상황과 알고 있는 사실</span><textarea value={draft.context} onChange={(e) => setDraft({ ...draft, context: e.target.value })} rows={3} /></label>
        <label><span>검토한 선택지</span><textarea value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} rows={3} /></label>
        <div className="field-pair"><label><span>예상하는 결과</span><textarea value={draft.expectation} onChange={(e) => setDraft({ ...draft, expectation: e.target.value })} rows={3} /></label><label><span>두려운 점</span><textarea value={draft.fear} onChange={(e) => setDraft({ ...draft, fear: e.target.value })} rows={3} /></label></div>
        <label><span>그래도 이 결정을 하는 이유</span><textarea value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} rows={3} /></label>
        <label><span>다시 검토할 날짜</span><input type="date" value={draft.reviewDate} onChange={(e) => setDraft({ ...draft, reviewDate: e.target.value })} /></label>
        <button className="btn-primary life-save" type="submit" disabled={saving || !draft.title.trim() || !draft.reason.trim()}>{saving ? "기록 중…" : "당시의 판단 기록"}</button>
      </form>}
      <div className="decision-list">
        {sorted.length === 0 ? <div className="life-empty">아직 기록한 결정이 없어요.</div> : sorted.map((decision) => <DecisionCard key={decision.id} decision={decision} mine={decision.owner === me} friendName={otherName} onUpdate={onUpdate} onDelete={onDelete} />)}
      </div>
    </section>
  );
}

function DecisionCard({ decision, mine, onUpdate, onDelete }) {
  const [result, setResult] = useState(decision.result || "");
  const [editing, setEditing] = useState(false);
  return (
    <article className="decision-card">
      <header><div><span>{decision.owner}의 결정</span><h4>{decision.title}</h4></div><time>{(decision.createdAt || "").slice(0, 10)}</time></header>
      <div className="decision-details">
        {decision.context && <p><b>상황</b>{decision.context}</p>}
        {decision.expectation && <p><b>예상</b>{decision.expectation}</p>}
        {decision.reason && <p><b>이유</b>{decision.reason}</p>}
        {decision.reviewDate && <p><b>재검토</b>{decision.reviewDate}</p>}
        {decision.result && !editing && <p className="decision-result"><b>실제 결과</b>{decision.result}</p>}
      </div>
      {mine && (editing ? <div className="decision-result-form"><textarea value={result} onChange={(e) => setResult(e.target.value)} rows={3} placeholder="시간이 지난 뒤 실제 결과와 배운 점" /><button type="button" onClick={async () => { await onUpdate(decision.id, result); setEditing(false); }}>결과 저장</button></div> : <div className="decision-actions"><button type="button" onClick={() => setEditing(true)}>{decision.result ? "결과 수정" : "결과 기록"}</button><button type="button" onClick={() => onDelete(decision.id)}>삭제</button></div>)}
    </article>
  );
}

export default function ReflectionHub({ state, me, otherName, onSaveWeekly, onSaveMonthly, onAddDecision, onUpdateDecision, onDeleteDecision }) {
  const [section, setSection] = useState("weekly");
  const weekStart = weekDates(0)[0];
  const month = currentMonth();
  const myWeekly = state.weeklyReviews.find((review) => review.owner === me && review.weekStart === weekStart);
  const friendWeekly = otherName ? [...state.weeklyReviews].reverse().find((review) => review.owner === otherName) : null;
  const myMonthly = state.monthlyReviews.find((review) => review.owner === me && review.month === month);
  const friendMonthly = otherName ? [...state.monthlyReviews].reverse().find((review) => review.owner === otherName) : null;
  const support = useMemo(() => state.lifeProfiles.filter((profile) => profile.supportNeeded), [state.lifeProfiles]);
  const weekStats = useMemo(() => {
    const days = weekDates(0);
    const myGoals = state.goals.filter((goal) => {
      if (goal.owner !== me || goal.status === "failed") return false;
      if (goal.startDate && goal.startDate > days[6]) return false;
      if (goal.deadline && goal.deadline < days[0]) return false;
      if (goal.scheduledWeek && goal.scheduledWeek !== days[0]) return false;
      if (goal.scheduledDate && !days.includes(goal.scheduledDate) && goal.repeatType === "none") return false;
      return true;
    });
    const planned = myGoals.filter((goal) => goal.type !== "milestone").reduce((sum, goal) => {
      if (goal.repeatType === "weekdays") return sum + (goal.repeatDays || []).filter((day) => days.some((date) => new Date(`${date}T00:00:00`).getDay() === Number(day))).length;
      if (goal.repeatType === "weekly") return sum + Math.max(1, goal.repeatCount || 1);
      return sum + 1;
    }, 0);
    const ids = new Set(myGoals.map((goal) => goal.id));
    const completed = state.checkins.filter((item) => ids.has(item.goalId) && days.includes(item.date)).length;
    const minimum = state.checkins.filter((item) => ids.has(item.goalId) && days.includes(item.date) && item.min).length;
    const unfinished = myGoals.filter((goal) => goal.deadline && goal.deadline <= days[6] && goal.status !== "completed").length;
    return { planned, completed, minimum, unfinished, rate: planned ? Math.round((completed / planned) * 100) : 0 };
  }, [state.goals, state.checkins, me]);

  return (
    <div className="life-surface">
      <header className="life-hero reflection-hero"><div><p className="life-kicker">성과보다 정직함을 남깁니다</p><h2>인생 회의와 복기</h2><p>현실을 함께 보고, 다음 선택을 더 나아지게 만드는 기록.</p></div><div className="life-hero-mark">省</div></header>
      <div className="reflection-tabs">
        <button type="button" className={section === "weekly" ? "selected" : ""} onClick={() => setSection("weekly")}>주간 인생 회의</button>
        <button type="button" className={section === "monthly" ? "selected" : ""} onClick={() => setSection("monthly")}>월간 방향 복기</button>
        <button type="button" className={section === "decisions" ? "selected" : ""} onClick={() => setSection("decisions")}>결정 기록</button>
      </div>

      {section === "weekly" && <>
        <section className="partner-charter">
          <div><span>함께 쓰는 규칙</span><strong>평가보다 질문 · 공격보다 정직 · 실패보다 다음 선택</strong></div>
          <ul><li>기록을 상대를 공격하는 근거로 쓰지 않기</li><li>요청하지 않은 충고보다 먼저 물어보기</li><li>반복해서 피하는 문제는 다정하지만 솔직하게 말하기</li></ul>
          {support.length > 0 && <div className="support-notes">{support.map((item) => <p key={item.owner}><b>{item.owner}에게 필요한 도움</b>{item.supportNeeded}</p>)}</div>}
        </section>
        <div className="review-columns">
          <section className="life-paper"><div className="life-section-head"><div><span>週</span><h3>{me}의 이번 주</h3></div><p>{weekStart} 시작</p></div><div className="review-auto-summary"><div><span>계획 행동</span><strong>{weekStats.planned}</strong></div><div><span>완료 행동</span><strong>{weekStats.completed}</strong></div><div><span>준수율</span><strong>{weekStats.rate}%</strong></div><div><span>최소치 사용</span><strong>{weekStats.minimum}</strong></div><div><span>미완료</span><strong>{weekStats.unfinished}</strong></div></div><ReviewForm fields={WEEK_FIELDS} initial={myWeekly} periodKey={{ weekStart }} onSave={onSaveWeekly} submitLabel="이번 주 복기 저장" /></section>
          <section className="life-paper friend-review"><div className="life-section-head"><div><span>友</span><h3>{otherName || "친구"}의 최근 기록</h3></div></div><ReviewRead review={friendWeekly} fields={WEEK_FIELDS} empty={otherName ? "친구의 주간 기록을 기다리고 있어요." : "친구가 들어오면 기록이 보여요."} /></section>
        </div>
        <WeeklyReviewArchive reviews={state.weeklyReviews} me={me} otherName={otherName} currentWeekStart={weekStart} />
      </>}

      {section === "monthly" && <div className="review-columns">
        <section className="life-paper"><div className="life-section-head"><div><span>月</span><h3>{me}의 {month} 복기</h3></div></div><ReviewForm fields={MONTH_FIELDS} initial={myMonthly} periodKey={{ month }} onSave={onSaveMonthly} submitLabel="이번 달 복기 저장" /></section>
        <section className="life-paper friend-review"><div className="life-section-head"><div><span>友</span><h3>{otherName || "친구"}의 최근 월간 복기</h3></div></div><ReviewRead review={friendMonthly} fields={MONTH_FIELDS} empty={otherName ? "친구의 월간 기록을 기다리고 있어요." : "친구가 들어오면 기록이 보여요."} /></section>
      </div>}

      {section === "decisions" && <DecisionLog decisions={state.decisions} me={me} otherName={otherName} onAdd={onAddDecision} onUpdate={onUpdateDecision} onDelete={onDeleteDecision} />}
    </div>
  );
}
