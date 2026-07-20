export default function WeekSummary({ summary }) {
  if (!summary.theirs) return null;
  return (
    <div className="week-summary">
      <div className="week-summary-head">
        <span className="ws-title">이번 주 실행 요약</span>
        {summary.verdict && <span className="ws-verdict">{summary.verdict}</span>}
      </div>
      <div className="ws-rows">
        {[summary.mine, summary.theirs].map((s) => (
          <div className="ws-row" key={s.user}>
            <span className="ws-name">{s.user}</span>
            <div className="ws-bar">
              <div
                className="ws-bar-fill"
                style={{ width: `${s.rate !== null ? Math.round(s.rate * 100) : 0}%` }}
              />
            </div>
            <span className="ws-stat">
              {s.rate !== null
                ? `${Math.round(s.rate * 100)}% · ${s.completed} / ${s.total} 목표`
                : "집계할 목표 없음"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
