import { useState } from "react";
import { todayStr } from "../lib/dates.js";
import { onEnter } from "../lib/ime.js";
import { LIFE_DOMAINS } from "../lib/life.js";

const ICONS = ["🏃", "💧", "📖", "🧘", "🛌", "💪", "🥗", "✍️", "🎯", "🌱"];
const GOAL_TYPE_LABEL = { daily: "매일", milestone: "기간 목표" };

export default function AddGoalForm({ onAdd, onCancel, activeSeason }) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [type, setType] = useState("daily");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [deadline, setDeadline] = useState("");
  const [domainKey, setDomainKey] = useState("");
  const [linkSeason, setLinkSeason] = useState(!!activeSeason);
  const [minimumVersion, setMinimumVersion] = useState("");
  const [cue, setCue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving || !title.trim()) return;
    if (type === "milestone" && (!target || parseInt(target, 10) < 1)) return;
    const goal = {
      title: title.trim(),
      icon,
      type,
      domainKey,
      seasonId: linkSeason && activeSeason ? activeSeason.id : "",
    };
    if (type === "milestone") {
      goal.target = parseInt(target, 10);
      goal.unit = unit.trim() || "개";
      goal.deadline = deadline;
    } else {
      goal.minimumVersion = minimumVersion.trim();
      goal.cue = cue.trim();
    }
    setSaving(true);
    const ok = await onAdd(goal);
    if (!ok) setSaving(false);
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
      {type === "daily" && (
        <div className="consistency-fields">
          <p className="consistency-hint">바쁜 날 무너지지 않게 미리 정해두면 성실함이 습관이 돼요. (선택)</p>
          <label>
            <span>바쁜 날 최소치</span>
            <input
              value={minimumVersion}
              onChange={(e) => setMinimumVersion(e.target.value)}
              placeholder="예: 운동화만 신고 5분 걷기"
              maxLength={80}
            />
          </label>
          <label>
            <span>언제·어디서</span>
            <input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              placeholder="예: 아침 기상 직후, 현관에서"
              maxLength={60}
            />
          </label>
        </div>
      )}
      <div className="goal-context-fields">
        <label>
          <span>연결할 인생 영역</span>
          <select value={domainKey} onChange={(event) => setDomainKey(event.target.value)}>
            <option value="">나중에 정하기</option>
            {LIFE_DOMAINS.map((domain) => (
              <option key={domain.key} value={domain.key}>{domain.label}</option>
            ))}
          </select>
        </label>
        {activeSeason && (
          <label className="season-link-check">
            <input type="checkbox" checked={linkSeason} onChange={(event) => setLinkSeason(event.target.checked)} />
            <span>현재 12주 시즌 ‘{activeSeason.title}’에 연결</span>
          </label>
        )}
      </div>
      <div className="icon-picker">
        {ICONS.map((ic) => (
          <button key={ic} type="button" className={icon === ic ? "selected" : ""} onClick={() => setIcon(ic)}>
            {ic}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1 }} onClick={submit} type="button" disabled={saving}>
          {saving ? "저장 중…" : "추가"}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
