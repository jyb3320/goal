import { useEffect, useMemo, useState } from "react";
import { defaultSeasonDates, domainOf, LIFE_DOMAINS, LIFE_ITEM_KINDS } from "../lib/life.js";

const EMPTY_SEASON = {
  title: "",
  focusAreas: "",
  outcomes: "",
  why: "",
  notDoing: "",
  ...defaultSeasonDates(),
};

function SeasonEditor({ season, onSave }) {
  const [draft, setDraft] = useState({ ...EMPTY_SEASON, ...season });
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft({ ...EMPTY_SEASON, ...season }), [season]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <form className="season-form" onSubmit={submit}>
      <label className="wide"><span>이번 시즌의 이름</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 체력과 커리어 기반 만들기" maxLength={100} /></label>
      <div className="field-pair">
        <label><span>시작일</span><input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
        <label><span>종료일</span><input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
      </div>
      <label><span>집중할 인생 영역 · 최대 두 개</span><input value={draft.focusAreas} onChange={(e) => setDraft({ ...draft, focusAreas: e.target.value })} placeholder="건강, 일과 커리어" maxLength={200} /></label>
      <label><span>12주 뒤 완료됐다고 판단할 결과</span><textarea value={draft.outcomes} onChange={(e) => setDraft({ ...draft, outcomes: e.target.value })} rows={4} placeholder={"• 5km를 쉬지 않고 완주한다\n• 포트폴리오를 공개한다"} maxLength={700} /></label>
      <label><span>이 시즌이 중요한 이유</span><textarea value={draft.why} onChange={(e) => setDraft({ ...draft, why: e.target.value })} rows={3} maxLength={500} /></label>
      <label><span>이번 시즌에 하지 않을 것</span><textarea value={draft.notDoing} onChange={(e) => setDraft({ ...draft, notDoing: e.target.value })} rows={3} placeholder="새 사이드 프로젝트를 시작하지 않는다" maxLength={500} /></label>
      <button className="btn-primary life-save" type="submit" disabled={saving || !draft.title.trim() || !draft.outcomes.trim()}>
        {saving ? "저장 중…" : "12주 시즌 선언"}
      </button>
    </form>
  );
}

function SeasonRead({ season, owner }) {
  if (!season) return <div className="life-empty">{owner}은(는) 아직 12주 시즌을 정하지 않았어요.</div>;
  return (
    <div className="season-read">
      <div className="season-dates">{season.startDate} → {season.endDate}</div>
      <h3>{season.title}</h3>
      {season.focusAreas && <div className="season-focus">{season.focusAreas}</div>}
      <dl>
        <div><dt>완료 기준</dt><dd>{season.outcomes}</dd></div>
        {season.why && <div><dt>중요한 이유</dt><dd>{season.why}</dd></div>}
        {season.notDoing && <div><dt>하지 않을 것</dt><dd>{season.notDoing}</dd></div>}
      </dl>
    </div>
  );
}

function ItemComposer({ season, onAdd }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ kind: "project", title: "", domainKey: "health", doneDefinition: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const ok = await onAdd({ ...draft, seasonId: season?.id || "" });
    if (ok) {
      setDraft({ kind: "project", title: "", domainKey: "health", doneDefinition: "" });
      setOpen(false);
    }
    setSaving(false);
  };

  if (!open) return <button className="life-add-button" type="button" onClick={() => setOpen(true)}>+ 시즌 항목 추가</button>;
  return (
    <form className="life-item-form" onSubmit={submit}>
      <div className="field-pair">
        <label><span>종류</span><select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{Object.entries(LIFE_ITEM_KINDS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label><span>인생 영역</span><select value={draft.domainKey} onChange={(e) => setDraft({ ...draft, domainKey: e.target.value })}>{LIFE_DOMAINS.map((domain) => <option key={domain.key} value={domain.key}>{domain.label}</option>)}</select></label>
      </div>
      <label><span>이름</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="무엇을 끝내거나 유지하거나 해결할 것인가" /></label>
      <label><span>완료·개선됐다고 판단할 기준</span><textarea value={draft.doneDefinition} onChange={(e) => setDraft({ ...draft, doneDefinition: e.target.value })} rows={2} /></label>
      <div className="inline-actions"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>취소</button><button className="btn-primary" type="submit" disabled={saving || !draft.title.trim()}>{saving ? "저장 중…" : "추가"}</button></div>
    </form>
  );
}

export default function SeasonBoard({ state, me, otherName, goals, onSaveSeason, onCloseSeason, onAddItem, onUpdateItem, onDeleteItem, onLinkGoal }) {
  const [who, setWho] = useState(me);
  const [editingSeason, setEditingSeason] = useState(false);
  const season = state.seasons.find((item) => item.owner === who && item.status === "active") || null;
  const mySeason = state.seasons.find((item) => item.owner === me && item.status === "active") || null;
  const editable = who === me;
  const items = useMemo(
    () => state.lifeItems.filter((item) => item.owner === who && (!season || !item.seasonId || item.seasonId === season.id)),
    [state.lifeItems, who, season]
  );
  const pastSeasons = state.seasons.filter((item) => item.owner === who && item.status === "completed").reverse();
  const grouped = ["project", "routine", "problem"].map((kind) => [kind, items.filter((item) => item.kind === kind)]);

  return (
    <div className="life-surface">
      <header className="life-hero season-hero">
        <div><p className="life-kicker">모든 것을 동시에 바꾸지 않습니다</p><h2>12주 인생 시즌</h2><p>이번 계절에 집중할 두 영역을 고르고, 결과와 행동을 한 방향으로 묶는 곳.</p></div>
        <div className="season-number">12<span>weeks</span></div>
      </header>

      <div className="life-toolbar">
        <div className="person-switch">
          <button type="button" className={who === me ? "selected" : ""} onClick={() => setWho(me)}>나 · {me}</button>
          {otherName && <button type="button" className={who === otherName ? "selected" : ""} onClick={() => setWho(otherName)}>{otherName}</button>}
        </div>
      </div>

      <section className="life-paper season-declaration">
        <div className="life-section-head">
          <div><span>12週</span><h3>{who}의 현재 시즌</h3></div>
          {editable && season && <div className="season-head-actions"><button type="button" className="text-action" onClick={() => setEditingSeason((value) => !value)}>{editingSeason ? "닫기" : "수정"}</button><button type="button" className="text-action danger" onClick={onCloseSeason}>시즌 마감</button></div>}
        </div>
        {editable && (!season || editingSeason)
          ? <SeasonEditor season={season} onSave={async (draft) => { const ok = await onSaveSeason(draft); if (ok) setEditingSeason(false); return ok; }} />
          : <SeasonRead season={season} owner={who} />}
      </section>

      <section className="life-paper">
        <div className="life-section-head"><div><span>行</span><h3>프로젝트 · 루틴 · 문제</h3></div><p>시즌 목표를 현실의 일로 번역합니다</p></div>
        <div className="life-item-columns">
          {grouped.map(([kind, list]) => (
            <div className={`life-item-group ${kind}`} key={kind}>
              <div className="life-item-group-head"><strong>{LIFE_ITEM_KINDS[kind].label}</strong><span>{LIFE_ITEM_KINDS[kind].hint}</span></div>
              {list.length === 0 ? <div className="mini-empty">아직 없음</div> : list.map((item) => (
                <article className={`life-item ${item.status}`} key={item.id}>
                  <div><span>{domainOf(item.domainKey)?.label || "미분류"}</span><h4>{item.title}</h4>{item.doneDefinition && <p>{item.doneDefinition}</p>}</div>
                  {editable && <div className="life-item-actions">
                    <button type="button" onClick={() => onUpdateItem(item.id, item.status === "completed" ? "active" : "completed")}>{item.status === "completed" ? "다시 열기" : "완료"}</button>
                    <button type="button" onClick={() => onDeleteItem(item.id)}>삭제</button>
                  </div>}
                </article>
              ))}
            </div>
          ))}
        </div>
        {editable && <ItemComposer season={season} onAdd={onAddItem} />}
      </section>

      {editable && (
        <section className="life-paper">
          <div className="life-section-head"><div><span>連</span><h3>오늘의 루틴 연결</h3></div><p>도장 목표가 어떤 삶의 영역과 시즌을 위한 것인지 표시합니다</p></div>
          <div className="goal-link-list">
            {goals.length === 0 ? <div className="life-empty">먼저 오늘 화면에서 루틴이나 기간 목표를 만들어주세요.</div> : goals.map((goal) => (
              <article key={goal.id}>
                <strong>{goal.icon} {goal.title}</strong>
                <select value={goal.domainKey || ""} onChange={(e) => onLinkGoal(goal.id, e.target.value, goal.seasonId || "")}>
                  <option value="">영역 미지정</option>
                  {LIFE_DOMAINS.map((domain) => <option key={domain.key} value={domain.key}>{domain.label}</option>)}
                </select>
                <label><input type="checkbox" checked={!!(mySeason && goal.seasonId === mySeason.id)} onChange={(e) => onLinkGoal(goal.id, goal.domainKey || "", e.target.checked && mySeason ? mySeason.id : "")} disabled={!mySeason} /> 현재 시즌</label>
              </article>
            ))}
          </div>
        </section>
      )}

      {pastSeasons.length > 0 && (
        <section className="life-paper season-archive">
          <div className="life-section-head"><div><span>史</span><h3>지나온 시즌</h3></div><p>방향을 바꿔온 기록</p></div>
          <div className="season-archive-list">
            {pastSeasons.map((past) => <article key={past.id}><time>{past.startDate} → {past.endDate}</time><strong>{past.title}</strong><p>{past.outcomes}</p></article>)}
          </div>
        </section>
      )}
    </div>
  );
}
