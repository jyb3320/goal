import { useEffect, useState } from "react";

export default function BigGoalPanel({ goals, me, otherName, onSave }) {
  const mine = goals.find((goal) => goal.owner === me)?.text || "";
  const theirs = otherName
    ? goals.find((goal) => goal.owner === otherName)?.text || ""
    : "";
  const [editing, setEditing] = useState(!mine);
  const [draft, setDraft] = useState(mine);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(mine);
    if (!mine) setEditing(true);
  }, [mine, editing]);

  const save = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    const ok = await onSave(text);
    if (ok) setEditing(false);
    setSaving(false);
  };

  const cancel = () => {
    setDraft(mine);
    setEditing(false);
  };

  return (
    <section className="big-goals" aria-labelledby="big-goals-title">
      <div className="big-goals-head">
        <div>
          <p className="eyebrow">방향을 잃지 않기 위한 한 문장</p>
          <h3 id="big-goals-title">우리의 가장 큰 목표</h3>
        </div>
        <span>큰 목표를 향해 오늘의 루틴을 쌓아요</span>
      </div>

      <div className="big-goals-grid">
        <article className="big-goal-card mine">
          <div className="big-goal-owner">
            <span>나</span>
            <strong>{me}</strong>
          </div>
          {editing ? (
            <form onSubmit={save}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="내가 가장 이루고 싶은 한 가지는…"
                maxLength={160}
                rows={3}
                autoFocus={!mine}
              />
              <div className="big-goal-actions">
                {mine && (
                  <button type="button" className="btn-ghost" onClick={cancel} disabled={saving}>
                    취소
                  </button>
                )}
                <button type="submit" className="btn-primary" disabled={!draft.trim() || saving}>
                  {saving ? "새기는 중…" : "목표 새기기"}
                </button>
              </div>
            </form>
          ) : (
            <div className="big-goal-display">
              <p>{mine}</p>
              <button type="button" onClick={() => setEditing(true)}>
                수정
              </button>
            </div>
          )}
        </article>

        <article className="big-goal-card friend">
          <div className="big-goal-owner">
            <span>친구</span>
            <strong>{otherName || "대기 중"}</strong>
          </div>
          <div className={`big-goal-display ${theirs ? "" : "empty"}`}>
            <p>
              {theirs ||
                (otherName
                  ? `${otherName}이(가) 아직 가장 큰 목표를 적지 않았어요.`
                  : "친구가 들어오면 이곳에 가장 큰 목표가 보여요.")}
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
