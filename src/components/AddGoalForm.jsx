import { useState } from "react";
import { todayStr } from "../lib/dates.js";
import { onEnter } from "../lib/ime.js";

const ICONS = ["🏃", "💧", "📖", "🧘", "🛌", "💪", "🥗", "✍️", "🎯", "🌱"];
const GOAL_TYPE_LABEL = { daily: "매일", weekly: "주 N회", milestone: "기간 목표" };

export default function AddGoalForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [type, setType] = useState("daily");
  const [targetPerWeek, setTargetPerWeek] = useState(3);
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [deadline, setDeadline] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    if (type === "milestone" && (!target || parseInt(target, 10) < 1)) return;
    const goal = { title: title.trim(), icon, type };
    if (type === "weekly") goal.targetPerWeek = targetPerWeek;
    if (type === "milestone") {
      goal.target = parseInt(target, 10);
      goal.unit = unit.trim() || "개";
      goal.deadline = deadline;
    }
    onAdd(goal);
  };

  return (
    <div className="add-goal">
      <div className="type-selector">
        {Object.entries(GOAL_TYPE_LABEL).map(([t, label]) => (
          <button key={t} type="button" className={type === t ? "selected" : ""} onClick={() => setType(t)}>
            {label}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={
          type === "milestone" ? "목표 이름 (예: 회사 지원서 제출)" : "목표 이름 (예: 아침 러닝 30분)"
        }
        onKeyDown={(e) => onEnter(e, submit)}
      />
      {type === "weekly" && (
        <div className="field-row">
          <label>일주일에</label>
          <select value={targetPerWeek} onChange={(e) => setTargetPerWeek(parseInt(e.target.value, 10))}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}회
              </option>
            ))}
          </select>
        </div>
      )}
      {type === "milestone" && (
        <>
          <div className="field-row">
            <label>목표량</label>
            <input
              type="number"
              min="1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="5"
            />
            <input
              className="unit-input"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="단위 (개, 페이지…)"
              maxLength={10}
            />
          </div>
          <div className="field-row">
            <label>마감일</label>
            <input type="date" value={deadline} min={todayStr(0)} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </>
      )}
      <div className="icon-picker">
        {ICONS.map((ic) => (
          <button key={ic} type="button" className={icon === ic ? "selected" : ""} onClick={() => setIcon(ic)}>
            {ic}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1 }} onClick={submit} type="button">
          추가
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
