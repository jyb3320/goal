import { describe, expect, it } from "vitest";
import { formatDeadline, isGoalDueOn, repeatLabel, weekProgress } from "./goals.js";

describe("반복 일정", () => {
  it("특정 요일에만 오늘 목표로 노출한다", () => {
    const goal = { status: "active", repeatType: "weekdays", repeatDays: [2, 5], startDate: "2026-07-01" };
    expect(isGoalDueOn(goal, "2026-07-31")).toBe(true); // 금
    expect(isGoalDueOn(goal, "2026-07-30")).toBe(false); // 목
    expect(repeatLabel(goal)).toBe("화·금 반복");
  });

  it("주 N회 진행률을 계산한다", () => {
    const goal = { id: "g1", repeatType: "weekly", repeatCount: 2 };
    const checkins = [{ goalId: "g1", date: "2026-07-28" }];
    expect(weekProgress(goal, checkins, "2026-07-31")).toMatchObject({ count: 1, target: 2, pct: 50 });
  });

  it("특정 요일의 주간 총 계획량을 계산한다", () => {
    const goal = { id: "g1", repeatType: "weekdays", repeatDays: [2, 5], startDate: "2026-07-31" };
    const checkins = [{ goalId: "g1", date: "2026-07-31" }];
    expect(weekProgress(goal, checkins, "2026-07-31")).toMatchObject({ count: 1, target: 2, pct: 50 });
  });

  it("마감일을 한국어로 표시한다", () => {
    expect(formatDeadline("2026-08-05")).toBe("8월 5일까지");
    expect(formatDeadline("")).toBe("기한 없음");
  });
});
