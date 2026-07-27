import { VILLAGE_ID, VILLAGE_LEVEL_THRESHOLDS, XP_EVENT_LABELS } from "../../shared/xp-config.js";

export function personalXp(user, state) {
  return (state.xpEvents || []).filter((event) =>
    event.recipientType === "USER" && event.recipientId === user
  ).reduce((sum, event) => sum + event.xpAmount, 0);
}

export const computeXP = personalXp;

export function villageXp(state) {
  return (state.xpEvents || []).filter((event) =>
    event.recipientType === "VILLAGE" && event.recipientId === VILLAGE_ID
  ).reduce((sum, event) => sum + event.xpAmount, 0);
}

export function xpForLevel(level) {
  return 25 * (level - 1) * level;
}

export function levelOf(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

function villageThreshold(level) {
  const index = Math.max(0, level - 1);
  if (index < VILLAGE_LEVEL_THRESHOLDS.length) return VILLAGE_LEVEL_THRESHOLDS[index];
  const extra = index - VILLAGE_LEVEL_THRESHOLDS.length + 1;
  return VILLAGE_LEVEL_THRESHOLDS.at(-1) + extra * (120 + extra * 20);
}

export function villageLevelOf(xp) {
  let level = 1;
  while (xp >= villageThreshold(level + 1)) level++;
  return level;
}

export function userXpSummary(user, state) {
  const xp = personalXp(user, state);
  const level = levelOf(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { xp, level, base, next, intoLevel: xp - base, needed: next - base, remaining: next - xp };
}

export function villageXpSummary(state) {
  const xp = villageXp(state);
  const level = villageLevelOf(xp);
  const base = villageThreshold(level);
  const next = villageThreshold(level + 1);
  return { xp, level, base, next, intoLevel: xp - base, needed: next - base, remaining: next - xp };
}

export function recentXpEvents(state, recipientType, recipientId, limit = 8) {
  return (state.xpEvents || []).filter((event) =>
    event.recipientType === recipientType && event.recipientId === recipientId
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
    .map((event) => ({ ...event, label: XP_EVENT_LABELS[event.eventType] || event.eventType }));
}

const UNLOCKS = [
  [2, "새싹 머리띠"],
  [3, "반짝 스카프"],
  [5, "목도리"],
  [7, "망토"],
  [10, "왕관"],
];

export function nextUnlock(level) {
  return UNLOCKS.find(([lv]) => lv > level) || null;
}
