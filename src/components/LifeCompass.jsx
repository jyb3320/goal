import { useEffect, useState } from "react";
import { LIFE_DOMAINS } from "../lib/life.js";

const EMPTY_PROFILE = {
  identity: "",
  values: "",
  principles: "",
  nonNegotiables: "",
  stopDoing: "",
  supportNeeded: "",
};

const PROFILE_FIELDS = [
  ["identity", "내가 되고 싶은 사람", "직함이나 성과가 아니라 어떤 태도의 사람으로 살고 싶은가"],
  ["values", "놓치고 싶지 않은 가치", "정직, 성장, 자유, 책임처럼 선택의 기준이 되는 가치"],
  ["principles", "삶의 원칙", "건강·돈·일·관계에서 반복해서 적용할 나만의 판단 기준"],
  ["nonNegotiables", "어려워도 지킬 것", "상황이 나빠져도 포기하지 않을 최소한의 기준"],
  ["stopDoing", "하지 않기로 한 것", "내 삶을 소모시키는 행동과 선택"],
  ["supportNeeded", "친구에게 바라는 도움", "조언, 질문, 경청 등 내가 실제로 필요로 하는 방식"],
];

function ProfileEditor({ profile, editable, onSave }) {
  const [draft, setDraft] = useState({ ...EMPTY_PROFILE, ...profile });
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft({ ...EMPTY_PROFILE, ...profile }), [profile]);

  if (!editable) {
    const filled = PROFILE_FIELDS.filter(([key]) => profile?.[key]);
    if (filled.length === 0) return <div className="life-empty">아직 개인 헌법을 작성하지 않았어요.</div>;
    return (
      <div className="constitution-read">
        {filled.map(([key, label]) => (
          <article key={key}>
            <span>{label}</span>
            <p>{profile[key]}</p>
          </article>
        ))}
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <form className="constitution-form" onSubmit={submit}>
      {PROFILE_FIELDS.map(([key, label, placeholder]) => (
        <label key={key}>
          <span>{label}</span>
          <textarea
            value={draft[key]}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            placeholder={placeholder}
            rows={key === "principles" ? 4 : 3}
            maxLength={key === "principles" ? 700 : 500}
          />
        </label>
      ))}
      <button className="btn-primary life-save" type="submit" disabled={saving}>
        {saving ? "저장 중…" : "개인 헌법 저장"}
      </button>
    </form>
  );
}

function DomainEditor({ domain, record, editable, onSave }) {
  const [draft, setDraft] = useState({
    key: domain.key,
    score: 3,
    current: "",
    desired: "",
    nextStep: "",
    ...record,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ key: domain.key, score: 3, current: "", desired: "", nextStep: "", ...record });
  }, [domain.key, record]);

  if (!editable) {
    if (!record) return <div className="life-empty">아직 이 영역을 점검하지 않았어요.</div>;
    return (
      <div className="domain-read">
        <div className="domain-score-large">{record.score}<span>/5</span></div>
        <dl>
          <div><dt>지금</dt><dd>{record.current || "—"}</dd></div>
          <div><dt>원하는 모습</dt><dd>{record.desired || "—"}</dd></div>
          <div><dt>다음 한 걸음</dt><dd>{record.nextStep || "—"}</dd></div>
        </dl>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <form className="domain-form" onSubmit={submit}>
      <label className="score-field">
        <span>현재 만족도</span>
        <div>
          <input
            type="range"
            min="1"
            max="5"
            value={draft.score}
            onChange={(event) => setDraft({ ...draft, score: Number(event.target.value) })}
          />
          <strong>{draft.score}/5</strong>
        </div>
      </label>
      <label>
        <span>지금 상태</span>
        <textarea value={draft.current} onChange={(e) => setDraft({ ...draft, current: e.target.value })} rows={3} placeholder="좋은 점과 외면하고 있는 문제를 사실대로 적기" />
      </label>
      <label>
        <span>원하는 모습</span>
        <textarea value={draft.desired} onChange={(e) => setDraft({ ...draft, desired: e.target.value })} rows={3} placeholder="이 영역이 건강해졌을 때의 구체적인 모습" />
      </label>
      <label>
        <span>다음 한 걸음</span>
        <textarea value={draft.nextStep} onChange={(e) => setDraft({ ...draft, nextStep: e.target.value })} rows={2} placeholder="지금 할 수 있는 가장 현실적인 변화 하나" />
      </label>
      <button className="btn-primary life-save" type="submit" disabled={saving}>
        {saving ? "저장 중…" : `${domain.label} 점검 저장`}
      </button>
    </form>
  );
}

export default function LifeCompass({ state, me, otherName, onSaveProfile, onSaveDomain }) {
  const [who, setWho] = useState(me);
  const [section, setSection] = useState("constitution");
  const [domainKey, setDomainKey] = useState("health");
  const editable = who === me;
  const profile = state.lifeProfiles.find((item) => item.owner === who) || null;
  const domain = LIFE_DOMAINS.find((item) => item.key === domainKey);
  const record = state.lifeDomains.find((item) => item.owner === who && item.key === domainKey) || null;
  const domainRecords = state.lifeDomains.filter((item) => item.owner === who);
  const average = domainRecords.length
    ? (domainRecords.reduce((sum, item) => sum + item.score, 0) / domainRecords.length).toFixed(1)
    : null;

  useEffect(() => {
    if (who !== me && !otherName) setWho(me);
  }, [who, me, otherName]);

  return (
    <div className="life-surface">
      <header className="life-hero compass-hero">
        <div>
          <p className="life-kicker">삶의 방향을 먼저 정합니다</p>
          <h2>인생 나침반</h2>
          <p>목표보다 오래 남는 원칙을 세우고, 삶 전체를 빠짐없이 바라보는 곳.</p>
        </div>
        <div className="life-hero-mark">北</div>
      </header>

      <div className="life-toolbar">
        <div className="person-switch">
          <button type="button" className={who === me ? "selected" : ""} onClick={() => setWho(me)}>나 · {me}</button>
          {otherName && <button type="button" className={who === otherName ? "selected" : ""} onClick={() => setWho(otherName)}>{otherName}</button>}
        </div>
        <div className="section-switch">
          <button type="button" className={section === "constitution" ? "selected" : ""} onClick={() => setSection("constitution")}>개인 헌법</button>
          <button type="button" className={section === "domains" ? "selected" : ""} onClick={() => setSection("domains")}>인생 영역 {average && `· ${average}/5`}</button>
        </div>
      </div>

      {section === "constitution" ? (
        <section className="life-paper">
          <div className="life-section-head">
            <div><span>01</span><h3>{who}의 개인 헌법</h3></div>
            <p>목표가 흔들릴 때 돌아올 판단 기준</p>
          </div>
          <ProfileEditor profile={profile} editable={editable} onSave={onSaveProfile} />
        </section>
      ) : (
        <div className="domain-layout">
          <aside className="domain-grid" aria-label="인생 영역">
            {LIFE_DOMAINS.map((item) => {
              const saved = state.lifeDomains.find((d) => d.owner === who && d.key === item.key);
              return (
                <button key={item.key} type="button" className={domainKey === item.key ? "selected" : ""} onClick={() => setDomainKey(item.key)}>
                  <span className="domain-glyph">{item.icon}</span>
                  <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                  <b>{saved ? `${saved.score}/5` : "—"}</b>
                </button>
              );
            })}
          </aside>
          <section className="life-paper domain-detail">
            <div className="life-section-head">
              <div><span>{domain.icon}</span><h3>{domain.label}</h3></div>
              <p>{domain.hint}</p>
            </div>
            <DomainEditor domain={domain} record={record} editable={editable} onSave={onSaveDomain} />
          </section>
        </div>
      )}
    </div>
  );
}
