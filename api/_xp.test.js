import { describe, expect, it } from "vitest";
import { handlePost, normalize, seoulToday, shiftDate } from "./_logic.js";

function board(raw = null) {
  let value = raw;
  return {
    post(body) {
      const out = handlePost(value, body);
      if (out.write) value = out.state;
      return out;
    },
    state() {
      return normalize(value);
    },
  };
}

function joined() {
  const app = board();
  app.post({ action: "join", name: "햄" });
  app.post({ action: "join", name: "쥐" });
  return app;
}

describe("XP 이벤트 원장", () => {
  it("기존 계산 XP를 사용자 개인 XP 이벤트로 보존한다", () => {
    const state = normalize({
      users: ["햄"],
      goals: [{ id: "g1", owner: "햄", type: "daily" }],
      checkins: [{ goalId: "g1", date: "2026-07-20" }],
      archive: { 햄: { stamps: 2 } },
    });
    const legacy = state.xpEvents.find((event) => event.eventType === "LEGACY_MIGRATION");
    expect(legacy.xpAmount).toBe(30);
    expect(legacy.recipientType).toBe("USER");
    expect(state.xpVersion).toBe(1);
  });

  it("매일 목표는 날짜·목표별 한 번만 지급하고 재완료로 늘지 않는다", () => {
    const app = joined();
    const goal = app.post({ action: "addGoal", name: "햄", goal: { title: "달리기" } }).respond.goals[0];
    const date = seoulToday();
    app.post({ action: "toggleCheckin", name: "햄", goalId: goal.id, date });
    app.post({ action: "toggleCheckin", name: "햄", goalId: goal.id, date });
    app.post({ action: "toggleCheckin", name: "햄", goalId: goal.id, date });
    const events = app.state().xpEvents.filter((event) => event.eventType === "DAILY_GOAL_COMPLETE");
    expect(events).toHaveLength(1);
    expect(events[0].xpAmount).toBe(5);
  });

  it("둘의 당일 목표가 모두 끝난 최초 순간에만 마을 XP를 지급한다", () => {
    const app = joined();
    const a = app.post({ action: "addGoal", name: "햄", goal: { title: "A" } }).respond.goals.at(-1);
    const b = app.post({ action: "addGoal", name: "쥐", goal: { title: "B" } }).respond.goals.at(-1);
    const date = seoulToday();
    app.post({ action: "toggleCheckin", name: "햄", goalId: a.id, date });
    app.post({ action: "toggleCheckin", name: "쥐", goalId: b.id, date });
    app.post({ action: "toggleCheckin", name: "쥐", goalId: b.id, date });
    app.post({ action: "toggleCheckin", name: "쥐", goalId: b.id, date });
    expect(app.state().xpEvents.filter((event) => event.eventType === "SHARED_DAILY_COMPLETE")).toHaveLength(1);
  });

  it("기간 목표 진행은 하루 한 번, 최종 달성은 목표 전체에서 한 번 지급한다", () => {
    const app = joined();
    const goal = app.post({
      action: "addGoal",
      name: "햄",
      goal: { title: "책", type: "milestone", target: 2 },
    }).respond.goals.at(-1);
    app.post({ action: "addProgress", name: "햄", goalId: goal.id, amount: 1 });
    app.post({ action: "addProgress", name: "햄", goalId: goal.id, amount: 1 });
    app.post({ action: "addProgress", name: "햄", goalId: goal.id, amount: -1 });
    app.post({ action: "addProgress", name: "햄", goalId: goal.id, amount: 1 });
    const events = app.state().xpEvents;
    expect(events.filter((event) => event.eventType === "PERIOD_GOAL_PROGRESS")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "PERIOD_GOAL_COMPLETE")).toHaveLength(1);
  });

  it("응원과 콕은 합산 하루 3 XP까지만 주되 행동은 계속 저장한다", () => {
    const app = joined();
    const goal = app.post({ action: "addGoal", name: "쥐", goal: { title: "친구 목표" } }).respond.goals.at(-1);
    app.post({ action: "toggleReaction", name: "햄", goalId: goal.id, emoji: "🔥" });
    app.post({ action: "poke", name: "햄" });
    app.post({ action: "poke", name: "햄" });
    const capped = app.post({ action: "poke", name: "햄" });
    const social = app.state().xpEvents.filter((event) =>
      event.recipientId === "햄" && ["CHEER_SENT", "POKE_SENT", "CHEER_REPLY"].includes(event.eventType)
    );
    expect(social.reduce((sum, event) => sum + event.xpAmount, 0)).toBe(3);
    expect(capped.status).toBe(200);
    expect(capped.respond.xpAwards[0].capped).toBe(true);
  });

  it("답장·어려움 기록·주간 회고는 원본 단위로 한 번만 지급한다", () => {
    const app = joined();
    const message = app.post({ action: "addMessage", name: "쥐", text: "힘내" }).respond.messages.at(-1);
    app.post({ action: "addMessage", name: "햄", text: "고마워", replyToId: message.id });
    app.post({ action: "addMessage", name: "햄", text: "또 고마워", replyToId: message.id });

    const yesterday = shiftDate(seoulToday(), -1);
    const goal = app.post({ action: "addGoal", name: "햄", goal: { title: "물 마시기" } }).respond.goals.at(-1);
    goal.createdAt = yesterday;
    app.post({ action: "addExcuse", name: "햄", goalId: goal.id, text: "너무 바빴다" });
    app.post({ action: "addExcuse", name: "햄", goalId: goal.id, text: "수정" });

    const weekStart = shiftDate(seoulToday(), -((new Date(`${seoulToday()}T00:00:00Z`).getUTCDay() + 6) % 7));
    app.post({ action: "setWeeklyReview", name: "햄", review: { weekStart, wins: "해냈다" } });
    app.post({ action: "setWeeklyReview", name: "햄", review: { weekStart, wins: "수정했다" } });

    const events = app.state().xpEvents;
    expect(events.filter((event) => event.eventType === "CHEER_REPLY")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "FAILURE_REASON_RECORDED")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "WEEKLY_REVIEW_COMPLETED")).toHaveLength(1);
  });
});
