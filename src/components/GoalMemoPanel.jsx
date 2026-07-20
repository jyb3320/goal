import { useState } from "react";
import { timeAgo } from "../lib/dates.js";
import { onEnter } from "../lib/ime.js";

// 그냥 적어두고 싶은 것들을 쌓아두는 메모장 (목표 승격 같은 구조 없음)
export default function GoalMemoPanel({ memos, onAdd, onUpdate, onDelete }) {
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const text = input.trim();
    if (!text || saving) return;
    setSaving(true);
    const ok = await onAdd({ text });
    if (ok) setInput("");
    setSaving(false);
  };

  const startEdit = (memo) => {
    setEditingId(memo.id);
    setEditText(memo.text);
  };

  const saveEdit = async () => {
    const text = editText.trim();
    if (!text || saving) return;
    setSaving(true);
    const ok = await onUpdate(editingId, { text });
    if (ok) setEditingId(null);
    setSaving(false);
  };

  return (
    <div className="memo-panel">
      <div className="memo-section-head">
        <h4>메모장</h4>
        {memos.length > 0 && <span className="tag">{memos.length}개</span>}
      </div>
      <div className="memo-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => onEnter(e, add)}
          placeholder="적어두고 싶은 것 아무거나…"
          maxLength={400}
        />
        <button type="button" className="btn-primary" onClick={add} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {memos.length > 0 && (
        <ul className="memo-list">
          {memos.map((memo) => (
            <li key={memo.id} className="memo-item">
              {editingId === memo.id ? (
                <div className="memo-input-row">
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => onEnter(e, saveEdit)}
                    maxLength={400}
                  />
                  <button type="button" className="btn-primary" onClick={saveEdit} disabled={saving}>
                    {saving ? "저장 중…" : "완료"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                    취소
                  </button>
                </div>
              ) : (
                <>
                  <span className="memo-text">{memo.text}</span>
                  <span className="memo-time">{memo.createdAt ? timeAgo(memo.createdAt) : ""}</span>
                  <div className="memo-item-actions">
                    <button type="button" onClick={() => startEdit(memo)}>
                      수정
                    </button>
                    <button type="button" onClick={() => onDelete(memo.id)}>
                      삭제
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
