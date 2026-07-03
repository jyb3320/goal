import { todayStr, lastNSet } from "../lib/dates.js";
import { burst, vibrate } from "../lib/fx.js";

export const REACTIONS = [
  { emoji: "🔥", label: "응원" },
  { emoji: "👏", label: "대박" },
  { emoji: "💪", label: "파이팅" },
];

export default function Reactions({ goal, isMine, reactions, me, onToggle }) {
  const last7 = lastNSet(7);
  const today = todayStr(0);
  return (
    <div className="reactions">
      {REACTIONS.map((r) => {
        // 최근 7일 응원을 모아서 보여줌 (어제 받은 🔥도 안 사라짐)
        const recent = reactions.filter(
          (x) => x.goalId === goal.id && x.emoji === r.emoji && last7.has(x.date)
        );
        const activeByMe = recent.some((x) => x.date === today && x.by === me);
        if (isMine && recent.length === 0) return null;
        return (
          <button
            key={r.emoji}
            type="button"
            className={`reaction-chip ${activeByMe ? "active" : ""}`}
            onClick={(e) => {
              if (isMine) return;
              if (!activeByMe) {
                const rect = e.currentTarget.getBoundingClientRect();
                burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 10);
                vibrate(10);
              }
              onToggle(goal.id, r.emoji);
            }}
            disabled={isMine}
            title={isMine ? "최근 7일간 받은 응원" : `${r.label} (최근 7일 합계)`}
          >
            {r.emoji} {recent.length > 0 && <span className="count">{recent.length}</span>}
          </button>
        );
      })}
    </div>
  );
}
