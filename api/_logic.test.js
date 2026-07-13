import { describe, it, expect } from "vitest";
import {
  handlePost,
  normalize,
  compact,
  seoulToday,
  shiftDate,
  countMissedToday,
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
