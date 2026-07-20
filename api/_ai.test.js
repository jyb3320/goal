import { describe, expect, it } from "vitest";
import { buildEvidenceBundle, validateGoalDraft, validateReport } from "./_ai.js";
import { normalize, seoulToday, shiftDate } from "./_logic.js";

function sampleState() {
  const today = seoulToday();
  return normalize({
    users: ["햄", "쥐"],
    bigGoals: [
      { owner: "햄", text: "경제적으로 선택권이 있는 사람이 되기", updatedAt: `${today}T10:00:00.000Z` },
      { owner: "쥐", text: "친구의 비공개 목표", updatedAt: `${today}T10:00:00.000Z` },
    ],
    goals: [
      { id: "g1", owner: "햄", title: "운동", type: "daily", createdAt: shiftDate(today, -5), domainKey: "health" },
      { id: "g2", owner: "쥐", title: "친구 운동", type: "daily", createdAt: shiftDate(today, -5) },
    ],
    checkins: [
      { goalId: "g1", date: today },
      { goalId: "g1", date: shiftDate(today, -2) },
      { goalId: "g2", date: today },
    ],
    weeklyReviews: [
      { id: "w1", owner: "햄", weekStart: shiftDate(today, -5), facts: "운동을 두 번 했다", avoidance: "포트폴리오는 미뤘다" },
      { id: "w2", owner: "쥐", weekStart: shiftDate(today, -5), facts: "친구의 기록" },
    ],
  });
}

describe("AI evidence bundle", () => {
  it("개인 보고서에는 본인 기록만 포함한다", () => {
    const bundle = buildEvidenceBundle(sampleState(), "햄", { task: "weekly" });
    expect(bundle.evidence.length).toBeGreaterThan(0);
    expect(bundle.evidence.every((item) => item.owner === "햄")).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("친구의 비공개 목표");
    expect(JSON.stringify(bundle)).not.toContain("친구 운동");
  });

  it("사용자가 제외한 종류는 전송하지 않는다", () => {
    const bundle = buildEvidenceBundle(sampleState(), "햄", {
      task: "weekly",
      scopes: ["activity"],
    });
    expect(bundle.evidence.every((item) => ["activity", "excuse"].includes(item.kind))).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("경제적으로 선택권");
    expect(JSON.stringify(bundle)).not.toContain("포트폴리오");
  });

  it("빈 범위를 명시하면 어떤 기록도 전송하지 않는다", () => {
    const bundle = buildEvidenceBundle(sampleState(), "햄", {
      task: "weekly",
      scopes: [],
    });
    expect(bundle.evidence).toHaveLength(0);
  });

  it("회의 모드에서만 친구의 공유 주간 복기를 포함한다", () => {
    const bundle = buildEvidenceBundle(sampleState(), "햄", {
      task: "meeting",
      scopes: ["reviews"],
      friendName: "쥐",
    });
    expect(bundle.evidence.some((item) => item.kind === "sharedWeeklyReview" && item.owner === "쥐")).toBe(true);
  });
});

describe("AI output validation", () => {
  it("존재하지 않는 근거를 인용한 판단을 노출하지 않는다", () => {
    const bundle = buildEvidenceBundle(sampleState(), "햄", { task: "weekly" });
    const result = validateReport({
      title: "보고서",
      sections: [{ title: "가짜 판단", text: "7월 18일에 세 번 실패했다", evidenceIds: ["made-up-id"] }],
      experiment: { hypothesis: "가설", test: "실험", evidenceIds: ["made-up-id"] },
      questions: [],
    }, bundle);
    expect(result.sections[0].text).toContain("판단을 보류");
    expect(result.sections[0].evidence).toHaveLength(0);
    expect(result.experiment.hypothesis).toContain("충분하지");
  });

  it("목표 초안의 개수와 영역을 제한한다", () => {
    const draft = validateGoalDraft({
      northStar: "선택권",
      domainKeys: ["money", "unknown", "work"],
      season: { title: "12주", outcomes: ["하나", "둘", "셋"] },
      projects: Array.from({ length: 5 }, (_, index) => ({
        title: `프로젝트 ${index}`,
        domainKey: index === 0 ? "unknown" : "work",
      })),
      routines: [],
    });
    expect(draft.domainKeys).toEqual(["money", "work"]);
    expect(draft.season.outcomes).toHaveLength(2);
    expect(draft.projects).toHaveLength(3);
    expect(draft.projects[0].domainKey).toBe("work");
  });
});
