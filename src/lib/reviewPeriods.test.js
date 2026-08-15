import { describe, expect, it } from "vitest";
import { FIVE_DAY_REVIEW_ANCHOR, fiveDayReviewPeriod, reviewPeriodOf } from "./reviewPeriods.js";

describe("5일 인생 회의 기간", () => {
  it("2026-08-17을 첫 기간으로 5일씩 이동한다", () => {
    expect(fiveDayReviewPeriod(FIVE_DAY_REVIEW_ANCHOR)).toMatchObject({
      start: "2026-08-17",
      end: "2026-08-21",
      days: ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"],
      beforeAnchor: false,
    });
    expect(fiveDayReviewPeriod("2026-08-22").start).toBe("2026-08-22");
    expect(fiveDayReviewPeriod("2026-08-26").start).toBe("2026-08-22");
    expect(fiveDayReviewPeriod("2026-08-27").start).toBe("2026-08-27");
  });

  it("기준일 전에는 첫 회의 기간을 준비 상태로 가리킨다", () => {
    expect(fiveDayReviewPeriod("2026-08-15")).toMatchObject({ start: FIVE_DAY_REVIEW_ANCHOR, beforeAnchor: true });
  });

  it("기존 7일 기록과 새 5일 기록의 끝 날짜를 구분한다", () => {
    expect(reviewPeriodOf({ weekStart: "2026-08-10" }).end).toBe("2026-08-16");
    expect(reviewPeriodOf({ weekStart: "2026-08-17", periodDays: 5 }).end).toBe("2026-08-21");
  });
});
