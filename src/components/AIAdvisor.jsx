import { useMemo, useState } from "react";
import { LIFE_DOMAINS } from "../lib/life.js";

const MODES = [
  { key: "weekly", mark: "週", label: "주간 참모", hint: "지난 행동과 복기를 근거로 다음 실험을 정합니다" },
  { key: "goal_architect", mark: "構", label: "목표 설계", hint: "큰 방향을 12주 결과와 현실적인 행동으로 번역합니다" },
  { key: "alignment", mark: "整", label: "정합성", hint: "가치·목표·실제 행동의 연결을 질문합니다" },
  { key: "avoidance", mark: "避", label: "회피 패턴", hint: "반복되는 미완료에서 검증할 가설을 찾습니다" },
  { key: "decision", mark: "決", label: "결정 참모", hint: "중요한 결정의 가정과 반대편 비용을 묻습니다" },
  { key: "meeting", mark: "會", label: "회의 진행", hint: "둘의 공유된 복기를 대화 순서와 질문으로 만듭니다" },
  { key: "monthly", mark: "月", label: "월간 보고", hint: "점수 대신 한 달 동안 달라진 삶의 서사를 봅니다" },
];

const SCOPES = [
  ["bigGoal", "가장 큰 목표"],
  ["profile", "개인 헌법"],
  ["domains", "인생 영역"],
  ["season", "12주 시즌"],
  ["items", "프로젝트·루틴"],
  ["goals", "도장·기간 목표"],
  ["activity", "최근 실행·미완료"],
  ["reviews", "주간·월간 복기"],
  ["decisions", "결정 기록"],
];

const DEFAULT_SCOPES = {
  weekly: ["bigGoal", "profile", "domains", "season", "items", "goals", "activity", "reviews"],
  goal_architect: ["bigGoal", "profile", "domains"],
  alignment: ["bigGoal", "profile", "domains", "season", "items", "goals", "activity"],
  avoidance: ["goals", "activity", "reviews"],
  decision: ["bigGoal", "profile", "decisions"],
  meeting: ["profile", "activity", "reviews"],
  monthly: ["bigGoal", "profile", "domains", "season", "items", "goals", "activity", "reviews", "decisions"],
};

const DOMAIN_MAP = Object.fromEntries(LIFE_DOMAINS.map((domain) => [domain.key, domain.label]));

function EvidenceList({ evidence }) {
  if (!evidence?.length) return null;
  return (
    <div className="ai-evidence">
      <span>근거 기록</span>
      {evidence.map((source) => (
        <details key={source.id}>
          <summary>{source.date ? `${source.date} · ` : ""}{source.label}</summary>
          <p>{source.excerpt}</p>
        </details>
      ))}
    </div>
  );
}

function ReportView({ report, onClear }) {
  const [hiddenSections, setHiddenSections] = useState([]);
  const hideSection = (index) => setHiddenSections((current) => [...current, index]);
  return (
    <section className="ai-report" aria-live="polite">
      <header>
        <div>
          <span className="ai-report-kicker">Kimi 참모 보고서</span>
          <h3>{report.title}</h3>
          {report.stance && <p>{report.stance}</p>}
        </div>
        <button type="button" className="text-action" onClick={onClear}>닫기</button>
      </header>

      <div className="ai-report-sections">
        {report.sections.map((section, index) => !hiddenSections.includes(index) && (
          <article key={`${section.title}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <div className="ai-section-heading">
                <h4>{section.title}</h4>
                <button type="button" onClick={() => hideSection(index)}>이 분석 숨기기</button>
              </div>
              <p>{section.text}</p>
              <EvidenceList evidence={section.evidence} />
            </div>
          </article>
        ))}
      </div>

      <div className="ai-experiment">
        <div className="ai-experiment-mark">驗</div>
        <div>
          <span>다음에 검증할 가설</span>
          <h4>{report.experiment.hypothesis}</h4>
          <p>{report.experiment.test}</p>
          <EvidenceList evidence={report.experiment.evidence} />
        </div>
      </div>

      {report.questions.length > 0 && (
        <section className="ai-questions">
          <span>대화를 깊게 할 질문</span>
          {report.questions.map((question, index) => <p key={index}>{question}</p>)}
        </section>
      )}

      <footer>
        <b>판단의 한계</b>
        <p>{report.limits}</p>
        <small>{report.model ? `${report.model} · ` : ""}AI의 해석은 기록에 기반한 가설이며 정답이나 진단이 아닙니다.</small>
      </footer>
    </section>
  );
}

function DraftToggle({ item, checked, onChange }) {
  return (
    <label className={`ai-draft-item ${checked ? "selected" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <b>{item.kind === "routine" ? "루틴" : "프로젝트"} · {DOMAIN_MAP[item.domainKey] || "미분류"}</b>
        <strong>{item.title}</strong>
        <small>{item.doneDefinition}</small>
      </span>
    </label>
  );
}

function GoalDraftView({ draft, activeSeason, onChange, onApply, applying, onClear }) {
  const setSeason = (selected) => onChange({ ...draft, season: { ...draft.season, selected } });
  const setItem = (group, id, selected) => onChange({
    ...draft,
    [group]: draft[group].map((item) => item.id === id ? { ...item, selected } : item),
  });
  const selectedCount = [...draft.projects, ...draft.routines].filter((item) => item.selected).length;

  return (
    <section className="ai-draft" aria-live="polite">
      <header>
        <div>
          <span className="ai-report-kicker">Kimi 목표 구조 초안</span>
          <h3>{draft.northStar}</h3>
        </div>
        <button type="button" className="text-action" onClick={onClear}>닫기</button>
      </header>

      <div className="ai-draft-note">
        <span>오늘의 첫 10분</span>
        <strong>{draft.firstStep}</strong>
      </div>

      <label className={`ai-season-draft ${draft.season.selected ? "selected" : ""}`}>
        <input type="checkbox" checked={draft.season.selected} onChange={(event) => setSeason(event.target.checked)} />
        <div>
          <span>12주 시즌 초안{activeSeason ? " · 선택하면 현재 시즌을 수정합니다" : ""}</span>
          <h4>{draft.season.title}</h4>
          <p>{draft.season.outcomes.map((outcome) => `• ${outcome}`).join("\n")}</p>
          {draft.season.notDoing && <small>하지 않을 것 · {draft.season.notDoing}</small>}
        </div>
      </label>

      <div className="ai-draft-grid">
        {draft.projects.map((item) => (
          <DraftToggle key={item.id} item={item} checked={item.selected} onChange={(selected) => setItem("projects", item.id, selected)} />
        ))}
        {draft.routines.map((item) => (
          <DraftToggle key={item.id} item={item} checked={item.selected} onChange={(selected) => setItem("routines", item.id, selected)} />
        ))}
      </div>

      {draft.caution && <div className="ai-caution"><b>계획 과잉 방지</b><p>{draft.caution}</p></div>}

      <div className="ai-apply-row">
        <p>체크한 항목만 들어갑니다. AI가 직접 수정하거나 자동 등록하지 않습니다.</p>
        <button type="button" className="btn-primary" onClick={onApply} disabled={applying || (!draft.season.selected && selectedCount === 0)}>
          {applying ? "등록 중…" : `선택한 초안 등록 · ${selectedCount + (draft.season.selected ? 1 : 0)}개`}
        </button>
      </div>
    </section>
  );
}

export default function AIAdvisor({ state, me, otherName, onApplyDraft, onToast, initialMode }) {
  const savedBigGoal = state.bigGoals.find((goal) => goal.owner === me)?.text || "";
  const activeSeason = state.seasons.find((season) => season.owner === me && season.status === "active") || null;
  const myDecisions = state.decisions.filter((decision) => decision.owner === me).slice().reverse();
  const startMode = MODES.some((m) => m.key === initialMode) ? initialMode : "weekly";
  const [mode, setMode] = useState(startMode);
  const [scopes, setScopes] = useState(DEFAULT_SCOPES[startMode]);
  const [objective, setObjective] = useState(savedBigGoal);
  const [decisionId, setDecisionId] = useState(myDecisions[0]?.id || "");
  const [pin, setPin] = useState(() => sessionStorage.getItem("sg_ai_pin") || "");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState(null);

  const currentMode = MODES.find((item) => item.key === mode);
  const scopeLabels = useMemo(
    () => SCOPES.filter(([key]) => scopes.includes(key)).map(([, label]) => label),
    [scopes]
  );

  const changeMode = (next) => {
    setMode(next);
    setScopes(DEFAULT_SCOPES[next]);
    setReport(null);
    setDraft(null);
    setError("");
  };

  const toggleScope = (key) => {
    setScopes((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const generate = async () => {
    if (mode === "goal_architect" && !objective.trim()) {
      setError("설계할 가장 큰 목표를 적어주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    setDraft(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: mode, name: me, pin, scopes, objective, decisionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "ai_pin") setShowPin(true);
        throw new Error(data.message || data.error || "Kimi 요청에 실패했어요.");
      }
      if (pin) sessionStorage.setItem("sg_ai_pin", pin);
      if (mode === "goal_architect") setDraft(data.result);
      else setReport(data.result);
      setMeta(data.meta);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const applyDraft = async () => {
    if (!draft) return;
    if (draft.season.selected && activeSeason) {
      const ok = window.confirm(`현재 시즌 "${activeSeason.title}"을 AI 초안으로 수정할까요? 체크한 프로젝트와 루틴도 함께 추가됩니다.`);
      if (!ok) return;
    }
    setApplying(true);
    const ok = await onApplyDraft({
      ...draft,
      seasonId: activeSeason?.id || "",
    });
    setApplying(false);
    if (ok) {
      onToast("선택한 목표 구조를 12주 시즌에 반영했어요.");
      setDraft(null);
    }
  };

  return (
    <div className="life-surface ai-surface">
      <header className="life-hero ai-hero">
        <div>
          <p className="life-kicker">답을 대신 내리지 않는 기록 기반 참모</p>
          <h2>Kimi 인생 참모</h2>
          <p>말과 행동 사이의 패턴을 근거와 함께 보고, 다음 선택을 작게 검증합니다.</p>
        </div>
        <div className="life-hero-mark">參</div>
      </header>

      <section className="ai-principles">
        <span>AI 운영 원칙</span>
        <p>읽고 제안만 함</p>
        <p>근거 없는 판단 차단</p>
        <p>자동 수정 없음</p>
        <p>진단·낙인 금지</p>
      </section>

      <div className="ai-layout">
        <aside className="ai-mode-list" aria-label="AI 참모 기능">
          {MODES.map((item) => (
            <button type="button" key={item.key} className={mode === item.key ? "selected" : ""} onClick={() => changeMode(item.key)}>
              <span>{item.mark}</span>
              <div><strong>{item.label}</strong><small>{item.hint}</small></div>
            </button>
          ))}
        </aside>

        <section className="life-paper ai-workbench">
          <div className="life-section-head">
            <div><span>{currentMode.mark}</span><h3>{currentMode.label}</h3></div>
            {meta && <p>이번 호출 후 오늘 {meta.remaining}회 남음</p>}
          </div>

          {mode === "goal_architect" && (
            <label className="ai-objective">
              <span>설계할 가장 큰 목표</span>
              <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} maxLength={500} placeholder="예: 경제적으로 선택권이 있는 사람이 되기" />
            </label>
          )}

          {mode === "decision" && (
            <label className="ai-decision-select">
              <span>함께 검토할 결정</span>
              <select value={decisionId} onChange={(event) => setDecisionId(event.target.value)}>
                <option value="">최근 결정 전체의 판단 패턴</option>
                {myDecisions.map((decision) => <option key={decision.id} value={decision.id}>{decision.title}</option>)}
              </select>
            </label>
          )}

          <div className="ai-data-control">
            <div>
              <span>이번 분석에 보낼 내 기록</span>
              <small>체크를 끄면 해당 종류는 Kimi에게 전송하지 않습니다.</small>
            </div>
            <div className="ai-scope-grid">
              {SCOPES.map(([key, label]) => (
                <label key={key} className={scopes.includes(key) ? "selected" : ""}>
                  <input type="checkbox" checked={scopes.includes(key)} onChange={() => toggleScope(key)} />
                  {label}
                </label>
              ))}
            </div>
            <p>전송 범위 · {scopeLabels.join(" · ") || "선택 없음"}</p>
            {mode === "meeting" && <p className="ai-shared-note">회의 진행에서 친구 데이터는 이미 서로에게 공개된 최근 주간 복기만 사용합니다.</p>}
          </div>

          {showPin && (
            <label className="ai-pin-field">
              <span>AI 잠금 PIN</span>
              <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="off" placeholder="Vercel에 설정한 AI_ACCESS_PIN" />
            </label>
          )}

          {error && <div className="ai-error">{error}</div>}

          {!report && !draft && (
            <div className="ai-generate-row">
              <div>
                <b>AI는 선택한 기록의 요약본만 읽습니다.</b>
                <p>결과에는 실제 근거 기록이 함께 표시되고, 근거를 확인할 수 없는 판단은 숨겨집니다.</p>
              </div>
              <button type="button" className="btn-primary ai-generate" onClick={generate} disabled={loading || scopes.length === 0}>
                {loading ? <><span className="ai-spinner" /> Kimi가 기록을 읽는 중…</> : `${currentMode.label} 시작`}
              </button>
            </div>
          )}
        </section>
      </div>

      {report && <ReportView report={report} onClear={() => setReport(null)} />}
      {draft && (
        <GoalDraftView
          draft={draft}
          activeSeason={activeSeason}
          onChange={setDraft}
          onApply={applyDraft}
          applying={applying}
          onClear={() => setDraft(null)}
        />
      )}

      <section className="ai-privacy-foot">
        <div><span>私</span><div><strong>친구 기록과 섞이지 않습니다</strong><p>개인 보고서는 내 기록만 분석합니다. 공동 회의는 이미 공유된 복기만 별도로 사용합니다.</p></div></div>
        <div><span>證</span><div><strong>모든 해석에 출처가 있습니다</strong><p>날짜와 기록 원문을 펼쳐볼 수 없는 문장은 분석 결과로 인정하지 않습니다.</p></div></div>
        <div><span>人</span><div><strong>마지막 결정은 사람이 합니다</strong><p>목표 초안도 사용자가 체크하고 확인해야만 시스템에 들어갑니다.</p></div></div>
      </section>
    </div>
  );
}
