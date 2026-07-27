import {
  APP_TIME_ZONE,
  SHARED_DAILY_RULE,
  VILLAGE_ID,
  XP_DAILY_CAPS,
  XP_REWARDS,
} from "../shared/xp-config.js";

const SOCIAL_TYPES = new Set(["CHEER_SENT", "POKE_SENT", "CHEER_REPLY"]);

function id(prefix = "xp") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAppDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(date);
}

export function getAppWeekKey(dateKey = getAppDateKey()) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function socialXpToday(state, recipientId, dateKey) {
  return state.xpEvents
    .filter((event) =>
      event.recipientType === "USER" &&
      event.recipientId === recipientId &&
      event.dateKey === dateKey &&
      SOCIAL_TYPES.has(event.eventType)
    )
    .reduce((sum, event) => sum + event.xpAmount, 0);
}

export function awardXp(state, input) {
  if (state.xpEvents.some((event) => event.dedupeKey === input.dedupeKey)) {
    return { awarded: false, reason: "duplicate" };
  }
  if (
    input.recipientType === "USER" &&
    SOCIAL_TYPES.has(input.eventType) &&
    socialXpToday(state, input.recipientId, input.dateKey) >= XP_DAILY_CAPS.SOCIAL_INTERACTION
  ) {
    return { awarded: false, reason: "daily_cap", capped: true };
  }
  const event = {
    id: id(),
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    xpAmount: input.amount,
    dedupeKey: input.dedupeKey,
    createdAt: new Date().toISOString(),
  };
  if (input.dateKey) event.dateKey = input.dateKey;
  if (input.weekKey) event.weekKey = input.weekKey;
  if (input.metadata) event.metadata = input.metadata;
  state.xpEvents.push(event);
  return { awarded: true, amount: event.xpAmount, event };
}

export function awardPersonalXp(state, input) {
  return awardXp(state, { ...input, recipientType: "USER" });
}

export function awardVillageXp(state, input) {
  return awardXp(state, { ...input, recipientType: "VILLAGE", recipientId: VILLAGE_ID });
}

export function checkAndAwardSharedDailyXp(state, dateKey) {
  if (state.users.length !== 2) return { awarded: false, reason: "needs_two_users" };
  const checked = new Set(state.checkins.map((item) => `${item.goalId}:${item.date}`));
  const qualifies = state.users.every((user) => {
    const due = state.goals.filter((goal) =>
      goal.owner === user &&
      goal.type === "daily" &&
      (!goal.createdAt || goal.createdAt <= dateKey)
    );
    if (due.length === 0) return false;
    if (SHARED_DAILY_RULE === "AT_LEAST_ONE_EACH") {
      return due.some((goal) => checked.has(`${goal.id}:${dateKey}`));
    }
    return due.every((goal) => checked.has(`${goal.id}:${dateKey}`));
  });
  if (!qualifies) return { awarded: false, reason: "condition_not_met" };
  return awardVillageXp(state, {
    eventType: "SHARED_DAILY_COMPLETE",
    sourceType: "DATE",
    sourceId: dateKey,
    dateKey,
    amount: XP_REWARDS.SHARED_DAILY_COMPLETE,
    dedupeKey: `shared-daily:${VILLAGE_ID}:${dateKey}`,
  });
}

export { XP_REWARDS };
