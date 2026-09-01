import { describe, expect, it } from "vitest";
import { selectTodayCommitments } from "./TodayCommitments.jsx";

const TODAY = "2026-09-01";

function goal(id, overrides = {}) {
  return {
    id,
    owner: "햄",
    title: id,
    type: "daily",
    status: "active",
    repeatType: "daily",
    executionTime: "09:00",
    showOnBoard: true,
    ...overrides,
  };
}

describe("오늘의 실행 약속", () => {
  it("현재 사용자의 오늘 수행 대상만 시간순으로 고른다", () => {
    const goals = [
      goal("저녁 운동", { executionTime: "19:30" }),
      goal("아침 독서", { executionTime: "07:10" }),
      goal("친구 목표", { owner: "쥐", executionTime: "06:00" }),
      goal("내일 목표", { repeatType: "none", scheduledDate: "2026-09-02", executionTime: "08:00" }),
      goal("일시정지", { status: "paused", executionTime: "10:00" }),
    ];

    expect(selectTodayCommitments({ goals, checkins: [], me: "햄", today: TODAY }).map((item) => item.goal.id))
      .toEqual(["아침 독서", "저녁 운동"]);
  });

  it("완료와 최소 달성 상태를 오늘 체크인에서 구분한다", () => {
    const goals = [goal("일반 완료", { executionTime: "08:00" }), goal("최소 완료", { executionTime: "09:00" })];
    const checkins = [
      { goalId: "일반 완료", date: TODAY, completedAt: "2026-09-01T00:00:00.000Z" },
      { goalId: "최소 완료", date: TODAY, min: true, completedAt: "2026-09-01T01:00:00.000Z" },
      { goalId: "일반 완료", date: "2026-08-31", min: true },
    ];

    const selected = selectTodayCommitments({ goals, checkins, me: "햄", today: TODAY });
    expect(selected[0]).toMatchObject({ completed: true, minimum: false });
    expect(selected[1]).toMatchObject({ completed: true, minimum: true });
  });

  it("executionTime이 없는 목표는 오류 없이 제외한다", () => {
    const goals = [goal("시간 없음", { executionTime: "" }), goal("필드 없음", { executionTime: undefined })];
    expect(() => selectTodayCommitments({ goals, checkins: [], me: "햄", today: TODAY })).not.toThrow();
    expect(selectTodayCommitments({ goals, checkins: [], me: "햄", today: TODAY })).toEqual([]);
  });
});
