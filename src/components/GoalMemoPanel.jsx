import { useState } from "react";
import { todayStr, timeAgo } from "../lib/dates.js";
import { onEnter } from "../lib/ime.js";

const ICONS = ["📝", "🎯", "📖", "💪", "🏃", "💼", "🌱", "🔥", "✨", "📌"];
const EMPTY_FORM = {
  title: "",
  body: "",
  icon: ICONS[0],
  goalType: "daily",
  plannedDate: "",
  deadline: "",
  target: "",
  unit: "",
};

function toForm(memo) {
  return {
    title: memo.title || "",
    body: memo.body || "",
    icon: memo.icon || ICONS[0],
    goalType: memo.goalType === "milestone" ? "milestone" : "daily",
    plannedDate: memo.plannedDate || "",
    deadline: memo.deadline || "",
    target: memo.target ? String(memo.target) : "",
    unit: memo.unit || "",
  };
}

function toPayload(form) {
  const payload = {
    title: form.title.trim(),
    body: form.body.trim(),
    icon: form.icon,
    goalType: form.goalType,
    plannedDate: form.plannedDate,
  };
  if (form.goalType === "milestone") {
    payload.deadline = form.deadline;
    payload.target = parseInt(form.target, 10) || 0;
    payload.unit = form.unit.trim() || "개";
  }
  return payload;
}

function daysUntil(date) {
  if (!date) return null;
  const start = new Date(todayStr(0) + "T00:00:00");
  const end = new Date(date + "T00:00:00");
  return Math.round((end - start) / 86400000);
}

function MemoForm({ initial = EMPTY_FORM, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const canSubmit = form.title.trim();

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(toPayload(form));
  };

  return (
    <div className="memo-form">
      <div className="type-selector memo-type-selector">
        <button type="button" className={form.goalType === "daily" ? "selected" : ""} onClick={() => set("goalType", "daily")}>
          매일 목표
        </button>
        <button type="button" className={form.goalType === "milestone" ? "selected" : ""} onClick={() => set("goalType", "milestone")}>
          기간 목표
        </button>
      </div>

      <input
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        onKeyDown={(e) => onEnter(e, submit)}
        placeholder="목표 메모 제목"
        maxLength={60}
      />
      <textarea
        value={form.body}
        onChange={(e) => set("body", e.target.value)}
        placeholder="왜 하고 싶은지, 언제 시작하면 좋을지 적어두기"
        maxLength={400}
      />
      <div className="field-row">
        <label>올릴 날짜</label>
        <input type="date" value={form.plannedDate} onChange={(e) => set("plannedDate", e.target.value)} />
      </div>
      {form.goalType === "milestone" && (
        <>
          <div className="field-row">
            <label>목표량</label>
            <input type="number" min="1" value={form.target} onChange={(e) => set("target", e.target.value)} placeholder="5" />
            <input className="unit-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="단위" maxLength={10} />
          </div>
          <div className="field-row">
            <label>마감일</label>
            <input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </div>
        </>
      )}
      <div className="icon-picker memo-icon-picker">
        {ICONS.map((ic) => (
          <button key={ic} type="button" className={form.icon === ic ? "selected" : ""} onClick={() => set("icon", ic)}>
            {ic}
          </button>
        ))}
      </div>
      <div className="memo-form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn-primary" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function MemoCard({ memo, onUpdate, onDelete, onConvert }) {
  const [editing, setEditing] = useState(false);
  const dday = daysUntil(memo.plannedDate);
  const soon = dday !== null && dday >= 0 && dday <= 7;
  const missingMilestoneFields = memo.goalType === "milestone" && (!memo.deadline || !memo.target);

  if (editing) {
    return (
      <div className="memo-card editing">
        <MemoForm
          initial={toForm(memo)}
          submitLabel="수정 완료"
          onCancel={() => setEditing(false)}
          onSubmit={(payload) => {
            onUpdate(memo.id, payload);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <article className={`memo-card ${soon ? "soon" : ""}`}>
      <div className="memo-card-top">
        <div className="memo-title">
          <span className="icon">{memo.icon || "📝"}</span>
          <strong>{memo.title}</strong>
        </div>
        <span className="type-tag">{memo.goalType === "milestone" ? "기간 목표 후보" : "매일 목표 후보"}</span>
      </div>
      {memo.body && <p className="memo-body">{memo.body}</p>}
      <div className="memo-meta">
        <span>{memo.plannedDate ? `올릴 날짜 ${memo.plannedDate}` : "올릴 날짜 미정"}</span>
        <span>{memo.createdAt ? `${timeAgo(memo.createdAt)} 작성` : "방금 작성"}</span>
        {soon && <b>곧 올릴 목표</b>}
      </div>
      {memo.goalType === "milestone" && (
        <div className="memo-extra">
          <span>목표량 {memo.target || "-"} {memo.unit || "개"}</span>
          <span>마감일 {memo.deadline || "-"}</span>
        </div>
      )}
      <div className="memo-actions">
        <button type="button" onClick={() => setEditing(true)}>
          수정
        </button>
        <button type="button" onClick={() => onDelete(memo.id)}>
          삭제
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={missingMilestoneFields}
          title={missingMilestoneFields ? "기간 목표는 목표량과 마감일이 필요해요" : undefined}
          onClick={() => onConvert(memo.id)}
        >
          현황판에 올리기
        </button>
      </div>
    </article>
  );
}

export default function GoalMemoPanel({ memos, onAdd, onUpdate, onDelete, onConvert }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="memo-panel">
      <div className="memo-add-row">
        <button className="add-goal-trigger" onClick={() => setAdding(true)} type="button">
          + 메모 추가
        </button>
      </div>

      {adding && (
        <MemoForm
          submitLabel="메모 저장"
          onCancel={() => setAdding(false)}
          onSubmit={(payload) => {
            onAdd(payload);
            setAdding(false);
          }}
        />
      )}

      {memos.length > 0 && (
        <section className="memo-section inline">
          <div className="memo-section-head">
            <h4>목표 메모</h4>
            <span className="tag">{memos.length}개</span>
          </div>
          <div className="memo-list">
            {memos.map((memo) => (
              <MemoCard key={memo.id} memo={memo} onUpdate={onUpdate} onDelete={onDelete} onConvert={onConvert} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
