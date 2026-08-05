import { fmtDate } from "./dates.js";
import { goalKind, isGoalDueOn, repeatTypeOf, startOfWeek } from "./goals.js";

export function calendarMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const cursor = new Date(year, monthIndex, 1 - first.getDay());
  return Array.from({ length: 42 }, () => {
    const date = fmtDate(cursor);
    const cell = { date, day: cursor.getDate(), inMonth: cursor.getMonth() === monthIndex };
    cursor.setDate(cursor.getDate() + 1);
    return cell;
  });
}

function activeOn(goal, date) {
  if (goal.status === "failed" || goal.status === "paused") return false;
  if (goal.startDate && date < goal.startDate) return false;
  if (goal.deadline && date > goal.deadline) return false;
  return true;
}

function routineScheduledOn(goal, date) {
  if (!activeOn(goal, date)) return false;
  if (goal.scheduledDate === date) return true;
  if (goal.scheduledWeek === startOfWeek(date) && date === goal.scheduledWeek) return true;
  const repeat = repeatTypeOf(goal);
  if (repeat === "none") return goal.startDate === date;
  if (["daily", "weekdays", "biweekly", "custom"].includes(repeat)) return isGoalDueOn(goal, date);
  if (repeat === "weekly") return new Date(`${date}T00:00:00`).getDay() === 1;
  if (repeat === "monthly") return new Date(`${date}T00:00:00`).getDate() === 1;
  return false;
}

export function calendarItemsForDate(goals = [], date, checkins = []) {
  const checked = new Set(checkins.filter((item) => item.date === date).map((item) => item.goalId));
  const items = [];

  for (const goal of goals) {
    const kind = goalKind(goal);
    const isDeadline = Boolean(goal.deadline && goal.deadline === date);
    const scheduled = kind === "routine" ? routineScheduledOn(goal, date) : goal.scheduledDate === date || goal.scheduledWeek === date;
    if (scheduled || isDeadline) {
      items.push({
        id: `${goal.id}:${date}`,
        goalId: goal.id,
        goal,
        owner: goal.owner,
        title: goal.title,
        time: goal.executionTime || "",
        kind,
        deadline: isDeadline,
        done: goal.status === "completed" || checked.has(goal.id),
        source: "goal",
      });
    }

    for (const task of goal.subtasks || []) {
      const taskDeadline = Boolean(task.deadline && task.deadline === date);
      if (task.scheduledDate !== date && !taskDeadline) continue;
      items.push({
        id: `${goal.id}:${task.id}:${date}`,
        goalId: goal.id,
        goal,
        owner: goal.owner,
        title: task.title,
        parentTitle: goal.title,
        time: task.executionTime || "",
        kind: "task",
        deadline: taskDeadline,
        done: Boolean(task.done),
        source: "task",
      });
    }
  }

  return items.sort((a, b) => {
    if (a.time !== b.time) return a.time ? (b.time ? a.time.localeCompare(b.time) : -1) : 1;
    if (a.deadline !== b.deadline) return a.deadline ? -1 : 1;
    return a.title.localeCompare(b.title, "ko");
  });
}
