import { describe, it, expect } from "vitest";
import {
  handlePost,
  normalize,
  compact,
  seoulToday,
  shiftDate,
  countMissedToday,
  countTodayGoals,
  seoulWeekDates,
} from "./_logic.js";

// Redis 대신 인메모리로 handlePost를 돌리는 테스트용 보드
function freshBoard() {
  let raw = null;
  return {
    post(body) {
      const out = handlePost(raw, body);
      if (out.write) raw = out.state;
      return out;
    },
  };
}

function twoUsers() {
  const b = freshBoard();
  b.post({ action: "join", name: "햄" });
  b.post({ action: "join", name: "쥐" });
  const goal = b.post({ action: "addGoal", name: "햄", goal: { title: "달리기" } }).respond.goals[0];
  return { b, goal };
}

describe("접속 (이름만, 비밀번호 없음)", () => {
  it("join으로 자리 차지, 2명 제한", () => {
    const b = freshBoard();
    expect(b.post({ action: "join", name: "햄" }).status).toBe(200);
    expect(b.post({ action: "join", name: "쥐" }).status).toBe(200);
    const r3 = b.post({ action: "join", name: "셋째" });
    expect(r3.status).toBe(403);
    expect(r3.respond.error).toBe("full");
  });

  it("이미 쓰는 이름으로 재접속하면 그대로 통과", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    expect(b.post({ action: "join", name: "햄" }).status).toBe(200);
  });

  it("등록 안 된 이름으로는 어떤 액션도 불가", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    const r = b.post({ action: "addGoal", name: "모르는사람", goal: { title: "달리기" } });
    expect(r.status).toBe(401);
  });

  it("응답에 푸시 구독이 새지 않음", () => {
    const b = freshBoard();
    const r = b.post({ action: "join", name: "햄" });
    expect(r.respond.push).toBeUndefined();
  });
});

describe("AI 목표 초안 승인 등록", () => {
  it("사용자가 선택한 시즌과 항목만 등록한다", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    const result = b.post({
      action: "applyAiGoalDraft",
      name: "햄",
      draft: {
        season: {
          selected: true,
          title: "선택권을 만드는 12주",
          outcomes: ["비상금 300만 원 만들기"],
          focusAreas: "돈",
        },
        projects: [
          { selected: true, kind: "project", title: "월 지출 구조 파악", domainKey: "money", doneDefinition: "3개월 지출 정리" },
          { selected: false, kind: "project", title: "등록하면 안 됨", domainKey: "work" },
        ],
        routines: [
          { selected: true, kind: "routine", title: "일요일 지출 검토", domainKey: "money", doneDefinition: "매주 20분" },
        ],
      },
    });
    expect(result.status).toBe(200);
    expect(result.respond.seasons).toHaveLength(1);
    expect(result.respond.lifeItems.map((item) => item.title)).toEqual([
      "월 지출 구조 파악",
      "일요일 지출 검토",
    ]);
    expect(result.respond.lifeItems.every((item) => item.seasonId === result.respond.seasons[0].id)).toBe(true);
  });
});

describe("소유권과 날짜 검증", () => {
  it("남의 목표에 도장 불가", () => {
    const { b, goal } = twoUsers();
    const r = b.post({
      action: "toggleCheckin", name: "쥐", goalId: goal.id, date: seoulToday(),
    });
    expect(r.status).toBe(403);
  });

  it("오늘/어제 도장만 허용 (소급 조작 차단)", () => {
    const { b, goal } = twoUsers();
    const old = b.post({
      action: "toggleCheckin", name: "햄", goalId: goal.id, date: shiftDate(seoulToday(), -5),
    });
    expect(old.status).toBe(400);
    const ok = b.post({
      action: "toggleCheckin", name: "햄", goalId: goal.id, date: seoulToday(),
    });
    expect(ok.status).toBe(200);
    expect(ok.respond.checkins).toHaveLength(1);
  });

  it("남의 목표 삭제 불가", () => {
    const { b, goal } = twoUsers();
    expect(b.post({ action: "deleteGoal", name: "쥐", goalId: goal.id }).status).toBe(403);
  });

  it("자기 목표에 응원 불가, 친구는 가능 (by는 서버가 강제)", () => {
    const { b, goal } = twoUsers();
    expect(
      b.post({ action: "toggleReaction", name: "햄", goalId: goal.id, emoji: "🔥" }).status
    ).toBe(403);
    const r = b.post({
      action: "toggleReaction", name: "쥐", goalId: goal.id, emoji: "🔥", by: "햄",
    });
    expect(r.status).toBe(200);
    expect(r.respond.reactions[0].by).toBe("쥐");
  });

  it("메시지 발신자는 서버가 강제", () => {
    const { b } = twoUsers();
    const r = b.post({ action: "addMessage", name: "쥐", text: "화이팅", from: "햄" });
    expect(r.respond.messages[0].from).toBe("쥐");
  });
});

describe("컴팩션", () => {
  it("오래된 도장은 아카이브 집계로 (XP 보존)", () => {
    const today = seoulToday();
    const state = normalize({
      users: ["햄"],
      goals: [{ id: "g1", owner: "햄", title: "x", type: "daily" }],
      checkins: [
        { goalId: "g1", date: shiftDate(today, -500) },
        { goalId: "g1", date: today },
      ],
    });
    compact(state, today);
    expect(state.checkins).toHaveLength(1);
    expect(state.archive["햄"].stamps).toBe(1);
  });

  it("오래된 리액션 제거, 진행 기록은 목표당 한 건으로 합침", () => {
    const today = seoulToday();
    const state = normalize({
      reactions: [
        { goalId: "g", date: shiftDate(today, -20), emoji: "🔥", by: "쥐" },
        { goalId: "g", date: today, emoji: "🔥", by: "쥐" },
      ],
      progress: [
        { id: "p1", goalId: "g", date: shiftDate(today, -100), amount: 3 },
        { id: "p2", goalId: "g", date: shiftDate(today, -95), amount: 2 },
        { id: "p3", goalId: "g", date: today, amount: 1 },
      ],
    });
    compact(state, today);
    expect(state.reactions).toHaveLength(1);
    expect(state.progress).toHaveLength(2);
    const total = state.progress.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(6); // 합계는 유지
  });
});

describe("콕 찌르기", () => {
  it("친구가 있어야 찌를 수 있고, from은 서버가 강제", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    expect(b.post({ action: "poke", name: "햄" }).status).toBe(400); // 혼자면 불가
    b.post({ action: "join", name: "쥐" });
    const r = b.post({ action: "poke", name: "햄", from: "쥐" });
    expect(r.status).toBe(200);
    expect(r.respond.pokes).toHaveLength(1);
    expect(r.respond.pokes[0].from).toBe("햄");
  });

  it("무제한으로 찌를 수 있지만 최근 20개만 보관", () => {
    const { b } = twoUsers();
    for (let i = 0; i < 25; i++) b.post({ action: "poke", name: "쥐" });
    const r = b.post({ action: "poke", name: "쥐" });
    expect(r.respond.pokes.length).toBeLessThanOrEqual(20);
  });

  it("컴팩션이 그저께 이전 찌르기를 지움", () => {
    const today = seoulToday();
    const state = normalize({
      pokes: [
        { id: "k1", from: "쥐", date: shiftDate(today, -3) },
        { id: "k2", from: "쥐", date: today },
      ],
    });
    compact(state, today);
    expect(state.pokes).toHaveLength(1);
    expect(state.pokes[0].id).toBe("k2");
  });
});

describe("반성 노트 (못 찍은 이유)", () => {
  const yesterday = () => shiftDate(seoulToday(), -1);

  // addGoal은 createdAt을 오늘로 박아서, 과거에 만든 목표는 상태를 직접 주입해 만든다
  function boardWithOldGoal() {
    let raw = normalize({
      users: ["햄", "쥐"],
      goals: [{ id: "g1", owner: "햄", title: "달리기", type: "daily", createdAt: shiftDate(seoulToday(), -10) }],
    });
    return {
      post(body) {
        const o = handlePost(raw, body);
        if (o.write) raw = o.state;
        return o;
      },
    };
  }

  it("어제 못 찍은 매일 목표에 이유를 남김 (owner는 서버가 강제)", () => {
    const b = boardWithOldGoal();
    const r = b.post({ action: "addExcuse", name: "햄", goalId: "g1", text: "야근했음", owner: "쥐" });
    expect(r.status).toBe(200);
    expect(r.respond.excuses).toHaveLength(1);
    expect(r.respond.excuses[0].owner).toBe("햄");
    expect(r.respond.excuses[0].date).toBe(yesterday());
  });

  it("어제 도장을 찍었으면 이유를 남길 수 없음", () => {
    const b = boardWithOldGoal();
    b.post({ action: "toggleCheckin", name: "햄", goalId: "g1", date: yesterday() });
    const r = b.post({ action: "addExcuse", name: "햄", goalId: "g1", text: "야근" });
    expect(r.status).toBe(400);
  });

  it("남의 목표에는 불가, 오늘 만든 목표에도 불가", () => {
    const b = boardWithOldGoal();
    expect(b.post({ action: "addExcuse", name: "쥐", goalId: "g1", text: "x" }).status).toBe(403);
    const created = b.post({ action: "addGoal", name: "쥐", goal: { title: "새 목표" } });
    const newGoal = created.respond.goals.find((g) => g.owner === "쥐");
    expect(b.post({ action: "addExcuse", name: "쥐", goalId: newGoal.id, text: "x" }).status).toBe(400);
  });

  it("같은 목표·같은 날에 다시 쓰면 덮어씀", () => {
    const b = boardWithOldGoal();
    b.post({ action: "addExcuse", name: "햄", goalId: "g1", text: "야근" });
    const r = b.post({ action: "addExcuse", name: "햄", goalId: "g1", text: "사실 귀찮았음" });
    expect(r.respond.excuses).toHaveLength(1);
    expect(r.respond.excuses[0].text).toBe("사실 귀찮았음");
  });

  it("목표를 지우면 그 목표의 반성 노트도 사라짐", () => {
    const b = boardWithOldGoal();
    b.post({ action: "addExcuse", name: "햄", goalId: "g1", text: "야근" });
    const r = b.post({ action: "deleteGoal", name: "햄", goalId: "g1" });
    expect(r.respond.excuses).toHaveLength(0);
  });
});

describe("기간 목표 실패 기록", () => {
  function boardWithMilestone(overrides = {}, progress = []) {
    let raw = normalize({
      users: ["햄", "쥐"],
      goals: [
        {
          id: "m1",
          owner: "햄",
          title: "지원서 5개 제출",
          icon: "📘",
          type: "milestone",
          target: 5,
          unit: "개",
          createdAt: shiftDate(seoulToday(), -10),
          deadline: shiftDate(seoulToday(), -1),
          status: "active",
          ...overrides,
        },
      ],
      progress,
    });
    return {
      post(body) {
        const o = handlePost(raw, body);
        if (o.write) raw = o.state;
        return o;
      },
    };
  }

  it("마감일 다음 날 미달성 기간 목표에 실패 이유를 저장한다", () => {
    const b = boardWithMilestone({}, [{ id: "p1", goalId: "m1", date: seoulToday(), amount: 3 }]);
    const r = b.post({ action: "addFailureReason", name: "햄", goalId: "m1", text: "시간 배분을 못 했음" });
    const goal = r.respond.goals[0];
    expect(r.status).toBe(200);
    expect(goal.status).toBe("failed");
    expect(goal.failureReason).toBe("시간 배분을 못 했음");
    expect(goal.finalAmount).toBe(3);
    expect(goal.failedDate).toBe(seoulToday());
    expect(goal.expiredAt).toBe(seoulToday());
  });

  it("마감일 당일에는 실패 이유를 저장할 수 없다", () => {
    const b = boardWithMilestone({ deadline: seoulToday() });
    const r = b.post({ action: "addFailureReason", name: "햄", goalId: "m1", text: "아직 당일" });
    expect(r.status).toBe(400);
  });

  it("이미 달성한 기간 목표는 실패 처리하지 않는다", () => {
    const b = boardWithMilestone({}, [{ id: "p1", goalId: "m1", date: seoulToday(), amount: 5 }]);
    const r = b.post({ action: "addFailureReason", name: "햄", goalId: "m1", text: "x" });
    expect(r.status).toBe(400);
    expect(r.respond.error).toBe("이미 달성한 목표예요");
  });

  it("실패 기록이 끝난 기간 목표에는 진행 수량을 추가할 수 없다", () => {
    const b = boardWithMilestone({ status: "failed", failureReason: "못 함" });
    const r = b.post({ action: "addProgress", name: "햄", goalId: "m1", amount: 1 });
    expect(r.status).toBe(400);
  });
});

describe("메모장", () => {
  function memoBoard() {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    b.post({ action: "join", name: "쥐" });
    return b;
  }

  it("메모를 추가/수정/삭제할 수 있고 owner는 서버가 강제", () => {
    const b = memoBoard();
    const added = b.post({
      action: "addGoalMemo",
      name: "햄",
      memo: { text: "다음 달부터 면접 준비", owner: "쥐" },
    });
    expect(added.status).toBe(200);
    expect(added.respond.goalMemos).toHaveLength(1);
    expect(added.respond.goalMemos[0].owner).toBe("햄");
    expect(added.respond.goalMemos[0].text).toBe("다음 달부터 면접 준비");

    const memoId = added.respond.goalMemos[0].id;
    const updated = b.post({
      action: "updateGoalMemo",
      name: "햄",
      memoId,
      memo: { text: "면접 자료 스크랩" },
    });
    expect(updated.respond.goalMemos[0].text).toBe("면접 자료 스크랩");

    const deleted = b.post({ action: "deleteGoalMemo", name: "햄", memoId });
    expect(deleted.respond.goalMemos).toHaveLength(0);
  });

  it("빈 메모는 거부", () => {
    const b = memoBoard();
    expect(b.post({ action: "addGoalMemo", name: "햄", memo: { text: "  " } }).status).toBe(400);
  });

  it("친구의 메모는 수정/삭제할 수 없다", () => {
    const b = memoBoard();
    const added = b.post({ action: "addGoalMemo", name: "햄", memo: { text: "자격증" } });
    const memoId = added.respond.goalMemos[0].id;
    expect(
      b.post({ action: "updateGoalMemo", name: "쥐", memoId, memo: { text: "훔침" } }).status
    ).toBe(403);
    expect(b.post({ action: "deleteGoalMemo", name: "쥐", memoId }).status).toBe(403);
  });

  it("옛 형식 메모(제목/본문)는 텍스트로 마이그레이션, 승격된 메모는 버림", () => {
    const state = normalize({
      users: ["햄"],
      goalMemos: [
        { id: "m1", owner: "햄", title: "면접 준비", body: "다음 달부터", goalType: "daily" },
        { id: "m2", owner: "햄", title: "끝난 메모", convertedAt: "2026-07-01T00:00:00Z" },
      ],
    });
    expect(state.goalMemos).toHaveLength(1);
    expect(state.goalMemos[0].text).toBe("면접 준비 — 다음 달부터");
  });
});

describe("가장 큰 목표", () => {
  it("사용자마다 하나만 저장하고 다시 쓰면 수정한다", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    b.post({ action: "join", name: "쥐" });

    const first = b.post({
      action: "setBigGoal",
      name: "햄",
      text: "건강하고 단단한 사람이 되기",
      owner: "쥐",
    });
    expect(first.status).toBe(200);
    expect(first.respond.bigGoals).toHaveLength(1);
    expect(first.respond.bigGoals[0].owner).toBe("햄");

    const updated = b.post({
      action: "setBigGoal",
      name: "햄",
      text: "매일 성장하는 사람이 되기",
    });
    expect(updated.respond.bigGoals).toHaveLength(1);
    expect(updated.respond.bigGoals[0].text).toBe("매일 성장하는 사람이 되기");

    const friend = b.post({
      action: "setBigGoal",
      name: "쥐",
      text: "좋은 관계를 오래 지키기",
    });
    expect(friend.respond.bigGoals).toHaveLength(2);
  });

  it("빈 목표는 저장하지 않는다", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    expect(b.post({ action: "setBigGoal", name: "햄", text: "  " }).status).toBe(400);
  });
});

describe("인생 운영 시스템", () => {
  function lifeBoard() {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    b.post({ action: "join", name: "쥐" });
    return b;
  }

  it("개인 헌법과 인생 영역은 사용자별로 저장된다", () => {
    const b = lifeBoard();
    const profile = b.post({
      action: "setLifeProfile",
      name: "햄",
      profile: { identity: "단단하고 다정한 사람", values: "정직, 성장", owner: "쥐" },
    });
    expect(profile.status).toBe(200);
    expect(profile.respond.lifeProfiles[0].owner).toBe("햄");

    const domain = b.post({
      action: "setLifeDomain",
      name: "햄",
      domain: { key: "health", score: 4, current: "주 2회 운동", desired: "지치지 않는 체력" },
    });
    expect(domain.respond.lifeDomains[0]).toMatchObject({ owner: "햄", key: "health", score: 4 });
  });

  it("현재 12주 시즌은 사용자마다 하나이며 프로젝트를 연결할 수 있다", () => {
    const b = lifeBoard();
    const seasonResult = b.post({
      action: "setSeason",
      name: "햄",
      season: {
        title: "체력과 커리어 기반",
        outcomes: "5km 완주, 포트폴리오 완성",
        startDate: seoulToday(),
        endDate: shiftDate(seoulToday(), 83),
      },
    });
    const season = seasonResult.respond.seasons[0];
    expect(season.owner).toBe("햄");

    const itemResult = b.post({
      action: "addLifeItem",
      name: "햄",
      item: { title: "포트폴리오 완성", kind: "project", domainKey: "work", seasonId: season.id },
    });
    expect(itemResult.respond.lifeItems[0]).toMatchObject({
      owner: "햄",
      kind: "project",
      seasonId: season.id,
    });

    const closed = b.post({ action: "closeSeason", name: "햄" });
    expect(closed.respond.seasons[0].status).toBe("completed");
    const next = b.post({
      action: "setSeason",
      name: "햄",
      season: { title: "다음 시즌", outcomes: "새로운 결과" },
    });
    expect(next.respond.seasons).toHaveLength(2);
  });

  it("주간·월간 복기는 같은 기간에 다시 저장하면 갱신된다", () => {
    const b = lifeBoard();
    const weekStart = seoulWeekDates()[0];
    b.post({ action: "setWeeklyReview", name: "햄", review: { weekStart, wins: "운동 2회" } });
    const weekly = b.post({
      action: "setWeeklyReview",
      name: "햄",
      review: { weekStart, wins: "운동 3회", priority: "수면 회복" },
    });
    expect(weekly.respond.weeklyReviews).toHaveLength(1);
    expect(weekly.respond.weeklyReviews[0].wins).toBe("운동 3회");

    const month = seoulToday().slice(0, 7);
    b.post({ action: "setMonthlyReview", name: "햄", review: { month, improvement: "체력" } });
    const monthly = b.post({
      action: "setMonthlyReview",
      name: "햄",
      review: { month, improvement: "체력과 집중력" },
    });
    expect(monthly.respond.monthlyReviews).toHaveLength(1);
  });

  it("결정 기록의 결과는 작성자만 수정할 수 있다", () => {
    const b = lifeBoard();
    const added = b.post({
      action: "addDecision",
      name: "햄",
      decision: { title: "이직 준비 시작", reason: "성장 환경이 필요해서" },
    });
    const id = added.respond.decisions[0].id;
    expect(b.post({ action: "updateDecision", name: "쥐", decisionId: id, result: "침범" }).status).toBe(403);
    const updated = b.post({
      action: "updateDecision",
      name: "햄",
      decisionId: id,
      result: "3개월 뒤 면접 두 곳 진행",
    });
    expect(updated.respond.decisions[0].result).toContain("면접");
  });

  it("친구의 시즌 항목과 목표 연결은 수정할 수 없다", () => {
    const { b, goal } = twoUsers();
    const item = b.post({
      action: "addLifeItem",
      name: "햄",
      item: { title: "운동 프로젝트", kind: "project" },
    }).respond.lifeItems[0];
    expect(b.post({ action: "updateLifeItem", name: "쥐", itemId: item.id, status: "completed" }).status).toBe(403);
    expect(b.post({ action: "updateGoalContext", name: "쥐", goalId: goal.id, domainKey: "health" }).status).toBe(403);
  });
});

describe("리마인더 카운트", () => {
  it("매일 목표 미체크만 카운트하고 기존 weekly 데이터는 무시", () => {
    const today = seoulToday();
    const state = normalize({
      users: ["햄"],
      goals: [
        { id: "d1", owner: "햄", title: "a", type: "daily" },
        { id: "w1", owner: "햄", title: "b", type: "weekly", targetPerWeek: 1 },
        { id: "m1", owner: "햄", title: "c", type: "milestone", target: 5 },
      ],
    });
    expect(countMissedToday(state, "햄", today)).toBe(1);
  });

  it("아침 응원 카운트는 매일 목표 수만 센다", () => {
    const state = normalize({
      users: ["햄", "쥐"],
      goals: [
        { id: "d1", owner: "햄", title: "a", type: "daily" },
        { id: "d2", owner: "햄", title: "b", type: "daily" },
        { id: "m1", owner: "햄", title: "c", type: "milestone", target: 5 },
        { id: "d3", owner: "쥐", title: "d", type: "daily" },
      ],
    });
    expect(countTodayGoals(state, "햄")).toBe(2);
    expect(countTodayGoals(state, "쥐")).toBe(1);
  });

  it("weekly 타입으로 새 목표를 보내도 daily로 생성", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    const r = b.post({
      action: "addGoal",
      name: "햄",
      goal: { title: "예전 주간 목표", type: "weekly", targetPerWeek: 3 },
    });
    expect(r.respond.goals[0].type).toBe("daily");
    expect(r.respond.goals[0].targetPerWeek).toBeUndefined();
  });
});
