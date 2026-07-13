import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  todayStr,
  weekDates,
  computeStreak,
  ddayLabel,
} from "./dates.js";

// 2026-07-03은 금요일
describe("dates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("todayStr는 로컬 날짜 기준", () => {
    expect(todayStr(0)).toBe("2026-07-03");
    expect(todayStr(-1)).toBe("2026-07-02");
  });

  it("자정 직후에도 전날로 밀리지 않음 (toISOString 버그 재발 방지)", () => {
    vi.setSystemTime(new Date("2026-07-03T00:30:00"));
    expect(todayStr(0)).toBe("2026-07-03");
  });

  it("weekDates는 월요일 시작 7일", () => {
    const w = weekDates(0);
    expect(w).toHaveLength(7);
    expect(w[0]).toBe("2026-06-29"); // 월
    expect(w[6]).toBe("2026-07-05"); // 일
    expect(weekDates(-1)[0]).toBe("2026-06-22");
  });

  it("computeStreak: 오늘 포함 연속", () => {
    const set = new Set(["g_2026-07-03", "g_2026-07-02", "g_2026-07-01"]);
    expect(computeStreak("g", set)).toBe(3);
  });

  it("computeStreak: 오늘 아직 안 찍었으면 어제까지로 계산", () => {
    const set = new Set(["g_2026-07-02", "g_2026-07-01"]);
    expect(computeStreak("g", set)).toBe(2);
  });

  it("computeStreak: 어제 끊겼으면 0", () => {
    expect(computeStreak("g", new Set(["g_2026-07-01"]))).toBe(0);
  });

  it("ddayLabel", () => {
    expect(ddayLabel("2026-07-06")).toBe("D-3");
    expect(ddayLabel("2026-07-03")).toBe("D-DAY");
    expect(ddayLabel("2026-07-01")).toBe("마감 +2일");
    expect(ddayLabel("")).toBe(null);
  });
});
