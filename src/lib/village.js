import { computeStreak, ddayLabel, todayStr, weekDates } from "./dates.js";
import { computeXP, levelOf } from "./xp.js";

const isVisibleGoal = (goal) => goal.status !== "failed";

function progressTotal(progress, goalId) {
  return Math.max(0, progress.filter((item) => item.goalId === goalId).reduce((sum, item) => sum + item.amount, 0));
}

function isoTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function completionDate(goal, progress) {
  if (goal.completedAt) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(goal.completedAt));
  }
  return progress
    .filter((item) => item.goalId === goal.id)
    .map((item) => item.date)
    .sort()
    .at(-1) || "";
}

function userStatus(user, state, today, currentWeek, previousWeek, checkinSet) {
  if (!user) return null;
  const goals = state.goals.filter((goal) => goal.owner === user && isVisibleGoal(goal));
  const daily = goals.filter((goal) => goal.type !== "milestone" && (!goal.createdAt || goal.createdAt.slice(0, 10) <= today));
  const milestone = goals.filter((goal) => goal.type === "milestone");
  const doneToday = daily.filter((goal) => checkinSet.has(`${goal.id}_${today}`));
  const completedMilestones = milestone.filter((goal) => goal.status === "completed");
  const recentDaily = state.checkins
    .filter((item) => goals.some((goal) => goal.id === item.goalId))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const recentMilestone = completedMilestones
    .map((goal) => ({ goal, date: completionDate(goal, state.progress) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const recentGoal = recentMilestone && (!recentDaily || recentMilestone.date >= recentDaily.date)
    ? recentMilestone.goal
    : goals.find((goal) => goal.id === recentDaily?.goalId) || null;
  const activeMilestones = milestone
    .filter((goal) => goal.status !== "completed")
    .map((goal) => ({
      goal,
      current: progressTotal(state.progress, goal.id),
      dday: ddayLabel(goal.deadline),
    }))
    .sort((a, b) => {
      if (!a.goal.deadline) return 1;
      if (!b.goal.deadline) return -1;
      return a.goal.deadline.localeCompare(b.goal.deadline);
    });
  const streaks = daily
    .map((goal) => ({ goal, days: computeStreak(goal.id, checkinSet) }))
    .filter((item) => item.days > 0)
    .sort((a, b) => b.days - a.days);

  const weekSummary = (days) => {
    const elapsed = days.filter((date) => date <= today);
    let possible = 0;
    let completed = 0;
    for (const goal of daily) {
      for (const date of elapsed) {
        if (goal.createdAt && goal.createdAt.slice(0, 10) > date) continue;
        possible++;
        if (checkinSet.has(`${goal.id}_${date}`)) completed++;
      }
    }
    return { completed, possible, rate: possible ? Math.round((completed / possible) * 100) : 0 };
  };

  return {
    user,
    goals,
    daily,
    doneToday: doneToday.length,
    totalToday: daily.length,
    remainingToday: Math.max(0, daily.length - doneToday.length),
    activeToday: doneToday.length > 0,
    allDoneToday: daily.length > 0 && doneToday.length === daily.length,
    recentGoal,
    nearestMilestone: activeMilestones[0] || null,
    representativeStreak: streaks[0] || null,
    activeMilestones,
    completedMilestones: completedMilestones.length,
    week: weekSummary(currentWeek),
    previousWeek: weekSummary(previousWeek),
    xp: computeXP(user, state),
    level: levelOf(computeXP(user, state)),
  };
}

function mailboxEvents(state, me, otherName) {
  if (!otherName) return [];
  const myGoalIds = new Set(state.goals.filter((goal) => goal.owner === me).map((goal) => goal.id));
  const goalTitles = new Map(state.goals.map((goal) => [goal.id, goal.title]));
  const reactions = state.reactions
    .filter((item) => item.by === otherName && myGoalIds.has(item.goalId))
    .map((item) => ({
      key: `reaction_${item.goalId}_${item.date}_${item.emoji}`,
      sort: `${item.date}T12:00:00`,
      type: "응원",
      text: `${goalTitles.get(item.goalId) || "목표"}에 ${item.emoji}`,
    }));
  const pokes = state.pokes
    .filter((item) => item.from === otherName)
    .map((item) => ({
      key: item.id,
      sort: item.at || `${item.date}T12:00:00`,
      type: "문 두드리기",
      text: `${otherName}이(가) 오늘의 문을 두드렸어요.`,
    }));
  const messages = state.messages
    .filter((item) => item.from === otherName)
    .map((item) => ({
      key: item.id,
      sort: item.createdAt,
      type: "쪽지",
      text: item.text,
    }));
  return [...reactions, ...pokes, ...messages].sort((a, b) => isoTime(b.sort) - isoTime(a.sort));
}

export function buildVillageStatus(state, me, otherName, today = todayStr(0)) {
  const checkinSet = new Set(state.checkins.map((item) => `${item.goalId}_${item.date}`));
  const currentWeek = weekDates(0);
  const previousWeek = weekDates(-1);
  const mine = userStatus(me, state, today, currentWeek, previousWeek, checkinSet);
  const friend = userStatus(otherName, state, today, currentWeek, previousWeek, checkinSet);
  const bothActiveDays = currentWeek.filter((date) => {
    if (date > today || !friend) return false;
    const mineDone = mine.goals.some((goal) => checkinSet.has(`${goal.id}_${date}`));
    const friendDone = friend.goals.some((goal) => checkinSet.has(`${goal.id}_${date}`));
    return mineDone && friendDone;
  }).length;
  const sharedThisWeek = mine.week.completed + (friend?.week.completed || 0);
  const sharedLastWeek = mine.previousWeek.completed + (friend?.previousWeek.completed || 0);
  const memos = state.goalMemos
    .filter((memo) => memo.owner === me)
    .sort((a, b) => isoTime(b.updatedAt || b.createdAt) - isoTime(a.updatedAt || a.createdAt));
  const activeMilestones = [...mine.activeMilestones, ...(friend?.activeMilestones || [])]
    .sort((a, b) => {
      if (!a.goal.deadline) return 1;
      if (!b.goal.deadline) return -1;
      return a.goal.deadline.localeCompare(b.goal.deadline);
    });
  const events = mailboxEvents(state, me, otherName);
  const monthPrefix = today.slice(0, 7);
  const myGoalIds = new Set(mine.goals.map((goal) => goal.id));
  const recordedDays = new Set(
    state.checkins.filter((item) => myGoalIds.has(item.goalId) && item.date.startsWith(monthPrefix)).map((item) => item.date)
  ).size;
  const completedThisMonth =
    state.checkins.filter((item) => myGoalIds.has(item.goalId) && item.date.startsWith(monthPrefix)).length +
    mine.goals.filter((goal) => goal.type === "milestone" && completionDate(goal, state.progress).startsWith(monthPrefix)).length;
  const reviews = [
    ...state.weeklyReviews.filter((item) => item.owner === me).map((item) => ({ ...item, sort: item.updatedAt || item.createdAt || item.weekStart, kind: "주간 복기" })),
    ...state.monthlyReviews.filter((item) => item.owner === me).map((item) => ({ ...item, sort: item.updatedAt || item.createdAt || item.month, kind: "월간 복기" })),
  ].sort((a, b) => isoTime(b.sort) - isoTime(a.sort));
  const failures = state.goals
    .filter((goal) => goal.owner === me && goal.failureReason)
    .map((goal) => ({ text: goal.failureReason, sort: goal.failedAt || goal.failedDate || "", kind: "실패 이유" }));
  const recentReflection = [...reviews, ...failures].sort((a, b) => isoTime(b.sort) - isoTime(a.sort))[0] || null;
  const difficultyCounts = new Map();
  for (const item of state.excuses.filter((entry) => entry.owner === me)) {
    const key = item.text.trim();
    if (key) difficultyCounts.set(key, (difficultyCounts.get(key) || 0) + 1);
  }
  const commonDifficulty = [...difficultyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  return {
    today,
    mine,
    friend,
    bothActiveToday: !!friend && mine.activeToday && friend.activeToday,
    bothActiveDays,
    sharedThisWeek,
    sharedLastWeek,
    sharedDelta: sharedThisWeek - sharedLastWeek,
    activeMilestones,
    completedMilestones: mine.completedMilestones + (friend?.completedMilestones || 0),
    memos,
    seedStage: memos.length === 0 ? 0 : memos.length < 3 ? 1 : 2,
    mailbox: { events, total: events.length },
    archive: {
      recordedDays,
      completedThisMonth,
      recentReflection,
      commonDifficulty,
      hasWeeklyReview: state.weeklyReviews.some((item) => item.owner === me && item.weekStart === currentWeek[0]),
      bookStage: reviews.length + failures.length === 0 ? 0 : reviews.length + failures.length < 4 ? 1 : 2,
    },
  };
}
