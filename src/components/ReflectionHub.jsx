import { useEffect, useMemo, useState } from "react";
import { currentMonth } from "../lib/life.js";
import { weekDates } from "../lib/dates.js";

const WEEK_FIELDS = [
  ["facts", "이번 주 실제로 일어난 일", "해석보다 사실을 먼저 적기"],
  ["wins", "잘한 선택", "결과보다 내가 통제한 좋은 선택"],
  ["avoidance", "계속 피한 문제", "불편해서 미루거나 모른 척한 것"],
  ["timeMoney", "시간과 돈을 어디에 썼나", "내 우선순위와 실제 사용이 일치했는가"],
  ["worry", "현재 가장 큰 걱정", "머릿속에서 반복되는 걱정을 밖으로 꺼내기"],
  ["honestTalk", "친구에게 솔직히 말할 것", "도움이 필요하거나 숨기고 있던 이야기"],
  ["promises", "다음 주 약속 세 가지", "구체적이고 확인 가능한 약속"],
  ["priority", "그중 가장 중요한 하나", "다른 것을 놓쳐도 이것은 지키기"],
];

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
  useEffect(() => setDraft(initial || {}), [initial]);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave({ ...draft, ...periodKey });
    setSaving(false);
  };
  return (
    <form className="review-form" onSubmit={submit}>
      {fields.map(([key, label, placeholder]) => <label key={key}><span>{label}</span><textarea value={draft[key] || ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder={placeholder} rows={3} /></label>)}
      <button className="btn-primary life-save" type="submit" disabled={saving}>{saving ? "기록 중…" : submitLabel}</button>
    </form>
  );
}

function ReviewRead({ review, fields, empty }) {
  if (!review) return <div className="life-empty">{empty}</div>;
  return <div className="review-read">{fields.filter(([key]) => review[key]).map(([key, label]) => <article key={key}><span>{label}</span><p>{review[key]}</p></article>)}</div>;
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
          <section className="life-paper"><div className="life-section-head"><div><span>週</span><h3>{me}의 이번 주</h3></div><p>{weekStart} 시작</p></div><ReviewForm fields={WEEK_FIELDS} initial={myWeekly} periodKey={{ weekStart }} onSave={onSaveWeekly} submitLabel="이번 주 복기 저장" /></section>
          <section className="life-paper friend-review"><div className="life-section-head"><div><span>友</span><h3>{otherName || "친구"}의 최근 기록</h3></div></div><ReviewRead review={friendWeekly} fields={WEEK_FIELDS} empty={otherName ? "친구의 주간 기록을 기다리고 있어요." : "친구가 들어오면 기록이 보여요."} /></section>
        </div>
      </>}

      {section === "monthly" && <div className="review-columns">
        <section className="life-paper"><div className="life-section-head"><div><span>月</span><h3>{me}의 {month} 복기</h3></div></div><ReviewForm fields={MONTH_FIELDS} initial={myMonthly} periodKey={{ month }} onSave={onSaveMonthly} submitLabel="이번 달 복기 저장" /></section>
        <section className="life-paper friend-review"><div className="life-section-head"><div><span>友</span><h3>{otherName || "친구"}의 최근 월간 복기</h3></div></div><ReviewRead review={friendMonthly} fields={MONTH_FIELDS} empty={otherName ? "친구의 월간 기록을 기다리고 있어요." : "친구가 들어오면 기록이 보여요."} /></section>
      </div>}

      {section === "decisions" && <DecisionLog decisions={state.decisions} me={me} otherName={otherName} onAdd={onAddDecision} onUpdate={onUpdateDecision} onDelete={onDeleteDecision} />}
    </div>
  );
}
