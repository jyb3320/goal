import { useMemo } from "react";
import { skyPhase, villageGreeting } from "../lib/sky.js";

// 오늘 화면의 첫 장면. 배경 마을(VillageBackdrop) 위에 그대로 얹힌다 —
// 더 이상 자기 캔버스도, 자기 상자도 갖지 않는다.
// 화면에서 압도적으로 큰 것 하나를 만든다: 오늘 찍은 도장 수.
export default function VillageHero({
  me,
  otherName,
  done,
  total,
  perfect,
  level,
  xpPct,
  xpLeft,
  treeCount,
  friendActiveToday,
  onEnterVillage,
}) {
  const phase = useMemo(() => skyPhase(), []);
  const greeting = villageGreeting(phase, { done, total, perfect });

  return (
    <section className={`village-hero phase-${phase.key}`} aria-label="오늘의 마을">
      <p className="vh-hi">{greeting.hi}</p>

      <div className="vh-figure" aria-label={`오늘 ${total}개 중 ${done}개 완료`}>
        <strong className={`vh-big${perfect ? " perfect" : ""}`}>{done}</strong>
        <span className="vh-of">/{total}</span>
      </div>

      <h2 className="vh-line">{greeting.line}</h2>

      <div className="vh-foot">
        <button type="button" className="vh-enter" onClick={onEnterVillage}>
          <span className="vh-lv">Lv.{level}</span>
          <span className="vh-xp">
            <span className="vh-xp-fill" style={{ width: `${xpPct}%` }} />
          </span>
          <span className="vh-enter-label">마을 들어가기 →</span>
        </button>
        <p className="vh-sub">
          다음 레벨까지 {xpLeft} XP
          {otherName ? ` · ${otherName} ${friendActiveToday ? "오늘 함께 있어요" : "아직 조용해요"}` : ""}
        </p>
      </div>
    </section>
  );
}
