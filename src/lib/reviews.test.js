import { describe, expect, it } from "vitest";
import { pastWeeklyReviews } from "./reviews.js";

describe("지난 주간 복기", () => {
  it("선택한 사용자의 지난 기록만 최신 주차순으로 돌려준다", () => {
    const reviews = [
      { id: "a", owner: "햄", weekStart: "2026-07-13" },
      { id: "b", owner: "쥐", weekStart: "2026-07-20" },
      { id: "c", owner: "햄", weekStart: "2026-07-27" },
      { id: "d", owner: "햄", weekStart: "2026-08-03" },
    ];

    expect(pastWeeklyReviews(reviews, "햄", "2026-08-03").map((review) => review.id))
      .toEqual(["c", "a"]);
  });
});
