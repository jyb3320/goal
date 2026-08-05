import { describe, expect, it } from "vitest";
import { calendarItemsForDate, calendarMonthCells } from "./calendar.js";

describe("shared calendar", () => {
  it("builds a fixed Sunday-first six-week month grid", () => {
    const cells = calendarMonthCells(2026, 7);
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe("2026-07-26");
    expect(cells[6].date).toBe("2026-08-01");
  });

  it("shows each owner's dated, repeating, deadline and subtask schedule", () => {
    const goals = [
      { id: "daily", owner: "햄", title: "운동", kind: "routine", repeatType: "weekdays", repeatDays: [3], startDate: "2026-08-01", status: "active" },
      { id: "mile", owner: "콩", title: "원고 제출", kind: "milestone", deadline: "2026-08-05", status: "active" },
      { id: "project", owner: "햄", title: "웹사이트", kind: "project", status: "active", subtasks: [{ id: "task", title: "QA", deadline: "2026-08-05" }] },
      { id: "once", owner: "콩", title: "서점 방문", kind: "routine", repeatType: "none", startDate: "2026-08-05", status: "active" },
    ];
    const items = calendarItemsForDate(goals, "2026-08-05", [{ goalId: "daily", date: "2026-08-05" }]);
    expect(items.map((item) => item.title)).toEqual(expect.arrayContaining(["원고 제출", "QA", "운동", "서점 방문"]));
    expect(items).toHaveLength(4);
    expect(items.find((item) => item.goalId === "daily")?.done).toBe(true);
    expect(items.find((item) => item.goalId === "mile")?.deadline).toBe(true);
  });

  it("does not show paused routines", () => {
    const items = calendarItemsForDate([
      { id: "paused", owner: "햄", title: "잠시 쉼", kind: "routine", repeatType: "daily", status: "paused" },
    ], "2026-08-05");
    expect(items).toEqual([]);
  });
});
