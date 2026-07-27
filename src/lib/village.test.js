import { describe, expect, it } from "vitest";
import { buildVillageStatus } from "./village.js";

function state(overrides = {}) {
  return {
    goals: [],
    checkins: [],
    progress: [],
    reactions: [],
    messages: [],
    pokes: [],
    goalMemos: [],
    weeklyReviews: [],
    monthlyReviews: [],
    excuses: [],
    archive: {},
    ...overrides,
  };
}

describe("buildVillageStatus", () => {
  it("두 사용자의 오늘 활동과 공동 기록을 기존 도장에서 계산한다", () => {
    const data = state({
      goals: [
        { id: "a", owner: "햄", type: "daily", title: "걷기" },
        { id: "b", owner: "쥐", type: "daily", title: "독서" },
      ],
      checkins: [
        { goalId: "a", date: "2026-07-27" },
        { goalId: "b", date: "2026-07-27" },
      ],
    });
    const result = buildVillageStatus(data, "햄", "쥐", "2026-07-27");
    expect(result.mine.doneToday).toBe(1);
    expect(result.friend.doneToday).toBe(1);
    expect(result.bothActiveToday).toBe(true);
    expect(result.bothActiveDays).toBe(1);
  });

  it("목표 메모와 받은 소식으로 씨앗·우체통 상태를 만든다", () => {
    const data = state({
      goals: [{ id: "a", owner: "햄", type: "daily", title: "걷기" }],
      goalMemos: [
        { id: "m1", owner: "햄", text: "수영 배우기" },
        { id: "m2", owner: "햄", text: "책 쓰기" },
        { id: "m3", owner: "햄", text: "여행 준비" },
      ],
      reactions: [{ goalId: "a", date: "2026-07-27", emoji: "🔥", by: "쥐" }],
      messages: [{ id: "x", from: "쥐", text: "오늘도 가자", createdAt: "2026-07-27T02:00:00Z" }],
    });
    const result = buildVillageStatus(data, "햄", "쥐", "2026-07-27");
    expect(result.seedStage).toBe(2);
    expect(result.mailbox.total).toBe(2);
    expect(result.mailbox.events.map((event) => event.type).sort()).toEqual(["응원", "쪽지"]);
  });
});
