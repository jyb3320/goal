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
  const t1 = b.post({ action: "join", name: "햄" }).respond.token;
  const t2 = b.post({ action: "join", name: "쥐" }).respond.token;
  const goal = b.post({ action: "addGoal", name: "햄", token: t1, goal: { title: "달리기" } })
    .respond.goals[0];
  return { b, t1, t2, goal };
}

describe("인증", () => {
  it("join 시 비밀코드 발급, 2명 제한", () => {
    const b = freshBoard();
    const r1 = b.post({ action: "join", name: "햄" });
    expect(r1.status).toBe(200);
    expect(r1.respond.token).toMatch(/^[A-Z2-9]{6}$/);
    expect(b.post({ action: "join", name: "쥐" }).status).toBe(200);
    const r3 = b.post({ action: "join", name: "셋째" });
    expect(r3.status).toBe(403);
    expect(r3.respond.error).toBe("full");
  });

  it("맞는 코드로 재접속 가능, 틀리면 거부", () => {
    const b = freshBoard();
    const token = b.post({ action: "join", name: "햄" }).respond.token;
    expect(b.post({ action: "join", name: "햄", token }).status).toBe(200);
    const bad = b.post({ action: "join", name: "햄", token: "WRONG9" });
    expect(bad.status).toBe(403);
    expect(bad.respond.error).toBe("code");
  });

  it("토큰 없이는 어떤 액션도 불가 (이름 사칭 차단)", () => {
    const b = freshBoard();
    b.post({ action: "join", name: "햄" });
    const r = b.post({ action: "addGoal", name: "햄", goal: { title: "달리기" } });
    expect(r.status).toBe(401);
  });

  it("응답에 토큰/푸시 구독이 새지 않음", () => {
    const b = freshBoard();
    const r = b.post({ action: "join", name: "햄" });
    expect(r.respond.tokens).toBeUndefined();
    expect(r.respond.push).toBeUndefined();
  });
});

describe("소유권과 날짜 검증", () => {
  it("남의 목표에 도장 불가", () => {
    const { b, t2, goal } = twoUsers();
    const r = b.post({
      action: "toggleCheckin", name: "쥐", token: t2, goalId: goal.id, date: seoulToday(),
    });
    expect(r.status).toBe(403);
  });

  it("오늘/어제 도장만 허용 (소급 조작 차단)", () => {
    const { b, t1, goal } = twoUsers();
    const old = b.post({
      action: "toggleCheckin", name: "햄", token: t1, goalId: goal.id, date: shiftDate(seoulToday(), -5),
    });
    expect(old.status).toBe(400);
    const ok = b.post({
      action: "toggleCheckin", name: "햄", token: t1, goalId: goal.id, date: seoulToday(),
    });
    expect(ok.status).toBe(200);
    expect(ok.respond.checkins).toHaveLength(1);
  });

  it("남의 목표 삭제 불가", () => {
    const { b, t2, goal } = twoUsers();
    expect(b.post({ action: "deleteGoal", name: "쥐", token: t2, goalId: goal.id }).status).toBe(403);
  });

  it("자기 목표에 응원 불가, 친구는 가능 (by는 서버가 강제)", () => {
    const { b, t1, t2, goal } = twoUsers();
    expect(
      b.post({ action: "toggleReaction", name: "햄", token: t1, goalId: goal.id, emoji: "🔥" }).status
    ).toBe(403);
    const r = b.post({
      action: "toggleReaction", name: "쥐", token: t2, goalId: goal.id, emoji: "🔥", by: "햄",
    });
    expect(r.status).toBe(200);
    expect(r.respond.reactions[0].by).toBe("쥐");
  });

  it("메시지 발신자는 서버가 강제", () => {
    const { b, t2 } = twoUsers();
    const r = b.post({ action: "addMessage", name: "쥐", token: t2, text: "화이팅", from: "햄" });
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

describe("리마인더 카운트", () => {
  it("매일 목표 미체크는 카운트, 주간 목표는 달성/오늘 체크 시 제외", () => {
    const today = seoulToday();
    const state = normalize({
      users: ["햄"],
      goals: [
        { id: "d1", owner: "햄", title: "a", type: "daily" },
        { id: "w1", owner: "햄", title: "b", type: "weekly", targetPerWeek: 1 },
        { id: "m1", owner: "햄", title: "c", type: "milestone", target: 5 },
      ],
      checkins: [{ goalId: "w1", date: today }],
    });
    expect(countMissedToday(state, "햄", today)).toBe(1);
  });
});
