import { describe, expect, it } from "vitest";
import { calendarItemsForDate, calendarMonthCells } from "./calendar.js";

describe("shared calendar", () => {
  it("builds a fixed Sunday-first six-week month grid", () => {
    const cells = calendarMonthCells(2026, 7);
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe("2026-07-26");
    expect(cells[6].date).toBe("2026-08-01");
  });

  it("shows only manually registered events for the selected date", () => {
    const events = [
      { id: "all-day", owner: "햄", title: "병원", date: "2026-08-05", allDay: true },
      { id: "dinner", owner: "쥐", title: "저녁 약속", date: "2026-08-05", allDay: false, startTime: "19:00" },
      { id: "other", owner: "햄", title: "다른 날", date: "2026-08-06", allDay: true },
    ];
    expect(calendarItemsForDate(events, "2026-08-05").map((item) => item.id)).toEqual(["all-day", "dinner"]);
  });

  it("sorts all-day events before timed events and timed events chronologically", () => {
    const events = [
      { id: "late", title: "저녁", date: "2026-08-05", allDay: false, startTime: "19:00" },
      { id: "early", title: "아침", date: "2026-08-05", allDay: false, startTime: "08:00" },
      { id: "all", title: "종일", date: "2026-08-05", allDay: true },
    ];
    expect(calendarItemsForDate(events, "2026-08-05").map((item) => item.id)).toEqual(["all", "early", "late"]);
  });
});
