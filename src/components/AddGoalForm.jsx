import { useEffect, useMemo, useState } from "react";
import { todayStr } from "../lib/dates.js";
import { LIFE_DOMAINS } from "../lib/life.js";
import { GOAL_CLASSES, GOAL_KINDS, REPEAT_TYPES, repeatLabel } from "../lib/goals.js";

const ICONS = ["🎯", "🔁", "📌", "🧩", "✍️", "🏃", "📖", "💪", "🌱", "💼"];
const STEPS = ["종류", "내용", "일정", "연결", "실행"];
const DEFAULT = {
  title: "", icon: "🎯", kind: "routine", goalClass: "behavior",
  target: 1, unit: "회", startDate: todayStr(0), deadline: "",
  repeatType: "daily", repeatDays: [], repeatCount: 1, executionTime: "",
  domainKey: "", seasonId: "", minimumVersion: "", cue: "",
  showOnBoard: true, allowSubstitute: true, reminder: false, subtasks: [],
};

export default function AddGoalForm({
  onAdd,
  onSave,
  onCancel,
  activeSeason,
  initialGoal = null,
  initialTitle = "",
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => ({
    ...DEFAULT,
    ...(initialGoal || {}),
    title: initialGoal?.title || initialTitle,
    seasonId: initialGoal?.seasonId || activeSeason?.id || "",
  }));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft({
      ...DEFAULT,
      ...(initialGoal || {}),
      title: initialGoal?.title || initialTitle,
      seasonId: initialGoal?.seasonId || activeSeason?.id || "",
    });
  // 12초 폴링으로 activeSeason 객체가 새로 만들어져도 작성 중 초안을 덮지 않는다.
  // 편집 대상 또는 연결할 시즌의 ID가 실제로 바뀔 때만 폼을 초기화한다.
  }, [initialGoal?.id, initialTitle, activeSeason?.id]);

  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const isQuantity = draft.kind === "milestone";
  const canNext = step !== 1 || draft.title.trim();
  const summary = useMemo(() => [
    draft.kind === "milestone" ? `${draft.target || 1}${draft.unit || "회"} 달성` : repeatLabel(draft),
    draft.deadline ? `${Number(draft.deadline.slice(5, 7))}월 ${Number(draft.deadline.slice(8, 10))}일까지` : "",
    LIFE_DOMAINS.find((item) => item.key === draft.domainKey)?.label || "",
    draft.seasonId ? "현재 12주 시즌에 연결" : "",
  ].filter(Boolean), [draft]);

  const submit = async () => {
    if (saving || !draft.title.trim()) return;
    setSaving(true);
    const payload = {
      ...draft,
      title: draft.title.trim(),
      target: Math.max(1, Number(draft.target) || 1),
      repeatCount: Math.max(1, Number(draft.repeatCount) || 1),
      type: draft.kind === "milestone" ? "milestone" : "daily",
    };
    const ok = initialGoal ? await onSave(initialGoal.id, payload) : await onAdd(payload);
    if (!ok) setSaving(false);
  };

  const toggleDay = (day) => set("repeatDays", draft.repeatDays.includes(day)
    ? draft.repeatDays.filter((item) => item !== day)
    : [...draft.repeatDays, day]);

  const updateTask = (index, fields) => set("subtasks", draft.subtasks.map((task, i) => i === index ? { ...task, ...fields } : task));

  return (
    <div className="goal-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="goal-sheet" role="dialog" aria-modal="true" aria-label={initialGoal ? "목표 수정" : "목표 만들기"}>
        <header className="goal-sheet-head">
          <div><span>{initialGoal ? "목표 다듬기" : "새 실행 만들기"}</span><h2>{STEPS[step]}</h2></div>
          <button type="button" onClick={onCancel} aria-label="닫기">✕</button>
        </header>
        <div className="goal-stepper" aria-label={`5단계 중 ${step + 1}단계`}>
          {STEPS.map((label, index) => <span key={label} className={index <= step ? "active" : ""}>{index + 1}</span>)}
        </div>

        <div className="goal-sheet-body">
          {step === 0 && <>
            <p className="sheet-question">무엇을 만들 것인가요?</p>
            <div className="kind-grid">
              {GOAL_KINDS.map(([key, label]) => <button type="button" key={key} className={draft.kind === key ? "selected" : ""} onClick={() => {
                setDraft((current) => ({ ...current, kind: key, repeatType: key === "routine" ? current.repeatType === "none" ? "daily" : current.repeatType : "none" }));
              }}><b>{key === "routine" ? "循" : key === "milestone" ? "標" : key === "project" ? "作" : "解"}</b><span>{label}</span></button>)}
            </div>
            <div className="goal-class-row">
              <span>이 목표는</span>
              {GOAL_CLASSES.map(([key, label]) => <button type="button" key={key} className={draft.goalClass === key ? "selected" : ""} onClick={() => set("goalClass", key)}>{label}</button>)}
            </div>
          </>}

          {step === 1 && <>
            <label className="sheet-field"><span>목표 이름</span><input autoFocus value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={draft.kind === "project" ? "예: 채용 포트폴리오 셋업" : "예: 화·금 콘텐츠 발행"} maxLength={120} /></label>
            {isQuantity && <div className="sheet-pair"><label className="sheet-field"><span>목표량</span><input type="number" min="1" value={draft.target} onChange={(e) => set("target", e.target.value)} /></label><label className="sheet-field"><span>단위</span><input value={draft.unit} onChange={(e) => set("unit", e.target.value)} placeholder="개" /></label></div>}
            {draft.kind === "project" && <div className="subtask-editor">
              <div className="subtask-editor-head"><span>하위 작업</span><button type="button" onClick={() => set("subtasks", [...draft.subtasks, { id: "", title: "", done: false, deadline: "" }])}>+ 추가</button></div>
              {draft.subtasks.map((task, index) => <div className="subtask-draft" key={`${index}-${task.id || "new"}`}>
                <input value={task.title} onChange={(e) => updateTask(index, { title: e.target.value })} placeholder={`작업 ${index + 1}`} />
                <input type="date" value={task.deadline || ""} onChange={(e) => updateTask(index, { deadline: e.target.value })} />
                <div className="subtask-order"><button type="button" disabled={index === 0} onClick={() => { const next = [...draft.subtasks]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; set("subtasks", next); }}>↑</button><button type="button" disabled={index === draft.subtasks.length - 1} onClick={() => { const next = [...draft.subtasks]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; set("subtasks", next); }}>↓</button><button type="button" onClick={() => set("subtasks", draft.subtasks.filter((_, i) => i !== index))}>✕</button></div>
              </div>)}
            </div>}
            <div className="icon-picker compact">{ICONS.map((icon) => <button key={icon} type="button" className={draft.icon === icon ? "selected" : ""} onClick={() => set("icon", icon)}>{icon}</button>)}</div>
          </>}

          {step === 2 && <>
            <div className="sheet-pair"><label className="sheet-field"><span>시작일</span><input type="date" value={draft.startDate} onInput={(e) => set("startDate", e.currentTarget.value)} onChange={(e) => set("startDate", e.target.value)} /></label><label className="sheet-field"><span>마감일</span><input type="date" value={draft.deadline} onInput={(e) => set("deadline", e.currentTarget.value)} onChange={(e) => set("deadline", e.target.value)} /></label></div>
            <label className="sheet-field"><span>반복 유형</span><select value={draft.repeatType} onChange={(e) => set("repeatType", e.target.value)}>{REPEAT_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {(draft.repeatType === "weekdays" || draft.repeatType === "biweekly") && <div className="weekday-picker">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <button type="button" key={day} className={draft.repeatDays.includes(index) ? "selected" : ""} onClick={() => toggleDay(index)}>{day}</button>)}</div>}
            {(draft.repeatType === "weekly" || draft.repeatType === "monthly") && <label className="sheet-field"><span>{draft.repeatType === "weekly" ? "한 주" : "한 달"} 목표 횟수</span><input type="number" min="1" max="31" value={draft.repeatCount} onChange={(e) => set("repeatCount", e.target.value)} /></label>}
            {draft.repeatType === "weekdays" && <label className="sheet-check"><input type="checkbox" checked={draft.allowSubstitute} onChange={(e) => set("allowSubstitute", e.target.checked)} /><span>요일을 놓쳐도 같은 주 안에 대체 실행 허용</span></label>}
          </>}

          {step === 3 && <>
            <label className="sheet-field"><span>연결할 영역</span><select value={draft.domainKey} onChange={(e) => set("domainKey", e.target.value)}><option value="">미지정</option>{LIFE_DOMAINS.map((domain) => <option key={domain.key} value={domain.key}>{domain.label}</option>)}</select></label>
            {activeSeason ? <label className="sheet-check"><input type="checkbox" checked={draft.seasonId === activeSeason.id} onChange={(e) => set("seasonId", e.target.checked ? activeSeason.id : "")} /><span>12주 시즌 ‘{activeSeason.title}’에 연결</span></label> : <div className="sheet-note">활성 12주 시즌이 없어요. 나중에 설계실에서 연결할 수 있습니다.</div>}
          </>}

          {step === 4 && <>
            <label className="sheet-field"><span>실행 시간</span><input type="time" value={draft.executionTime} onChange={(e) => set("executionTime", e.target.value)} /></label>
            <label className="sheet-field"><span>언제·어디서</span><input value={draft.cue} onChange={(e) => set("cue", e.target.value)} placeholder="예: 퇴근 후 책상에서" maxLength={100} /></label>
            <label className="sheet-field"><span>바쁜 날 최소치</span><input value={draft.minimumVersion} onChange={(e) => set("minimumVersion", e.target.value)} placeholder="예: 제목과 첫 문장만 쓰기" maxLength={120} /></label>
            <label className="sheet-check"><input type="checkbox" checked={draft.showOnBoard} onChange={(e) => set("showOnBoard", e.target.checked)} /><span>해당 날짜에 오늘 도장판에 자동 표시</span></label>
            <label className="sheet-check"><input type="checkbox" checked={draft.reminder} onChange={(e) => set("reminder", e.target.checked)} /><span>알림 받기</span></label>
          </>}
        </div>

        <aside className="goal-draft-summary"><span>현재 설정</span><p>{summary.length ? summary.join(" · ") : "설정을 선택해주세요"}</p></aside>
        <footer className="goal-sheet-actions">
          {step > 0 ? <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>이전</button> : <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>}
          {step < STEPS.length - 1
            ? <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>다음</button>
            : <button type="button" className="btn-primary" disabled={saving || !draft.title.trim()} onClick={submit}>{saving ? "저장 중…" : initialGoal ? "수정 저장" : "목표 만들기"}</button>}
        </footer>
      </section>
    </div>
  );
}
