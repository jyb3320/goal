import { DOW, todayStr, weekDates } from "./dates.js";

export const REPEAT_TYPES = [
  ["daily", "매일"],
  ["weekdays", "특정 요일"],
  ["weekly", "주 N회"],
  ["biweekly", "격주"],
  ["monthly", "월 N회"],
  ["custom", "사용자 지정"],
  ["none", "반복 없음"],
];

export const GOAL_KINDS = [
  ["routine", "루틴"],
  ["milestone", "기간 목표"],
  ["project", "프로젝트"],
  ["problem", "해결할 문제"],
];

export const GOAL_CLASSES = [
  ["behavior", "행동"],
  ["signal", "선행 신호"],
  ["outcome", "최종 결과"],
];

export function startOfWeek(dateStr = todayStr(0)) {
  const date = new Date(`${dateStr}T00:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekEnd(dateStr = todayStr(0)) {
  const start = new Date(`${startOfWeek(dateStr)}T00:00:00`);
  start.setDate(start.getDate() + 6);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function goalKind(goal) {
  if (goal.kind) return goal.kind;
  return goal.type === "milestone" ? "milestone" : "routine";
}

export function repeatTypeOf(goal) {
  if (goal.repeatType) return goal.repeatType;
  return goal.type === "milestone" ? "none" : "daily";
}

export function isGoalDueOn(goal, dateStr = todayStr(0)) {
  if (!goal || goal.status === "paused" || goal.status === "failed") return false;
  if (goal.startDate && dateStr < goal.startDate) return false;
  if (goal.deadline && dateStr > goal.deadline && goalKind(goal) === "routine") return false;
  if (goal.scheduledDate === dateStr) return true;
  const repeat = repeatTypeOf(goal);
  if (repeat === "none") return goal.scheduledDate === dateStr || goal.createdAt === dateStr;
  if (repeat === "daily" || repeat === "weekly") return true;
  const dow = new Date(`${dateStr}T00:00:00`).getDay();
  if (repeat === "weekdays") return (goal.repeatDays || []).map(Number).includes(dow);
  if (repeat === "biweekly") {
    const base = new Date(`${goal.startDate || goal.createdAt || dateStr}T00:00:00`);
    const cur = new Date(`${dateStr}T00:00:00`);
    const weeks = Math.floor((cur - base) / 604800000);
    const allowed = (goal.repeatDays || [base.getDay()]).map(Number).includes(dow);
    return weeks >= 0 && weeks % 2 === 0 && allowed;
  }
  if (repeat === "monthly") return true;
  if (repeat === "custom") return (goal.customDates || []).includes(dateStr);
  return true;
}

export function repeatLabel(goal) {
  const repeat = repeatTypeOf(goal);
  if (repeat === "daily") return "매일";
  if (repeat === "weekdays") {
    const labels = (goal.repeatDays || []).map((day) => DOW[Number(day)]).filter(Boolean);
    return labels.length ? `${labels.join("·")} 반복` : "요일 선택";
  }
  if (repeat === "weekly") return `주 ${goal.repeatCount || 1}회`;
  if (repeat === "biweekly") return "격주";
  if (repeat === "monthly") return `월 ${goal.repeatCount || 1}회`;
  if (repeat === "custom") return "사용자 지정";
  return "반복 없음";
}

export function weekProgress(goal, checkins = [], dateStr = todayStr(0)) {
  const days = weekDates(0);
  const count = checkins.filter((item) => item.goalId === goal.id && days.includes(item.date)).length;
  const repeat = repeatTypeOf(goal);
  let target = 1;
  if (repeat === "daily") target = 7;
  if (repeat === "weekdays") target = Math.max(1, new Set((goal.repeatDays || []).map(Number)).size);
  if (repeat === "weekly" || repeat === "monthly") target = Math.max(1, goal.repeatCount || 1);
  if (repeat === "biweekly" || repeat === "custom") {
    target = Math.max(1, days.filter((day) => isGoalDueOn(goal, day)).length);
  }
  return { count, target, pct: Math.min(100, Math.round((count / target) * 100)) };
}

export function formatDeadline(deadline) {
  if (!deadline) return "기한 없음";
  const [, month, day] = deadline.split("-");
  return `${Number(month)}월 ${Number(day)}일까지`;
}
