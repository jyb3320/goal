export const XP_REWARDS = Object.freeze({
  DAILY_GOAL_COMPLETE: 5,
  PERIOD_GOAL_PROGRESS: 3,
  PERIOD_GOAL_COMPLETE: 15,
  CHEER_SENT: 1,
  CHEER_REPLY: 1,
  FAILURE_REASON_RECORDED: 2,
  WEEKLY_REVIEW_COMPLETED: 5,
  SHARED_DAILY_COMPLETE: 5,
});

export const XP_DAILY_CAPS = Object.freeze({
  SOCIAL_INTERACTION: 3,
});

export const SHARED_DAILY_RULE = "ALL_DUE_DAILY_GOALS";
export const APP_TIME_ZONE = "Asia/Seoul";
export const VILLAGE_ID = "goaltracker";

// 개인 레벨은 기존 공식(25 * (레벨 - 1) * 레벨)을 유지한다.
export const VILLAGE_LEVEL_THRESHOLDS = Object.freeze([0, 30, 80, 150, 240, 350]);

export const XP_EVENT_LABELS = Object.freeze({
  LEGACY_MIGRATION: "기존 XP 이어받기",
  DAILY_GOAL_COMPLETE: "매일 목표 완료",
  PERIOD_GOAL_PROGRESS: "기간 목표를 한 걸음 진행",
  PERIOD_GOAL_COMPLETE: "기간 목표 완료",
  CHEER_SENT: "친구에게 응원 보내기",
  POKE_SENT: "친구 집 문 두드리기",
  CHEER_REPLY: "받은 응원에 답장하기",
  FAILURE_REASON_RECORDED: "오늘 어려웠던 점 기록",
  WEEKLY_REVIEW_COMPLETED: "이번 주 돌아보기",
  SHARED_DAILY_COMPLETE: "둘이 오늘의 약속 완료",
});
